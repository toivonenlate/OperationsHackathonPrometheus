// Turns findings into ranked cases.
//
// Two rules matter here. First, the subject is the person when the hardness is
// about a person: if a driver is holding several cars, their orders' findings
// belong on their card, not scattered across three car cards. Second, a case is
// harder when the thing you least know how to resolve is worse, so the top
// signature dominates and a pile-up of different kinds adds a little on top.
import { type Dataset, SNAPSHOT_AT, load, vehicleFor } from './data'
import { type Finding, type Signature, WEIGHT, detect } from './detect'

export type Tone = 'critical' | 'pending' | 'info'

export type Fact = { label: string; value: string; mono?: boolean }

export type CaseOrder = {
  id: string
  reference: string
  status: string
  vehicle: string | null
}

export type Case = {
  key: string
  kind: 'driver' | 'order'
  title: string
  subtitle: string
  /** Terse operational summary. One line, no storytelling. */
  brief: string
  badge: string
  tone: Tone
  action: string
  facts: Fact[]
  blockedOn: string
  score: number
  signatures: Signature[]
  otherSignals: number
  findings: Finding[]
  orders: CaseOrder[]
  oldestAt: string | null
}

/** Which signature speaks first. Roughly: unknowable before merely unfinished. */
const VOICE: Signature[] = [
  'unknown-outcome',
  'needs-human',
  'cannot-be-filed',
  'authority-gap',
  'split-across-systems',
  'person-multiplexing',
  'stale-signal',
  'custody-open',
  'rejected-evidence',
  'unapproved-promise',
  'open-incident',
  'approved-not-done',
  'awaiting-review',
  'open-work-item',
  'multiple-open-threads',
  'ownerless',
]

/** The single badge. Operational noun phrases, not sentences. */
const BADGE: Record<Signature, string> = {
  'unknown-outcome': 'Reconciliation Required',
  'needs-human': 'Action Required',
  'person-multiplexing': 'Concurrent Duties',
  'split-across-systems': 'Fragmented Case',
  'cannot-be-filed': 'Unlinked Message',
  'authority-gap': 'No Authority on Record',
  'unapproved-promise': 'Date Unconfirmed',
  'rejected-evidence': 'Evidence Rejected',
  'stale-signal': 'Signal Stale',
  'custody-open': 'Custody Open',
  'open-incident': 'Incident Open',
  ownerless: 'Unassigned',
  'awaiting-review': 'Awaiting Review',
  'approved-not-done': 'Execution Pending',
  'open-work-item': 'Check Open',
  'multiple-open-threads': 'Multiple Threads',
}

/** The button. A verb the operator would actually use. */
const ACTION: Record<Signature, string> = {
  'unknown-outcome': 'Reconcile',
  'needs-human': 'Decide',
  'person-multiplexing': 'Review Duties',
  'split-across-systems': 'Open Driver',
  'cannot-be-filed': 'Identify Order',
  'authority-gap': 'Assign Authority',
  'unapproved-promise': 'Confirm Date',
  'rejected-evidence': 'Request Photos',
  'stale-signal': 'Contact Driver',
  'custody-open': 'Record Release',
  'open-incident': 'Review Incident',
  ownerless: 'Assign Owner',
  'awaiting-review': 'Review Proposal',
  'approved-not-done': 'Run Action',
  'open-work-item': 'Review Case',
  'multiple-open-threads': 'Open Threads',
}

/** What would actually settle each kind of doubt. */
const BLOCKED_ON: Record<Signature, string> = {
  'unknown-outcome': 'Provider confirmation reference, or a recorded failure',
  'needs-human': 'Decision from whoever owns the cost and the car',
  'person-multiplexing': 'Driver confirmation of finish point and next start',
  'split-across-systems': 'One view holding every thread with this driver',
  'cannot-be-filed': 'Job reference from the driver',
  'authority-gap': 'Named person with recorded release or receive authority',
  'unapproved-promise': 'Customer agreement to the date',
  'rejected-evidence': 'Replacement photo set identifying this car',
  'stale-signal': 'Fresh driver-app position, or a driver reply',
  'custody-open': 'Recorded key release naming the holder',
  'open-incident': 'Recorded investigation outcome',
  ownerless: 'An owner',
  'awaiting-review': 'Reviewer decision on the proposal',
  'approved-not-done': 'The approved action running',
  'open-work-item': 'The named next check',
  'multiple-open-threads': 'The threads read together',
}

