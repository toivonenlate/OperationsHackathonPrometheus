// One order's story, short enough to read in a few seconds: why it needs a
// person, what the next decision is, and who said and did what, in order.
//
// Nothing here is new judgement. The reason is the case's own, the next
// decision is the top proposal the case page would show, and the timeline is
// the messages, BahnBot's proposals and the operational log for this order.
import { type Dataset, load, loadCaseRecords, loadLog } from './data'
import type { Case } from './cases'
import { proposeFor } from './propose'
import { commandName, deskName } from './labels'

export type Actor = 'operator' | 'driver' | 'agent' | 'other'

export type StoryItem = {
  t: number
  actor: Actor
  who: string
  /** What happened, or what was said. Messages keep their own words. */
  text: string
  kind: 'said' | 'did' | 'decided' | 'raised'
  internal: boolean
  language: string | null
}

export type Why = { headline: string; detail: string | null; blockedOn: string | null }

export type NextDecision = {
  title: string
  because: string | null
  /** Who acts: BahnBot alone, BahnBot once approved, or a person. */
  who: 'AGENT_SENDS' | 'NEEDS_APPROVAL' | 'NEEDS_PERSON'
  owner: string | null
  /** Set when the decision belongs to a driver's case spanning several orders. */
  scope: string | null
}

// Milestones worth a line in the story. Everything else stays in the event log.
const MILESTONES: Record<string, string> = {
  'order.created': 'Order created',
  'plan.activated': 'Route plan activated',
  'offer.published': 'Offered to drivers',
  'offer.accepted': 'A driver accepted the offer',
  'assignment.booked': 'Driver booked',
  'assignment.started': 'Driver started the job',
  'vehicle.picked_up': 'Car picked up',
  'vehicle.delivered': 'Car delivered',
  'travel.booked': 'Driver travel booked',
  'proof.rejected': 'Handover photos rejected',
}

const ROLE: Record<string, string> = {
  customer: 'Customer',
  site_contact: 'Site contact',
  handoff_contact: 'Handover contact',
  system: 'System',
}

function actorOf(type: string): Actor {
  return type === 'operator' || type === 'driver' || type === 'agent' ? type : 'other'
}

const DECISION: Record<string, string> = {
  APPROVED: 'approved',
  EDITED: 'edited and approved',
  REJECTED: 'stopped',
}

// Proposal reasons cite commands by their identifier; operators read words.
const COMMAND_ID = /\b(?:travel|alert|assignment|pickup|condition|billing|driver|offer|proposal|order|vehicle)\.[a-z_]+\b/g
export const plain = (text: string) =>
  text.replace(COMMAND_ID, (id) => commandName(id)).replace(/^./, (c) => c.toUpperCase())

