// The proposal engine.
//
// For any case this computes what to do next: the cheap thing the agent may do
// alone, and the decision it has to hand over. Deterministic — knowledge base
// crossed with the records. No model, so every proposal is reproducible and
// every sentence traces to a row.
//
// The brief's shape: "what happened, what the agent already found out, what it
// suggests, and a way to accept it or change it."
import { type Dataset, load } from './data'
import { type Finding, detect } from './detect'
import { type CaseContext, buildContext } from './context'
import { type Entry, KNOWLEDGE } from './knowledge'
import type { Signature } from './detect'

/** Who has to say yes. The brief: asking and looking up need no approval. */
export type Approval = 'AGENT_SENDS' | 'NEEDS_APPROVAL' | 'NEEDS_PERSON'

export type Cite = { label: string; table: string; id: string }

export type Proposal = {
  id: string
  command: string
  title: string
  /** Why this, in one line, from the records. */
  because: string
  approval: Approval
  approver: string | null
  /** Exactly what would be written if this is accepted. */
  payload: Record<string, unknown>
  /** Plain words: what changes and what explicitly does not. */
  changes: string[]
  unchanged: string[]
  cites: Cite[]
  withheld: string[]
  /** DRAFT is sendable text. SPEC is what the reply has to establish, when the
   *  wording is still the agent's job. Never show a SPEC as if it were a
   *  message to the driver. */
  draft: {
    kind: 'DRAFT' | 'SPEC'
    to: string
    language: string
    body: string
  } | null
  basis: Pick<Entry, 'id' | 'topic' | 'routing'> | null
}

/* ------------------------------------------------------------------ matching */

const STOP = new Set([
  'the','a','an','i','my','is','are','do','does','did','to','for','of','in','on',
  'it','this','that','and','or','if','what','when','where','how','who','be','was',
  'have','has','will','would','can','could','should','me','you','we','us','not',
  'but','so','at','from','with','about','there','here','they','them','still','any',
])

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-zäöüåæø0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )
}

/** Best knowledge entry for a driver's message, or null if nothing is close. */
export function matchEntry(message: string, market: string | null): Entry | null {
  const want = terms(message)
  if (want.size === 0) return null
  let best: { entry: Entry; score: number; total: number } | null = null
  for (const entry of KNOWLEDGE) {
    if (entry.market !== 'ALL' && market && entry.market !== market) continue
    let score = 0
    let total = 0
    for (const trigger of entry.triggers) {
      const have = terms(trigger)
      if (!have.size) continue
      let hits = 0
      for (const t of have) if (want.has(t)) hits++
      total += hits
      // Two overlapping terms minimum. One shared word is a coincidence, and a
      // confidently wrong answer is worse than none: "I need rest before the
      // next pickup" shares "need" with "How do I reach you?".
      if (hits >= 2) score = Math.max(score, hits / have.size)
    }
    if (score === 0) continue
    // A short trigger can be fully covered by two generic words, so ties go to
    // the entry whose whole trigger set the message overlaps most. "Which job
    // do I follow" should beat "How do I start the pickup".
    const better =
      !best || score > best.score || (score === best.score && total > best.total)
    if (better) best = { entry, score, total }
  }
  return best && best.score >= 0.5 ? best.entry : null
}

/** Incident kinds need their own handling; "a person must decide" is not one script. */
const INCIDENT_PLANS: Record<string, string> = {
  VEHICLE_WARNING: 'driver.request_safe_stop_details',
  TRAVEL_CAPACITY: 'travel.verify_booking_outcome',
  EMPTY_PICKUP: 'pickup.reconcile_identity',
  POST_DELIVERY_CONDITION_CLAIM: 'condition.gather_evidence',
}

/* ----------------------------------------------------------------- templates */

type Plan = {
  command: string
  title: (c: CaseContext) => string
  approval: Approval
  approver: string | null
  changes: string[]
  unchanged: string[]
  body?: (c: CaseContext) => string
  payload?: Record<string, unknown>
  /** Restricts the plan to one incident kind, where the signature is broader. */
  onlyIncident?: string
}