function toneOf(signature: Signature): Tone {
  const w = WEIGHT[signature]
  if (w >= 4) return 'critical'
  if (w >= 2) return 'pending'
  return 'info'
}

/** First sentence only. Cards get a line, not a paragraph. */
function firstSentence(text: string): string {
  const cut = text.match(/^(.*?[.!?])(\s|$)/)
  return (cut ? cut[1] : text).trim()
}

function briefOf(top: Finding, group: Finding[]): string {
  switch (top.signature) {
    case 'person-multiplexing': {
      const n = top.evidence.length
      return `${n} concurrent duties. One leg's outcome gates the next.`
    }
    case 'split-across-systems':
      return firstSentence(top.detail)
    case 'cannot-be-filed':
      return 'Message cannot be linked to an order.'
    case 'unknown-outcome':
      return firstSentence(top.detail.replace(/^.*?attempted\.\s*/, ''))
    default:
      return firstSentence(top.detail)
  }
}

/** A mono-renderable identifier for the fact rows, pulled from the evidence. */
function codeOf(
  finding: Finding,
  data: Dataset,
): { label: string; value: string } | null {
  const ref = finding.evidence[0]
  if (!ref) return null
  switch (ref.table) {
    case 'agent_proposals': {
      const p = data.proposals.find((r) => r.id === ref.id)
      return p ? { label: 'Command', value: p.command } : null
    }
    case 'incidents': {
      const i = data.incidents.find((r) => r.id === ref.id)
      return i ? { label: 'Incident', value: i.kind } : null
    }
    case 'work_items': {
      const w = data.workItems.find((r) => r.id === ref.id)
      return w ? { label: 'Check', value: w.kind } : null
    }
    case 'support_inbox_threads': {
      const t = data.inbox.find((r) => r.id === ref.id)
      return t ? { label: 'Waiting on', value: t.waiting_on ?? t.link_state } : null
    }
    case 'proofs': {
      const p = data.proofs.find((r) => r.id === ref.id)
      return p ? { label: 'Proof', value: p.kind } : null
    }
    case 'alerts': {
      const a = data.alerts.find((r) => r.id === ref.id)
      return a ? { label: 'Signal', value: a.signal } : null
    }
    default:
      return null
  }
}

