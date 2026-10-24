// The context pack for one case.
//
// Three tiers, and the tier is the whole point. RECORDED is something the
// records establish. CLAIMED is something a person said and nobody has
// checked. UNESTABLISHED is a hole, with the thing that would fill it. An
// operator reading this should never have to guess which kind of fact they are
// looking at, and neither should an agent drafting a reply from it.
import {
  type Dataset,
  type Driver,
  load,
  loadCaseRecords,
  SNAPSHOT_AT,
  vehicleFor,
} from './data'
import { type Finding, detect } from './detect'
import { label } from './cases'
import { codeName, commandName } from './labels'

export type Tier = 'RECORDED' | 'CLAIMED' | 'UNESTABLISHED'

export type SourceRef = { table: string; id: string }

export type ContextFact = {
  tier: Tier
  label: string
  value: string
  /** The trap this fact invites. Shown beside it, always. */
  caution: string | null
  /** For UNESTABLISHED: what would close it. */
  settles: string | null
  source: SourceRef | null
  at: string | null
}

export type AskedMessage = {
  id: string
  at: string
  channel: string
  language: string | null
  body: string
  who: string
  internal: boolean
  thread: string
  orderRef: string | null
}

export type CaseContext = {
  key: string
  title: string
  subtitle: string
  driver: Driver | null
  orderRefs: string[]
  cars: string[]
  asked: AskedMessage[]
  facts: ContextFact[]
  decisions: { title: string; detail: string; owner: string | null }[]
  record: Record<string, unknown>[]
}

const money = (cents: number, currency: string) =>
  `${(cents / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })} ${currency}`

const prettyKind = (k: string) => k.toLowerCase().replace(/_/g, ' ')