/** The order a case speaks in: unknowable before merely unfinished. */
const PRIORITY: Signature[] = [
  'unknown-outcome',
  'needs-human',
  'cannot-be-filed',
  'authority-gap',
  'rejected-evidence',
  'stale-signal',
  'custody-open',
  'person-multiplexing',
  'open-incident',
  'unapproved-promise',
  'approved-not-done',
  'awaiting-review',
  'open-work-item',
  'split-across-systems',
  'multiple-open-threads',
  'ownerless',
]

/** One plan per signature. The agent's cheap moves first. */
const PLANS: Partial<Record<Signature, Plan>> = {
  'cannot-be-filed': {
    command: 'driver.request_job_reference',
    title: (c) => `Ask ${first(c)} which job they mean`,
    approval: 'AGENT_SENDS',
    approver: null,
    changes: ['Sends one message asking for the job reference and a screenshot.'],
    unchanged: [
      'Files the message against an order — candidate matches stay hypotheses.',
      'Confirms any pickup time.',
    ],
    body: (c) =>
      `You have more than one upcoming assignment, so I cannot tell which job this is about. Please send the job reference and a screenshot of the message you received. Do not set off on the strength of this chat alone.`,
    payload: { link_order: false, await: 'DRIVER_DUTY_REFERENCE' },
  },
  'person-multiplexing': {
    command: 'driver.confirm_positioning',
    title: (c) => `Ask ${first(c)} where they finish and when they can start`,
    approval: 'AGENT_SENDS',
    approver: null,
    changes: ["Sends one message asking for the driver's own finish point and earliest start."],
    unchanged: [
      'Reassigns or cancels anything — accepted work is theirs until they withdraw.',
      'Moves a pickup slot or a delivery promise.',
    ],
    body: (c) =>
      `You are holding more than one car at the moment. Before we rely on the next collection, please confirm where you finish your current handover and the earliest you could take the next keys. A planned route is not a confirmed position, so we would rather ask than assume.`,
    payload: { confirm: ['finish_location', 'earliest_start'], reassign: false },
  },
  'stale-signal': {
    command: 'driver.request_position',
    title: (c) => `Ask ${first(c)} for a current position and ETA`,
    approval: 'AGENT_SENDS',
    approver: null,
    changes: ['Sends one message asking for a position and a revised arrival estimate.'],
    unchanged: ['The delivery promise. A new date needs the customer.'],
    body: () =>
      `The app has not sent a position for a while and the delivery promise still stands. When it is safe to do so, please send your current location and a fresh arrival estimate.`,
    payload: { change_promise: false },
  },
  'rejected-evidence': {
    command: 'driver.request_replacement_photos',
    title: (c) => `Ask ${first(c)} for a replacement photo set`,
    approval: 'AGENT_SENDS',
    approver: null,
    changes: ['Sends one message naming exactly which photos are needed.'],
    unchanged: [
      'Approves the rejected set — a site statement about the car does not approve it.',
    ],
    body: () =>
      `The pickup photos were rejected because the set does not identify this vehicle. Please retake this car's registration and all four sides, and confirm they have uploaded before you leave.`,
    payload: { proof_status: 'REQUIRED', approve_existing: false },
  },
  // Only for a stopped vehicle. Other incident kinds get their own plan below.
  'needs-human': {
    command: 'driver.request_safe_stop_details',
    title: (c) => `Check ${first(c)} is safe and get an exact location`,
    approval: 'AGENT_SENDS',
    approver: null,
    changes: ['Sends one message asking after safety, location and a photo.'],
    unchanged: [
      'Clears onward driving — only the owner decides recovery.',
      'The delivery promise.',
    ],
    body: () =>
      `Operations has a person on this. Please keep the vehicle stopped and tell us you are safe, send the service-area name or a location pin, and a photo of the warning. Nobody has cleared onward driving.`,
    payload: { authorize_restart: false },
    onlyIncident: 'VEHICLE_WARNING',
  },
  'open-incident': {
    command: 'incident.reach_outcome',
    title: () => 'Record an outcome on the open investigation',
    approval: 'NEEDS_PERSON',
    approver: 'ops-shift',
    changes: ['Records a decision on the incident.'],
    unchanged: [
      'Attributes a cause — photos show a reported condition, not who caused it.',
    ],
    payload: { attribution: null },
  },
  'unknown-outcome': {
    command: 'travel.verify_booking_outcome',
    title: () => 'Reconcile the booking before anyone retries it',
    approval: 'NEEDS_PERSON',
    approver: 'ops-travel',
    changes: ['Opens a reconciliation check with the provider.'],
    unchanged: [
      'Books a replacement — capacity and fare are unconfirmed.',
      'Tells the driver a crossing exists.',
    ],
    payload: { verify_with_provider: true, book_replacement: false },
  },
  'authority-gap': {
    command: 'handover.establish_authority',
    title: () => 'Name someone with recorded authority before the driver arrives',
    approval: 'NEEDS_PERSON',
    approver: 'ops-readiness',
    changes: ['Opens an authority check on the endpoint.'],
    unchanged: [
      'Authorises anybody to release or receive the car.',
      'Instructs the driver to hand over.',
    ],
    payload: { confirm: 'named_authority', instruct_driver: false },
  },
  'custody-open': {
    command: 'custody.confirm_release',
    title: () => 'Confirm who may release the tracked keys, and when',
    approval: 'NEEDS_PERSON',
    approver: 'ops-shift',
    changes: ['Opens a custody check with the branch.'],
    unchanged: [
      'Approves early collection or overnight custody.',
      'Records a key handover.',
    ],
    payload: { approve_overnight: false, approve_early_collection: false },
  },
  'approved-not-done': {
    command: 'proposal.execute_approved',
    title: () => 'Run the action a reviewer already approved',
    approval: 'NEEDS_APPROVAL',
    approver: 'ops-dispatch',
    changes: ['Executes the approved payload as reviewed.'],
    unchanged: ['The reviewed payload itself. Editing it needs a fresh decision.'],
    payload: { use_reviewed_payload: true },
  },
  'awaiting-review': {
    command: 'proposal.review',
    title: () => 'Rule on the proposal that is waiting',
    approval: 'NEEDS_PERSON',
    approver: 'ops-shift',
    changes: ['Records an approve, edit or reject on the pending proposal.'],
    unchanged: ['Anything on the order until the decision is recorded.'],
    payload: { decision: null },
  },
  'unapproved-promise': {
    command: 'promise.confirm_with_customer',
    title: () => 'Get the customer to agree the delivery date',
    approval: 'NEEDS_PERSON',
    approver: 'ops-planning',
    changes: ['Opens a confirmation request with the customer.'],
    unchanged: [
      'The date itself until they agree.',
      'Anything said to the driver about it.',
    ],
    payload: { contact_customer: true, by: 'operator' },
  },
}

