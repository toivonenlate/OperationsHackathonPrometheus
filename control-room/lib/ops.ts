// The ops map's model: every order as a lane between two cities, plus the
// event log binned over time.
//
// Built once on the server and handed to the client as plain JSON, so the
// console can cross-filter without another round trip. Positions are city
// centres only. The dataset never gives a car's coordinates, so a moving car is
// drawn at its last reported progress along its lane, never at a guessed point.
import {
  type Dataset,
  SNAPSHOT_AT,
  load,
  loadLog,
  loadRoute,
  liveAssignments,
  vehicleFor,
} from './data'
import { buildCases } from './cases'
import { timelineOf } from './route'

const HARD_ENOUGH = 11

/** City centres, [lon, lat]. Only for drawing; never used as a car's position. */
export const CITY: Record<string, [number, number]> = {
  Helsinki: [24.94, 60.17],
  Espoo: [24.66, 60.21],
  Vantaa: [25.04, 60.29],
  Turku: [22.27, 60.45],
  Lahti: [25.66, 60.98],
  Tampere: [23.76, 61.5],
  Oulu: [25.47, 65.01],
  Seinäjoki: [22.84, 62.79],
  Stockholm: [18.07, 59.33],
  Gothenburg: [11.97, 57.71],
  Malmö: [13.0, 55.6],
  Copenhagen: [12.57, 55.68],
  Odense: [10.39, 55.4],
  Aarhus: [10.2, 56.16],
  Hamburg: [9.99, 53.55],
  Berlin: [13.4, 52.52],
  Leipzig: [12.37, 51.34],
  Cologne: [6.96, 50.94],
  Düsseldorf: [6.77, 51.23],
  Frankfurt: [8.68, 50.11],
  Stuttgart: [9.18, 48.78],
  Munich: [11.58, 48.14],
  Rotterdam: [4.48, 51.92],
  Antwerp: [4.4, 51.22],
  Lille: [3.06, 50.63],
  Paris: [2.35, 48.86],
  Lyon: [4.84, 45.76],
  Marseille: [5.37, 43.3],
  Vienna: [16.37, 48.21],
  Graz: [15.44, 47.07],
}

export type Risk = 'critical' | 'warn' | 'moving' | 'done' | 'idle'

export type OpsAlert = { signal: string; severity: string; status: string; summary: string }

export type OpsOrder = {
  id: string
  ref: string
  lane: string
  status: string
  routeKind: string
  from: string
  fromCountry: string
  to: string
  toCountry: string
  distanceKm: number | null
  ferry: boolean
  driver: string | null
  vehicle: string | null
  caseKey: string | null
  caseTitle: string | null
  caseBadge: string | null
  caseScore: number | null
  alerts: OpsAlert[]
  progress: number | null
  remainingKm: number | null
  eta: string | null
  /** Hours since the last position report, at the snapshot. */
  feedAgeH: number | null
  nextLabel: string | null
  hoursToNext: number | null
  risk: Risk
}

export type OpsEvent = {
  t: number
  actor: 'operator' | 'driver' | 'agent' | 'other'
  cmd: string
  orderId: string | null
  toState: string | null
}

export type OpsModel = {
  snapshot: number
  /** [lon, lat] for every city an order touches. */
  cities: Record<string, [number, number]>
  orders: OpsOrder[]
  events: OpsEvent[]
}

function actorOf(type: string): OpsEvent['actor'] {
  return type === 'operator' || type === 'driver' || type === 'agent' ? type : 'other'
}

export function buildOps(data: Dataset = load()): OpsModel {
  const { addresses, segments } = loadRoute()
  const { events } = loadLog()
  const addr = new Map(addresses.map((a) => [a.id, a]))
  const drivers = new Map(data.drivers.map((d) => [d.id, d]))

  // The hardest case an order belongs to, if any.
  const caseOf = new Map<string, ReturnType<typeof buildCases>[number]>()
  for (const c of buildCases(data)) {
    if (c.score < HARD_ENOUGH) continue
    for (const o of c.orders) {
      const prior = caseOf.get(o.id)
      if (!prior || prior.score < c.score) caseOf.set(o.id, c)
    }
  }

  const assignmentOf = new Map(liveAssignments(data).map((a) => [a.order_id, a]))

  const lastFix = new Map<string, Dataset['tracking'][number]>()
  for (const t of data.tracking) {
    const prior = lastFix.get(t.order_id)
    if (!prior || prior.observed_at < t.observed_at) lastFix.set(t.order_id, t)
  }

  const now = SNAPSHOT_AT.getTime()

  const orders: OpsOrder[] = data.orders.map((o) => {
    const from = addr.get(o.pickup_address_id)
    const to = addr.get(o.delivery_address_id)
    const plan = segments.filter((s) => s.plan_id === o.active_plan_id)
    const asg = assignmentOf.get(o.id)
    const v = vehicleFor(data, o.id)
    const c = caseOf.get(o.id) ?? null
    const fix = lastFix.get(o.id)
    const t = timelineOf(o.id, data)
    const alerts = data.alerts
      .filter((a) => a.order_id === o.id && a.status !== 'RESOLVED')
      .map((a) => ({ signal: a.signal, severity: a.severity, status: a.status, summary: a.summary }))

    const risk: Risk =
      c?.tone === 'critical'
        ? 'critical'
        : c || alerts.length
          ? 'warn'
          : o.status === 'IN_TRANSIT'
            ? 'moving'
            : o.status === 'DELIVERED'
              ? 'done'
              : 'idle'

    return {
      id: o.id,
      ref: o.reference,
      lane: o.cancelled_at ? 'cancelled' : o.display_lane,
      status: o.status,
      routeKind: o.route_kind,
      from: from?.city ?? '?',
      fromCountry: from?.country ?? '',
      to: to?.city ?? '?',
      toCountry: to?.country ?? '',
      distanceKm: plan.reduce((n, s) => n + (s.distance_km ?? 0), 0) || null,
      ferry: plan.some((s) => s.transport_mode.includes('FERRY')),
      driver: asg ? (drivers.get(asg.driver_id)?.display_name ?? null) : null,
      vehicle: v ? `${v.make} ${v.model}` : null,
      caseKey: c?.key ?? null,
      caseTitle: c?.title ?? null,
      caseBadge: c?.badge ?? null,
      caseScore: c?.score ?? null,
      alerts,
      progress: o.status === 'IN_TRANSIT' ? (fix?.progress_fraction ?? null) : null,
      remainingKm: o.status === 'IN_TRANSIT' ? (fix?.distance_remaining_km ?? null) : null,
      eta: o.status === 'IN_TRANSIT' ? (fix?.estimated_delivery_at ?? null) : null,
      feedAgeH: fix ? (now - new Date(fix.observed_at).getTime()) / 3_600_000 : null,
      nextLabel: t?.nextLabel ?? null,
      hoursToNext: t?.hoursToNext ?? null,
      risk,
    }
  })

  const cities: OpsModel['cities'] = {}
  for (const o of orders) {
    for (const city of [o.from, o.to]) if (CITY[city]) cities[city] = CITY[city]
  }

  return {
    snapshot: now,
    cities,
    orders,
    events: events
      .map((e) => ({
        t: new Date(e.recorded_at).getTime(),
        actor: actorOf(e.actor_type),
        cmd: e.command ?? 'event',
        orderId: e.order_id,
        toState: e.to_state,
      }))
      .sort((a, b) => a.t - b.t),
  }
}