export function buildCases(data: Dataset = load()): Case[] {
  const findings = detect(data)
  const driverById = new Map(data.drivers.map((d) => [d.id, d]))
  const orderById = new Map(data.orders.map((o) => [o.id, o]))

  const ordersOfDriver = new Map<string, Set<string>>()
  for (const a of data.assignments) {
    if (a.status === 'CANCELLED') continue
    const set = ordersOfDriver.get(a.driver_id) ?? new Set<string>()
    set.add(a.order_id)
    ordersOfDriver.set(a.driver_id, set)
  }

  const driverSubjects = new Set(
    findings.filter((f) => f.subject.kind === 'driver').map((f) => f.subject.id),
  )
  const ownerOfOrder = new Map<string, string>()
  for (const driverId of driverSubjects) {
    for (const orderId of ordersOfDriver.get(driverId) ?? []) {
      ownerOfOrder.set(orderId, driverId)
    }
  }

  const buckets = new Map<string, Finding[]>()
  for (const f of findings) {
    const key =
      f.subject.kind === 'driver'
        ? `driver:${f.subject.id}`
        : ownerOfOrder.has(f.subject.id)
          ? `driver:${ownerOfOrder.get(f.subject.id)}`
          : `order:${f.subject.id}`
    const list = buckets.get(key)
    if (list) list.push(f)
    else buckets.set(key, [f])
  }

  const cases: Case[] = []
  for (const [key, group] of buckets) {
    const [kind, id] = key.split(':') as ['driver' | 'order', string]
    const signatures = [...new Set(group.map((f) => f.signature))].sort(
      (a, b) => WEIGHT[b] - WEIGHT[a],
    )

    const weights = signatures.map((s) => WEIGHT[s])
    const worst = Math.max(...weights)
    const score =
      worst * 3 +
      (weights.reduce((a, b) => a + b, 0) - worst) +
      (signatures.length - 1)

    const orderIds = kind === 'driver' ? [...(ordersOfDriver.get(id) ?? [])] : [id]
    const orders: CaseOrder[] = orderIds
      .map((oid) => orderById.get(oid))
      .filter((o): o is NonNullable<typeof o> => Boolean(o))
      .map((o) => {
        const v = vehicleFor(data, o.id)
        return {
          id: o.id,
          reference: o.reference,
          status: o.status,
          vehicle: v ? `${v.make} ${v.model}` : null,
        }
      })

    const top =
      VOICE.map((s) => group.find((f) => f.signature === s)).find(Boolean) ??
      group[0]

    let title: string
    let subtitle: string
    const facts: Fact[] = []

    // Context goes in the subtitle, identifiers in the facts. Three rows at
    // most: what it is, the code for it, and what it is waiting on.
    if (kind === 'driver') {
      const d = driverById.get(id)
      title = d?.display_name ?? id
      const stages = orders.map((o) => label(o.status).toLowerCase())
      subtitle = [
        d?.home_city ? `Driver · ${d.home_city}` : 'Driver',
        stages.join(', '),
      ].join(' · ')
      facts.push({
        label: orders.length > 1 ? 'Orders' : 'Order',
        value: orders.map((o) => o.reference).join('  '),
        mono: true,
      })
    } else {
      const o = orders[0]
      title = o?.vehicle ?? o?.reference ?? id
      const driverId = data.assignments.find(
        (a) => a.order_id === id && a.status !== 'CANCELLED',
      )?.driver_id
      const driverName = driverId
        ? driverById.get(driverId)?.display_name ?? driverId
        : null
      subtitle = [o ? label(o.status) : id, driverName]
        .filter(Boolean)
        .join(' · ')
      if (o) facts.push({ label: 'Order', value: o.reference, mono: true })
    }

    const code = codeOf(top, data)
    if (code) facts.push({ label: code.label, value: code.value, mono: true })
    facts.push({ label: 'Blocked on', value: BLOCKED_ON[top.signature] })

    const times = group.map((f) => f.at).filter((t): t is string => Boolean(t))
    const oldestAt = times.length
      ? times.reduce((a, b) => (new Date(a) < new Date(b) ? a : b))
      : null

    cases.push({
      key,
      kind,
      title,
      subtitle,
      brief: briefOf(top, group),
      badge: BADGE[top.signature],
      tone: toneOf(top.signature),
      action: ACTION[top.signature],
      facts,
      blockedOn: BLOCKED_ON[top.signature],
      score,
      signatures,
      otherSignals: signatures.length - 1,
      findings: group,
      orders,
      oldestAt,
    })
  }

  return cases.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const at = a.oldestAt ? new Date(a.oldestAt).getTime() : Infinity
    const bt = b.oldestAt ? new Date(b.oldestAt).getTime() : Infinity
    return at - bt
  })
}

export function label(status: string): string {
  const map: Record<string, string> = {
    NEW: 'Preparing',
    WAITING_FOR_PICKUP: 'Awaiting pickup',
    IN_TRANSIT: 'In transit',
    DELIVERED: 'Delivered',
  }
  return map[status] ?? status.toLowerCase().replace(/_/g, ' ')
}

/** How long this has been sitting. Compact, tabular. */
export function ago(iso: string | null): string | null {
  if (!iso) return null
  const hours = (SNAPSHOT_AT.getTime() - new Date(iso).getTime()) / 3_600_000
  if (hours < 1) return 'New'
  if (hours < 24) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}