const first = (c: CaseContext) =>
  (c.driver?.display_name ?? 'the driver').split(' ')[0]

/* ------------------------------------------------------------------ assembly */

function citesFrom(
  context: CaseContext,
  prefer: string[] = [],
  limit = 4,
): Cite[] {
  // Cite the records the question is actually about. A driver asking where
  // their expense went should not be answered with their pickup slot.
  const recorded = context.facts.filter((f) => f.tier === 'RECORDED' && f.source)
  const relevant = prefer.length
    ? recorded.filter((f) => prefer.includes(f.source!.table))
    : []
  const rest = recorded.filter((f) => !relevant.includes(f))
  return [...relevant, ...rest].slice(0, limit).map((f) => ({
    label: `${f.label}${f.value ? ` — ${f.value}` : ''}`,
    table: f.source!.table,
    id: f.source!.id,
  }))
}

function withheldFrom(context: CaseContext, extra: string[] = []): string[] {
  const gaps = context.facts
    .filter((f) => f.tier === 'UNESTABLISHED')
    .map((f) => f.label)
  const cautions = context.facts
    .filter((f) => f.tier === 'RECORDED' && f.caution)
    .map((f) => f.caution as string)
  return [...new Set([...extra, ...cautions, ...gaps])].slice(0, 5)
}