export function storyOf(orderId: string, c: Case | null, data: Dataset = load()) {
  const { inboxMessages } = loadCaseRecords()
  const { events } = loadLog()
  const drivers = new Map(data.drivers.map((d) => [d.id, d.display_name]))
  const customers = new Map(data.customers.map((c) => [c.id, c.display_name ?? c.name ?? 'Customer']))

  const whoIs = (type: string, id: string | null): string => {
    if (type === 'driver') return (id && drivers.get(id)) ?? 'Driver'
    if (type === 'operator') return id ? deskName(id) : 'Operator'
    if (type === 'agent') return 'BahnBot'
    if (type === 'customer') return (id && customers.get(id)) ?? 'Customer'
    return ROLE[type] ?? type.replace(/_/g, ' ')
  }

  const items: StoryItem[] = []

  for (const m of data.messages.filter((m) => m.order_id === orderId)) {
    items.push({
      t: Date.parse(m.authored_at),
      actor: actorOf(m.author_type),
      who: whoIs(m.author_type, m.author_id),
      text: m.body,
      kind: 'said',
      internal: m.visibility === 'INTERNAL',
      language: m.language,
    })
  }

  const threads = new Set(
    data.inbox.filter((t) => t.linked_order_ids.includes(orderId)).map((t) => t.id),
  )
  for (const m of inboxMessages.filter((m) => threads.has(m.thread_id))) {
    items.push({
      t: Date.parse(m.authored_at),
      actor: actorOf(m.author_type),
      who: whoIs(m.author_type, m.author_id),
      text: m.body,
      kind: 'said',
      internal: m.visibility === 'INTERNAL',
      language: m.language,
    })
  }

  for (const p of data.proposals.filter((p) => p.order_id === orderId)) {
    items.push({
      t: Date.parse(p.created_at),
      actor: 'agent',
      who: 'BahnBot',
      text: `Proposed ${commandName(p.command)}: ${p.summary}`,
      kind: 'did',
      internal: true,
      language: null,
    })
    if (p.review) {
      items.push({
        t: Date.parse(p.review.reviewed_at),
        actor: 'operator',
        who: deskName(p.review.reviewer_id),
        text: `${DECISION[p.review.decision] ?? p.review.decision.toLowerCase()} it${
          p.review.decision_note ? `: ${p.review.decision_note}` : ''
        }`.replace(/^./, (s) => s.toUpperCase()),
        kind: 'decided',
        internal: true,
        language: null,
      })
    }
    if (p.execution) {
      const ok = p.execution.status === 'SUCCEEDED' || p.execution.status === 'EXECUTED'
      items.push({
        t: Date.parse(p.execution.attempted_at),
        actor: 'agent',
        who: 'BahnBot',
        text: ok
          ? `Ran ${commandName(p.command)}`
          : `Tried ${commandName(p.command)}: ${p.execution.error ?? p.execution.status.toLowerCase()}`,
        kind: ok ? 'did' : 'raised',
        internal: true,
        language: null,
      })
    }
  }

  for (const e of events.filter((e) => e.order_id === orderId)) {
    // Proposals already tell BahnBot's side; the log adds what it did on its own.
    if (e.actor_type === 'agent' && !e.command?.startsWith('proposal')) {
      items.push({
        t: Date.parse(e.recorded_at),
        actor: 'agent',
        who: 'BahnBot',
        text: MILESTONES[e.command ?? ''] ?? commandName(e.command ?? 'event'),
        kind: 'did',
        internal: false,
        language: null,
      })
    } else if (e.command && MILESTONES[e.command]) {
      items.push({
        t: Date.parse(e.recorded_at),
        actor: actorOf(e.actor_type),
        who: whoIs(e.actor_type, e.actor_id),
        text: MILESTONES[e.command],
        kind: 'did',
        internal: false,
        language: null,
      })
    }
  }

  for (const a of data.alerts.filter((a) => a.order_id === orderId)) {
    items.push({
      t: Date.parse(a.triggered_at),
      actor: 'other',
      who: 'Alert',
      text: a.summary,
      kind: 'raised',
      internal: true,
      language: null,
    })
  }
  for (const i of data.incidents.filter((i) => i.order_id === orderId)) {
    items.push({
      t: Date.parse(i.opened_at),
      actor: 'other',
      who: 'Incident',
      text: i.reported_symptom ?? i.kind.toLowerCase().replace(/_/g, ' '),
      kind: 'raised',
      internal: true,
      language: null,
    })
  }

  items.sort((a, b) => a.t - b.t)

  /* ---- why, and what is next ---- */

  const openWork = data.workItems.filter((w) => w.order_id === orderId && w.status === 'OPEN')

  const why: Why | null = c
    ? { headline: c.badge, detail: c.brief, blockedOn: c.blockedOn }
    : openWork[0]
      ? { headline: 'Open check', detail: openWork[0].summary, blockedOn: null }
      : null

  let next: NextDecision | null = null
  const top = c ? proposeFor(c.key, data)?.proposals[0] : null
  if (top) {
    next = {
      title: top.title,
      because: plain(top.because),
      who: top.approval,
      owner: top.approver,
      scope: c?.kind === 'driver' ? `for ${c.title}'s case` : null,
    }
  } else if (openWork[0]) {
    next = {
      title: openWork[0].next_action ?? openWork[0].summary,
      because: null,
      who: 'NEEDS_PERSON',
      owner: openWork[0].owner,
      scope: null,
    }
  }

  return { why, next, story: items }
}