/** Driver-facing records for one driver, newest last so it reads as a thread. */
function askedOf(data: Dataset, driverId: string): AskedMessage[] {
  const { inboxMessages } = loadCaseRecords()
  const orderRef = new Map(data.orders.map((o) => [o.id, o.reference]))
  const out: AskedMessage[] = []

  const convs = data.conversations.filter(
    (c) => c.counterparty_type === 'driver' && c.counterparty_id === driverId,
  )
  for (const c of convs) {
    const threadName = `${prettyKind(c.category ?? 'thread')} · ${
      c.order_id ? orderRef.get(c.order_id) ?? c.order_id : 'no order'
    }${c.status === 'OPEN' ? '' : ' (closed)'}`
    for (const m of data.messages.filter((m) => m.conversation_id === c.id)) {
      out.push({
        id: m.id,
        at: m.authored_at,
        channel: m.channel,
        language: m.language,
        body: m.body,
        who: m.author_type,
        internal: m.visibility === 'INTERNAL',
        thread: threadName,
        orderRef: c.order_id ? orderRef.get(c.order_id) ?? null : null,
      })
    }
  }

  const threads = data.inbox.filter((t) => t.counterparty_id === driverId)
  for (const t of threads) {
    const linked = t.linked_order_ids.map((id) => orderRef.get(id) ?? id)
    const threadName = `${prettyKind(t.category)} · ${
      linked.length ? linked.join(', ') : 'support inbox, no order link'
    }${t.status === 'OPEN' ? '' : ' (closed)'}`
    for (const m of inboxMessages.filter((m) => m.thread_id === t.id)) {
      out.push({
        id: m.id,
        at: m.authored_at,
        channel: m.channel,
        language: m.language,
        body: m.body,
        who: m.author_type,
        internal: m.visibility === 'INTERNAL',
        thread: threadName,
        orderRef: linked[0] ?? null,
      })
    }
  }

  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

function factsOf(
  data: Dataset,
  driverId: string | null,
  orderIds: string[],
  findings: Finding[],
): ContextFact[] {
  const { expenses, custodyReports } = loadCaseRecords()
  const orderRef = new Map(data.orders.map((o) => [o.id, o.reference]))
  const facts: ContextFact[] = []

  // --- RECORDED -------------------------------------------------------------

  for (const a of data.assignments) {
    if (!orderIds.includes(a.order_id)) continue
    if (driverId && a.driver_id !== driverId) continue
    facts.push({
      tier: 'RECORDED',
      label: `Assignment on ${orderRef.get(a.order_id) ?? a.order_id}`,
      value:
        a.status === 'CANCELLED'
          ? 'Cancelled'
          : `${prettyKind(a.status)}${
              a.fee_cents ? ` · fee ${money(a.fee_cents, a.currency ?? 'EUR')}` : ''
            }`,
      caution:
        a.status === 'ASSIGNED'
          ? 'Accepted work. Only the driver can withdraw from it.'
          : null,
      settles: null,
      source: { table: 'work_assignments', id: a.id },
      at: a.accepted_at,
    })
  }

  for (const w of data.timeWindows) {
    if (!orderIds.includes(w.order_id) || !w.is_selected) continue
    if (w.purpose !== 'SELECTED_PICKUP_SLOT' && w.purpose !== 'CUSTOMER_DELIVERY_PROMISE')
      continue
    const isPromise = w.purpose === 'CUSTOMER_DELIVERY_PROMISE'
    facts.push({
      tier: 'RECORDED',
      label: `${isPromise ? 'Delivery promise' : 'Pickup slot'} · ${
        orderRef.get(w.order_id) ?? w.order_id
      }`,
      value: `${new Date(w.start_at).toUTCString().slice(5, 22)} – ${new Date(
        w.end_at,
      ).toUTCString().slice(17, 22)} (${w.timezone})`,
      caution:
        w.source !== 'CUSTOMER'
          ? `Set by ${w.source}. Not evidence the customer agreed.`
          : null,
      settles: null,
      source: { table: 'time_windows', id: w.id },
      at: w.start_at,
    })
  }

  for (const e of expenses) {
    const mine = driverId ? e.driver_id === driverId : orderIds.includes(e.order_id)
    if (!mine && !orderIds.includes(e.order_id)) continue
    let caution: string | null = null
    if (e.payer === 'BAHN' || e.reimbursable_to_driver === false) {
      caution = 'Bahn paid this. It is not a driver reimbursement claim.'
    } else if (e.status === 'APPROVED') {
      caution = 'Approved means the claim was accepted, not that money moved.'
    } else if (e.status === 'SUPERSEDED') {
      caution = 'An older submission, kept and linked to its correction.'
    }
    if (e.currency !== 'EUR') {
      caution = `${caution ? caution + ' ' : ''}Amount is in ${e.currency}; the packet has no exchange rate.`
    }
    facts.push({
      tier: 'RECORDED',
      label: `${prettyKind(e.kind)}${e.merchant ? ` · ${e.merchant}` : ''}`,
      value: `${money(e.amount_cents, e.currency)} · ${prettyKind(e.status)}${
        e.receipt_state === 'ATTACHED_NOT_SAMPLED' ? ' · receipt claimed, not supplied' : ''
      }`,
      caution,
      settles: null,
      source: { table: 'expenses', id: e.id },
      at: e.service_at,
    })
  }

  for (const p of data.proofs) {
    if (!orderIds.includes(p.order_id)) continue
    if (p.status === 'APPROVED') continue
    facts.push({
      tier: 'RECORDED',
      label: `${prettyKind(p.kind)} · ${orderRef.get(p.order_id) ?? p.order_id}`,
      value: prettyKind(p.status),
      caution:
        p.status === 'REJECTED'
          ? 'A rejected set keeps its files. A site statement about the car does not approve it.'
          : null,
      settles: null,
      source: { table: 'proofs', id: p.id },
      at: p.reviewed_at ?? p.submitted_at,
    })
  }

  for (const asset of data.custodyAssets) {
    if (!orderIds.includes(asset.order_id)) continue
    facts.push({
      tier: 'RECORDED',
      label: `Tracked ${prettyKind(asset.kind)}`,
      value: `on ${orderRef.get(asset.order_id) ?? asset.order_id}`,
      caution:
        'A pickup event proves the car moved. It does not count keys or name who took them.',
      settles: null,
      source: { table: 'custody_assets', id: asset.id },
      at: null,
    })
  }

  for (const p of data.proposals) {
    if (!orderIds.includes(p.order_id)) continue
    if (p.status !== 'APPROVED_AWAITING_EXECUTION' && p.status !== 'FAILED') continue
    facts.push({
      tier: 'RECORDED',
      label: `Agent action · ${p.command}`,
      value:
        p.status === 'FAILED'
          ? 'Attempted and returned no confirmation'
          : 'Approved, not yet run',
      caution: p.review?.decision_note ?? null,
      settles: null,
      source: { table: 'agent_proposals', id: p.id },
      at: p.review?.reviewed_at ?? p.created_at,
    })
  }

  // --- CLAIMED --------------------------------------------------------------

  for (const r of custodyReports) {
    if (!r.order_id || !orderIds.includes(r.order_id)) continue
    facts.push({
      tier: 'CLAIMED',
      label: 'Driver custody report',
      value: r.summary ?? 'Reported during an overnight stop',
      caution:
        'An attributed driver statement. Not continuous observation of the vehicle.',
      settles: null,
      source: { table: 'custody_reports', id: r.id },
      at: r.reported_at ?? null,
    })
  }

  for (const a of data.alerts) {
    if (!a.order_id || !orderIds.includes(a.order_id)) continue
    if (a.status === 'RESOLVED' || a.status === 'DISMISSED') continue
    facts.push({
      tier: 'CLAIMED',
      label: `Signal · ${prettyKind(a.signal)}`,
      value: a.summary,
      caution: `An ${prettyKind(a.status)} signal is a reason to look, not a diagnosis.${
        a.owner ? ` Owned by ${a.owner}.` : ' Nobody is named on it.'
      }`,
      settles: null,
      source: { table: 'alerts', id: a.id },
      at: a.triggered_at,
    })
  }

  // --- UNESTABLISHED --------------------------------------------------------
  // Straight from the detectors: they already know what the records cannot
  // settle, and what would settle it.
  // This page is itself the answer to the fragmentation signatures, and the
  // alert already appears above under CLAIMED, so none of the three belongs in
  // a list of things still unknown.
  const RESOLVED_BY_THIS_PAGE = new Set([
    'split-across-systems',
    'multiple-open-threads',
    'ownerless',
  ])
  const seen = new Set<string>()
  for (const f of findings) {
    const key = f.signature
    if (seen.has(key) || RESOLVED_BY_THIS_PAGE.has(key)) continue
    seen.add(key)
    facts.push({
      tier: 'UNESTABLISHED',
      label: f.detail,
      value: '',
      caution: null,
      settles: BLOCKED_ON[f.signature] ?? null,
      source: f.evidence[0] ?? null,
      at: f.at,
    })
  }

  if (expenses.some((e) => e.status === 'APPROVED' && e.driver_id === driverId)) {
    facts.push({
      tier: 'UNESTABLISHED',
      label: 'Whether any approved claim has actually been paid',
      value: '',
      caution: null,
      settles: 'A payout ledger, which this packet does not contain',
      source: null,
      at: null,
    })
  }

  return facts
}

/** Duplicated from cases.ts on purpose: the wording here is operator-facing. */
const BLOCKED_ON: Record<string, string> = {
  'unknown-outcome': 'A confirmation reference from the provider, or a recorded failure',
  'needs-human': 'A decision from whoever owns the cost and the car',
  'person-multiplexing':
    "The driver's own account of where they finish and when they can start",
  'split-across-systems': 'One view holding every thread with this driver',
  'cannot-be-filed': 'A job reference from the driver',
  'authority-gap': 'A named person with recorded release or receive authority',
  'unapproved-promise': 'The customer agreeing to the date',
  'rejected-evidence': 'A replacement photo set that identifies this car',
  'stale-signal': 'A fresh driver-app position, or the driver answering',
  'custody-open': 'A recorded key release naming who took them',
  'open-incident': 'The investigation reaching a recorded outcome',
  ownerless: 'Somebody putting their name on it',
  'awaiting-review': 'A reviewer approving, editing or rejecting the proposal',
  'approved-not-done': 'The approved action actually running',
  'open-work-item': 'The named next check being done',
  'multiple-open-threads': 'The threads being read together',
}

export function buildContext(key: string, data: Dataset = load()): CaseContext | null {
  const [kind, id] = key.split(':') as ['driver' | 'order', string]
  const findings = detect(data)

  const ordersOfDriver = new Map<string, Set<string>>()
  for (const a of data.assignments) {
    if (a.status === 'CANCELLED') continue
    const set = ordersOfDriver.get(a.driver_id) ?? new Set<string>()
    set.add(a.order_id)
    ordersOfDriver.set(a.driver_id, set)
  }

  let driverId: string | null = null
  let orderIds: string[] = []

  if (kind === 'driver') {
    driverId = id
    orderIds = [...(ordersOfDriver.get(id) ?? [])]
  } else {
    orderIds = [id]
    driverId =
      data.assignments.find((a) => a.order_id === id && a.status !== 'CANCELLED')
        ?.driver_id ?? null
  }

  const driver = driverId
    ? data.drivers.find((d) => d.id === driverId) ?? null
    : null
  if (kind === 'driver' && !driver) return null

  // Findings that belong to this case: the driver's own, plus their orders'.
  const mine = findings.filter(
    (f) =>
      (f.subject.kind === 'driver' && f.subject.id === driverId) ||
      (f.subject.kind === 'order' && orderIds.includes(f.subject.id)),
  )

  const orderRef = new Map(data.orders.map((o) => [o.id, o.reference]))
  const asked = driverId ? askedOf(data, driverId) : []
  const facts = factsOf(data, driverId, orderIds, mine)

  const decisions = data.workItems
    .filter((w) => orderIds.includes(w.order_id) && w.status === 'OPEN')
    .map((w) => ({
      title: w.summary,
      detail: w.next_action ?? 'No next action recorded.',
      owner: w.owner,
    }))

  const hours = (iso: string | null) =>
    iso ? Math.round((SNAPSHOT_AT.getTime() - new Date(iso).getTime()) / 3_600_000) : null

  return {
    key,
    title: driver?.display_name ?? orderRef.get(id) ?? id,
    subtitle: driver
      ? [
          `Driver · ${driver.home_city ?? '—'}${
            driver.home_country ? `, ${driver.home_country}` : ''
          }`,
          `${orderIds.length} live ${orderIds.length === 1 ? 'duty' : 'duties'}`,
          asked.length
            ? `${asked.filter((m) => m.who === 'driver').length} messages from them, oldest ${hours(
                asked[0]?.at ?? null,
              )}h ago`
            : 'no open threads',
        ].join(' · ')
      : orderIds.map((o) => orderRef.get(o) ?? o).join(', '),
    driver,
    orderRefs: orderIds.map((o) => orderRef.get(o) ?? o),
    cars: orderIds
      .map((o) => {
        const v = vehicleFor(data, o)
        return v ? `${v.make} ${v.model}` : ''
      })
      .filter(Boolean),
    asked,
    facts,
    decisions,
    record: [],
  }
}

/** Every fact points at a record. This fetches it so the UI can show it in
 *  place, without a round trip and without a model in between. */
export function resolveRecord(
  ref: SourceRef,
  data: Dataset = load(),
): Record<string, unknown> | null {
  const { expenses, inboxMessages, custodyReports } = loadCaseRecords()
  const tables: Record<string, { id: string }[]> = {
    work_assignments: data.assignments,
    time_windows: data.timeWindows,
    expenses,
    proofs: data.proofs,
    custody_assets: data.custodyAssets,
    custody_asset_events: data.custodyAssetEvents as { id: string }[],
    agent_proposals: data.proposals,
    custody_reports: custodyReports as { id: string }[],
    alerts: data.alerts,
    incidents: data.incidents,
    work_items: data.workItems,
    conversations: data.conversations,
    messages: data.messages,
    support_inbox_threads: data.inbox,
    support_inbox_messages: inboxMessages,
    orders: data.orders,
    tracking_observations: data.tracking,
  }
  const row = tables[ref.table]?.find((r) => r.id === ref.id)
  return row ? (row as unknown as Record<string, unknown>) : null
}

export type Vital = { label: string; value: string; tone?: 'risk' | 'unknown' }

/** The handful of facts an operator wants before reading anything else.
 *  Deliberately states an unknown as unknown: "attempted, outcome unknown"
 *  rather than a status we do not have. */
export function vitalsOf(context: CaseContext, data: Dataset = load()): Vital[] {
  const out: Vital[] = []
  const refs = context.orderRefs
  if (refs.length) {
    out.push({ label: refs.length > 1 ? 'Orders' : 'Order', value: refs.join(', ') })
  }
  const cars = context.cars.filter(Boolean)
  if (cars.length) out.push({ label: cars.length > 1 ? 'Cars' : 'Car', value: cars.join(', ') })
  if (context.driver) {
    out.push({
      label: 'Driver',
      value: `${context.driver.display_name}${
        context.driver.home_city ? ` · ${context.driver.home_city}` : ''
      }`,
    })
  }

  const fee = context.facts.find((f) => f.label.startsWith('Assignment') && f.value.includes('fee'))
  if (fee) {
    const m = fee.value.match(/fee ([\d.,]+ [A-Z]{3})/)
    if (m) out.push({ label: 'Fee', value: m[1] })
  }

  const failed = context.facts.find(
    (f) => f.label.startsWith('Agent action') && f.value.includes('no confirmation'),
  )
  if (failed) {
    out.push({
      label: 'Ferry',
      value: 'Attempted, outcome unknown — no reservation recorded',
      tone: 'unknown',
    })
  }
  return out
}