export function proposeFor(
  key: string,
  data: Dataset = load(),
): { context: CaseContext; proposals: Proposal[] } | null {
  const context = buildContext(key, data)
  if (!context) return null

  const [kind, id] = key.split(':')
  const findings = detect(data)
  const ordersOf = new Set(
    data.assignments
      .filter((a) => a.status !== 'CANCELLED' && a.driver_id === id)
      .map((a) => a.order_id),
  )
  const mine = findings.filter(
    (f) =>
      (f.subject.kind === 'driver' && f.subject.id === id) ||
      (f.subject.kind === 'order' &&
        (kind === 'order' ? f.subject.id === id : ordersOf.has(f.subject.id))),
  )

  const fromDriver = context.asked.filter((m) => m.who === 'driver')
  const latest = fromDriver[fromDriver.length - 1] ?? null
  const market = context.driver?.home_country ?? null
  const basis = latest ? matchEntry(latest.body, market) : null

  const seen = new Set<string>()
  const proposals: Proposal[] = []

  const incidentKind = (orderId: string) =>
    data.incidents.find((i) => i.order_id === orderId && !i.resolved_at)?.kind ?? null

  const ranked = [...mine].sort(
    (a, b) => PRIORITY.indexOf(a.signature) - PRIORITY.indexOf(b.signature),
  )

  for (const f of ranked) {
    const plan = PLANS[f.signature]
    if (!plan || seen.has(plan.command)) continue
    // A plan scoped to one incident kind must not fire on another: a ferry
    // capacity decision is not a driver stopped at the roadside.
    if (plan.onlyIncident) {
      const order = f.subject.kind === 'order' ? f.subject.id : null
      if (!order || incidentKind(order) !== plan.onlyIncident) continue
    }
    seen.add(plan.command)
    proposals.push({
      id: `${key}:${plan.command}`,
      command: plan.command,
      title: plan.title(context),
      because: f.detail,
      approval: plan.approval,
      approver: plan.approver,
      payload: plan.payload ?? {},
      changes: plan.changes,
      unchanged: plan.unchanged,
      cites: citesFrom(context),
      withheld: withheldFrom(context),
      draft: plan.body
        ? {
            kind: 'DRAFT' as const,
            to: context.driver?.display_name ?? 'the driver',
            language: latest?.language ?? 'en',
            body: plan.body(context),
          }
        : null,
      basis: basis ? { id: basis.id, topic: basis.topic, routing: basis.routing } : null,
    })
  }

  // Anything the driver asked that the answer book already covers, and which no
  // signature turned into an action, is a reply the agent may simply send.
  if (basis && (basis.routing === 'ANSWER' || basis.routing === 'LOOKUP')) {
    const command = `driver.answer.${basis.id}`
    if (!seen.has(command)) {
      proposals.push({
        id: `${key}:${command}`,
        command,
        title: `Answer ${first(context)} from the ${basis.topic.toLowerCase()} rules`,
        because: latest ? `They asked: “${latest.body.slice(0, 120)}”` : basis.triggers[0],
        approval: 'AGENT_SENDS',
        approver: null,
        payload: { knowledge_entry: basis.id, order_change: false },
        changes: ['Sends one reply built from the recorded facts and the policy.'],
        unchanged: ['Nothing on the order. No date, cost or booking moves.'],
        cites: citesFrom(context, basis.reads ?? []),
        withheld: withheldFrom(context, basis.cautions ?? []),
        draft: {
          // The answer book says what the reply must establish, not the words
          // to send. Wording is the agent's job, so this is a spec.
          kind: 'SPEC' as const,
          to: context.driver?.display_name ?? 'the driver',
          language: latest?.language ?? 'en',
          body: basis.answer,
        },
        basis: { id: basis.id, topic: basis.topic, routing: basis.routing },
      })
    }
  }

  // Order: answer what they actually asked first — they are waiting on it —
  // then the agent's other cheap moves, then anything needing a person.
  const order: Approval[] = ['AGENT_SENDS', 'NEEDS_APPROVAL', 'NEEDS_PERSON']
  const isReply = (p: Proposal) => p.command.startsWith('driver.answer.')
  proposals.sort((a, b) => {
    if (isReply(a) !== isReply(b)) return isReply(a) ? -1 : 1
    return order.indexOf(a.approval) - order.indexOf(b.approval)
  })

  return { context, proposals }
}
