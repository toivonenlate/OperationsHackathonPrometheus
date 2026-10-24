// What makes a case hard.
//
// A case is hard when the records cannot settle it: something is missing,
// contradictory, split across systems, or depends on a person rather than a
// car. Each detector below recognises one of those shapes. They are plain
// functions over the snapshot: no model, no guessing, and every finding
// carries the records it came from.
import {
  type Dataset,
  SNAPSHOT_AT,
  hoursBefore,
  liveAssignments,
  load,
} from './data'

export type Signature =
  | 'unknown-outcome'
  | 'needs-human'
  | 'person-multiplexing'
  | 'split-across-systems'
  | 'cannot-be-filed'
  | 'authority-gap'
  | 'unapproved-promise'
  | 'rejected-evidence'
  | 'stale-signal'
  | 'custody-open'
  | 'open-incident'
  | 'ownerless'
  | 'awaiting-review'
  | 'approved-not-done'
  | 'open-work-item'
  | 'multiple-open-threads'

export type EvidenceRef = { table: string; id: string }

export type Finding = {
  signature: Signature
  subject: { kind: 'driver' | 'order'; id: string }
  detail: string
  evidence: EvidenceRef[]
  at: string | null
}

/** How much each shape of unsettledness counts. Tune these with the evals. */
export const WEIGHT: Record<Signature, number> = {
  'unknown-outcome': 5,
  'needs-human': 4,
  'person-multiplexing': 3,
  'split-across-systems': 3,
  'cannot-be-filed': 3,
  'authority-gap': 3,
  'unapproved-promise': 2,
  'rejected-evidence': 2,
  'stale-signal': 2,
  'custody-open': 2,
  'open-incident': 2,
  ownerless: 1,
  'awaiting-review': 1,
  'approved-not-done': 1,
  'open-work-item': 1,
  'multiple-open-threads': 1,
}

/** Plain words for the chips. */
export const SIGNATURE_LABEL: Record<Signature, string> = {
  'unknown-outcome': 'Outcome unknown',
  'needs-human': 'Needs a person',
  'person-multiplexing': 'One driver, several cars',
  'split-across-systems': 'Split across systems',
  'cannot-be-filed': 'Cannot be filed',
  'authority-gap': 'Nobody authorised',
  'unapproved-promise': 'Promise not agreed',
  'rejected-evidence': 'Evidence rejected',
  'stale-signal': 'Gone quiet',
  'custody-open': 'Keys unaccounted',
  'open-incident': 'Open incident',
  ownerless: 'No owner',
  'awaiting-review': 'Waiting on review',
  'approved-not-done': 'Approved, not done',
  'open-work-item': 'Open check',
  'multiple-open-threads': 'Several threads',
}

const ORDER = (id: string) => ({ kind: 'order' as const, id })
const DRIVER = (id: string) => ({ kind: 'driver' as const, id })

/** Work-item kinds that are really "no one is recorded as able to permit this". */
const AUTHORITY_KINDS = new Set([
  'RECEIVER_AUTHORITY_CHECK',
  'KEY_HOLDER_STOCK_CHECK',
  'COMMERCIAL_RELEASE_HOLD',
  'SITE_HANDOVER_REVIEW',
])

/** Status in the words an operator would use out loud. */
const PLAIN_STATUS: Record<string, string> = {
  NEW: 'still being prepared',
  WAITING_FOR_PICKUP: 'waiting for pickup',
  IN_TRANSIT: 'on the road',
  DELIVERED: 'delivered',
}

const UNRESOLVED_INCIDENT = new Set([
  'NEEDS_HUMAN',
  'AWAITING_DECISION',
  'INVESTIGATING',
])

