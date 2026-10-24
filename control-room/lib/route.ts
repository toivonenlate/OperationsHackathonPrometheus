// Where the car is going, and when it has to be there.
//
// Both drawn only from records. The pickup and delivery are real addresses on
// the active plan; a ferry leg's state comes from whether a reservation exists,
// not from whether one was attempted. Home cities are never used as locations —
// the dataset is explicit that a driver's home city is not a position.
import {
  type Dataset,
  SNAPSHOT_AT,
  load,
  loadRoute,
} from './data'

export type Leg = {
  kind: 'PLACE' | 'LINK'
  label: string
  sub: string | null
  tone?: 'unknown' | 'risk'
}

export type RouteView = {
  legs: Leg[]
  distanceKm: number | null
  mode: string | null
}

export type Milestone = {
  label: string
  at: string
  tone?: 'risk' | 'unknown'
  passed: boolean
}

export type TimelineView = {
  milestones: Milestone[]
  /** Hours from the snapshot to the next unpassed milestone. */
  hoursToNext: number | null
  nextLabel: string | null
  /** 0–1 position of "now" between the first and last milestone. */
  nowAt: number
}

const PLACE_KIND: Record<string, string> = {
  DEALERSHIP: 'Dealership',
  PRIVATE_HOME: 'Private address',
  YARD: 'Yard',
  TRANSFER_YARD: 'Transfer yard',
  OTHER: 'One-off address',
}

/** A site's own name where it has one, otherwise plain words for its kind. */
function placeSub(a: { name: string | null; kind: string } | undefined): string | null {
  if (!a) return null
  if (a.name && a.name !== 'Private handoff') return a.name
  return PLACE_KIND[a.kind] ?? a.kind.toLowerCase().replace(/_/g, ' ')
}

const MODE: Record<string, string> = {
  DRIVE: 'Driven',
  DRIVE_WITH_FERRY: 'Driven, with a ferry crossing',
  TRUCK: 'On a truck',
  DRIVE_WITH_TRAIN: 'Driven, with a train leg',
}

export function routeOf(orderId: string, data: Dataset = load()): RouteView | null {
  const { addresses, points, segments } = loadRoute()
  const order = data.orders.find((o) => o.id === orderId)
  if (!order?.active_plan_id) return null

  const planPoints = points
    .filter((p) => p.plan_id === order.active_plan_id)
    .sort((a, b) => a.sequence - b.sequence)
  if (!planPoints.length) return null

  const planSegments = segments
    .filter((s) => s.plan_id === order.active_plan_id)
    .sort((a, b) => a.sequence - b.sequence)

  const addr = new Map(addresses.map((a) => [a.id, a]))
  const legs: Leg[] = []

  planPoints.forEach((p, i) => {
    const a = addr.get(p.address_id)
    legs.push({
      kind: 'PLACE',
      label: a ? `${a.city}, ${a.country}` : p.role.toLowerCase(),
      sub: placeSub(a),
    })
    const seg = planSegments.find((s) => s.from_point_id === p.id)
    if (seg && i < planPoints.length - 1) {
      const link = linkFor(seg, orderId)
      if (link) legs.push(link)
    }
  })

  const total = planSegments.reduce((n, s) => n + (s.distance_km ?? 0), 0)
  return {
    legs,
    distanceKm: total || null,
    mode: MODE[planSegments[0]?.transport_mode ?? ''] ?? planSegments[0]?.transport_mode ?? null,
  }
}

/** The middle of a leg: a ferry, and whether it is actually booked. */
function linkFor(
  seg: { transport_mode: string; distance_km: number | null },
  orderId: string,
): Leg | null {
  if (!seg.transport_mode.includes('FERRY')) {
    return seg.distance_km
      ? { kind: 'LINK', label: `${seg.distance_km.toLocaleString('en-GB')} km`, sub: null }
      : null
  }
  const { reservations, options } = loadRoute()
  const booked = reservations.find(
    (r) => r.order_id === orderId && r.kind.toUpperCase().includes('FERRY'),
  )
  if (booked) {
    return {
      kind: 'LINK',
      label: 'Ferry booked',
      sub: booked.departure_at
        ? `departs ${booked.departure_at.slice(5, 16).replace('T', ' ')}`
        : null,
    }
  }
  const quoted = options.filter((o) => o.order_id === orderId)
  return {
    kind: 'LINK',
    label: 'Ferry crossing',
    sub: quoted.length
      ? `${quoted.length} option${quoted.length === 1 ? '' : 's'} checked, none booked`
      : 'no booking recorded',
    tone: 'unknown',
  }
}

export function timelineOf(orderId: string, data: Dataset = load()): TimelineView | null {
  const { options, reservations } = loadRoute()
  const ms: Milestone[] = []
  const now = SNAPSHOT_AT.getTime()

  const pickup = data.timeWindows.find(
    (w) => w.order_id === orderId && w.is_selected && w.purpose === 'SELECTED_PICKUP_SLOT',
  )
  if (pickup) {
    ms.push({ label: 'Pickup', at: pickup.start_at, passed: new Date(pickup.start_at).getTime() < now })
  }

  // The cutoff that actually bites: the earliest ferry check-in still ahead.
  const cutoffs = [
    ...options.filter((o) => o.order_id === orderId).map((o) => o.check_in_cutoff_at),
    ...reservations.filter((r) => r.order_id === orderId).map((r) => r.check_in_cutoff_at),
  ].filter((c): c is string => Boolean(c))
  const nextCutoff = cutoffs
    .filter((c) => new Date(c).getTime() > now)
    .sort()[0]
  if (nextCutoff) {
    ms.push({ label: 'Ferry check-in', at: nextCutoff, tone: 'unknown', passed: false })
  }

  const promise = data.timeWindows.find(
    (w) =>
      w.order_id === orderId && w.is_selected && w.purpose === 'CUSTOMER_DELIVERY_PROMISE',
  )
  if (promise) {
    ms.push({
      label: 'Delivery promise',
      at: promise.end_at,
      tone: promise.source !== 'CUSTOMER' ? 'risk' : undefined,
      passed: new Date(promise.end_at).getTime() < now,
    })
  }

  if (ms.length < 2) return null
  ms.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  const next = ms.find((m) => !m.passed) ?? null
  const start = new Date(ms[0].at).getTime()
  const end = new Date(ms[ms.length - 1].at).getTime()
  const span = Math.max(end - start, 1)

  return {
    milestones: ms,
    nextLabel: next?.label ?? null,
    hoursToNext: next ? (new Date(next.at).getTime() - now) / 3_600_000 : null,
    nowAt: Math.min(1, Math.max(0, (now - start) / span)),
  }
}

/** "2 d 11 h" — compact, for a gauge. */
export function until(hours: number): string {
  if (hours < 0) return 'passed'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${Math.floor(hours)} h`
  return `${Math.floor(hours / 24)} d ${Math.round(hours % 24)} h`
}