export function detect(data: Dataset = load()): Finding[] {
  const out: Finding[] = []
  const push = (f: Finding) => out.push(f)

  // 1. An action was attempted and nobody knows whether it worked.
  for (const p of data.proposals) {
    if (p.status === 'FAILED') {
      push({
        signature: 'unknown-outcome',
        subject: ORDER(p.order_id),
        detail: `${p.command} was approved and attempted. ${
          p.execution?.error ?? 'No outcome was recorded.'
        }`,
        evidence: [{ table: 'agent_proposals', id: p.id }],
        at: p.execution?.attempted_at ?? p.created_at,
      })
    }
    if (p.status === 'PENDING_REVIEW') {
      push({
        signature: 'awaiting-review',
        subject: ORDER(p.order_id),
        detail: `${p.summary} (${p.command})`,
        evidence: [{ table: 'agent_proposals', id: p.id }],
        at: p.created_at,
      })
    }
    if (p.status === 'APPROVED_AWAITING_EXECUTION') {
      push({
        signature: 'approved-not-done',
        subject: ORDER(p.order_id),
        detail: `${p.command} was approved${
          p.review?.decision_note ? ` — "${p.review.decision_note}"` : ''
        } but has not run.`,
        evidence: [{ table: 'agent_proposals', id: p.id }],
        at: p.review?.reviewed_at ?? p.created_at,
      })
    }
  }

  // 2. Incidents the records themselves say need a person.
  for (const i of data.incidents) {
    if (i.resolved_at || !UNRESOLVED_INCIDENT.has(i.status)) continue
    const explicit = i.status === 'NEEDS_HUMAN' || i.status === 'AWAITING_DECISION'
    const bits = [i.reported_symptom, i.reported_stop_text].filter(Boolean)
    push({
      signature: explicit ? 'needs-human' : 'open-incident',
      subject: ORDER(i.order_id),
      detail: bits.length
        ? bits.join('. ')
        : `${i.kind.toLowerCase().replace(/_/g, ' ')} is ${i.status
            .toLowerCase()
            .replace(/_/g, ' ')}.`,
      evidence: [{ table: 'incidents', id: i.id }],
      at: i.opened_at,
    })
    if (!i.owner) {
      push({
        signature: 'ownerless',
        subject: ORDER(i.order_id),
        detail: 'Open incident with nobody named on it.',
        evidence: [{ table: 'incidents', id: i.id }],
        at: i.opened_at,
      })
    }
  }

  // 3. The case is about a person, not a car: one driver holding several cars.
  const live = liveAssignments(data)
  const byDriver = new Map<string, typeof live>()
  for (const a of live) {
    const list = byDriver.get(a.driver_id)
    if (list) list.push(a)
    else byDriver.set(a.driver_id, [a])
  }
  const orderRef = new Map(data.orders.map((o) => [o.id, o.reference]))
  for (const [driverId, list] of byDriver) {
    if (list.length < 2) continue
    const active = list.filter(
      (a) => a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS',
    )
    if (active.length === 0) continue
    const orderStatus = new Map(data.orders.map((o) => [o.id, o.status]))
    const parts = list.map((a) => {
      const ref = orderRef.get(a.order_id) ?? a.order_id
      const where = PLAIN_STATUS[orderStatus.get(a.order_id) ?? ''] ?? 'booked'
      return `${ref} ${where}`
    })
    push({
      signature: 'person-multiplexing',
      subject: DRIVER(driverId),
      detail: `Holding ${list.length} cars at once — ${parts.join(', ')}. One leg's outcome gates the next.`,
      evidence: list.map((a) => ({ table: 'work_assignments', id: a.id })),
      at: null,
    })
  }

  // 4. The case has no single home: one driver with threads in both systems.
  const convByDriver = new Map<string, string[]>()
  const topicsByDriver = new Map<string, string[]>()
  const noteTopic = (driverId: string, raw: string | null) => {
    const topic = (raw ?? 'something unlabelled').toLowerCase().replace(/_/g, ' ')
    const list = topicsByDriver.get(driverId)
    if (list) list.push(topic)
    else topicsByDriver.set(driverId, [topic])
  }
  for (const c of data.conversations) {
    if (c.counterparty_type !== 'driver' || !c.counterparty_id) continue
    if (c.status !== 'OPEN') continue
    const list = convByDriver.get(c.counterparty_id)
    if (list) list.push(c.id)
    else convByDriver.set(c.counterparty_id, [c.id])
    noteTopic(c.counterparty_id, c.category)
  }
  const inboxByDriver = new Map<string, string[]>()
  for (const t of data.inbox) {
    if (t.counterparty_type !== 'driver' || !t.counterparty_id) continue
    const list = inboxByDriver.get(t.counterparty_id)
    if (list) list.push(t.id)
    else inboxByDriver.set(t.counterparty_id, [t.id])
    noteTopic(t.counterparty_id, t.category)
  }
  /** "driver availability twice, expense payout, general policy" */
  const topicPhrase = (driverId: string): string => {
    const counts = new Map<string, number>()
    for (const t of topicsByDriver.get(driverId) ?? []) {
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts]
      .map(([t, n]) => (n > 1 ? `${t} ${n === 2 ? 'twice' : `${n} times`}` : t))
      .join(', ')
  }
  for (const driverId of new Set([...convByDriver.keys(), ...inboxByDriver.keys()])) {
    const convs = convByDriver.get(driverId) ?? []
    const threads = inboxByDriver.get(driverId) ?? []
    const evidence: EvidenceRef[] = [
      ...convs.map((id) => ({ table: 'conversations', id })),
      ...threads.map((id) => ({ table: 'support_inbox_threads', id })),
    ]
    if (convs.length && threads.length) {
      push({
        signature: 'split-across-systems',
        subject: DRIVER(driverId),
        detail: `${convs.length + threads.length} open threads with one driver, in two different systems: ${topicPhrase(
          driverId,
        )}. No single page holds this case.`,
        evidence,
        at: null,
      })
    } else if (convs.length + threads.length > 1) {
      push({
        signature: 'multiple-open-threads',
        subject: DRIVER(driverId),
        detail: `${convs.length + threads.length} open threads with the same driver: ${topicPhrase(driverId)}.`,
        evidence,
        at: null,
      })
    }
  }

  // 5. A message that cannot be filed against anything.
  for (const t of data.inbox) {
    if (t.link_state !== 'PENDING_MATCH' && t.link_state !== 'PENDING_IDENTITY') continue
    const subject =
      t.counterparty_type === 'driver' && t.counterparty_id
        ? DRIVER(t.counterparty_id)
        : ORDER(t.candidate_order_ids[0] ?? t.id)
    push({
      signature: 'cannot-be-filed',
      subject,
      detail:
        t.candidate_basis ??
        `Waiting on ${t.waiting_on ?? 'more information'} before it can be linked.`,
      evidence: [{ table: 'support_inbox_threads', id: t.id }],
      at: t.opened_at,
    })
  }

  // 6. Something must happen and no record says who may permit it.
  for (const w of data.workItems) {
    if (w.status !== 'OPEN') continue
    const authority = AUTHORITY_KINDS.has(w.kind)
    push({
      signature: authority ? 'authority-gap' : 'open-work-item',
      subject: ORDER(w.order_id),
      detail: w.summary,
      evidence: [{ table: 'work_items', id: w.id }],
      at: w.opened_at,
    })
  }
  for (const a of data.alerts) {
    if (a.status !== 'OPEN' || !a.order_id) continue
    if (a.signal.includes('RELEASE') || a.signal.includes('AUTHORITY')) {
      push({
        signature: 'authority-gap',
        subject: ORDER(a.order_id),
        detail: a.summary,
        evidence: [{ table: 'alerts', id: a.id }],
        at: a.triggered_at,
      })
    }
    if (!a.owner) {
      push({
        signature: 'ownerless',
        subject: ORDER(a.order_id),
        detail: `Open alert with nobody named on it: ${a.summary}`,
        evidence: [{ table: 'alerts', id: a.id }],
        at: a.triggered_at,
      })
    }
  }

  // 7. A delivery promise the customer never agreed to.
  // The dataset is explicit: a SYSTEM-calculated target or an OPS selection is
  // not evidence of customer approval.
  for (const w of data.timeWindows) {
    if (!w.is_selected) continue
    if (w.purpose !== 'CUSTOMER_DELIVERY_PROMISE') continue
    if (w.source === 'CUSTOMER') continue
    const order = data.orders.find((o) => o.id === w.order_id)
    if (!order || order.status === 'DELIVERED' || order.cancelled_at) continue
    push({
      signature: 'unapproved-promise',
      subject: ORDER(w.order_id),
      detail: `The delivery promise was set by ${w.source}, not agreed with the customer.`,
      evidence: [{ table: 'time_windows', id: w.id }],
      at: w.start_at,
    })
  }

  // 8. Evidence that was submitted and refused.
  for (const p of data.proofs) {
    if (p.status !== 'REJECTED') continue
    push({
      signature: 'rejected-evidence',
      subject: ORDER(p.order_id),
      detail: `${p.kind.toLowerCase().replace(/_/g, ' ')} were rejected and not replaced.`,
      evidence: [{ table: 'proofs', id: p.id }],
      at: p.reviewed_at,
    })
  }

  // 9. A car is moving, the app has gone quiet, and the promise still stands.
  const latestPosition = new Map<string, string>()
  for (const t of data.tracking) {
    if (t.source !== 'driver_app') continue
    const seen = latestPosition.get(t.order_id)
    if (!seen || new Date(t.observed_at) > new Date(seen)) {
      latestPosition.set(t.order_id, t.observed_at)
    }
  }
  for (const o of data.orders) {
    if (o.status !== 'IN_TRANSIT' || o.cancelled_at) continue
    const promise = data.timeWindows.find(
      (w) =>
        w.order_id === o.id &&
        w.is_selected &&
        w.purpose === 'CUSTOMER_DELIVERY_PROMISE',
    )
    if (!promise || new Date(promise.end_at) < SNAPSHOT_AT) continue
    const seen = latestPosition.get(o.id)
    const quiet = hoursBefore(seen ?? null)
    if (quiet === null) {
      push({
        signature: 'stale-signal',
        subject: ORDER(o.id),
        detail: 'Car is moving and the driver app has never reported a position.',
        evidence: [{ table: 'orders', id: o.id }],
        at: null,
      })
    } else if (quiet > 6) {
      push({
        signature: 'stale-signal',
        subject: ORDER(o.id),
        detail: `No position for ${Math.round(quiet)} hours while the promise still stands.`,
        evidence: [{ table: 'orders', id: o.id }],
        at: seen ?? null,
      })
    }
  }

  // 10. A tracked key set with no release on the record.
  for (const asset of data.custodyAssets) {
    const events = data.custodyAssetEvents.filter(
      (e) => e.custody_asset_id === asset.id,
    )
    push({
      signature: 'custody-open',
      subject: ORDER(asset.order_id),
      detail: `A tracked ${asset.kind
        .toLowerCase()
        .replace(/_/g, ' ')} has ${events.length} recorded event${
        events.length === 1 ? '' : 's'
      } and no confirmed release.`,
      evidence: [
        { table: 'custody_assets', id: asset.id },
        ...events.map((e) => ({ table: 'custody_asset_events', id: e.id })),
      ],
      at: null,
    })
  }

  return out
}
