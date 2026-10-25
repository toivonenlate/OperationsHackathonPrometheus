// The live layer: the snapshot, played forward.
//
// The dataset is one frozen moment. For the demo this module runs a clock from
// that moment and moves the world along it: cars on the road advance at road
// speed, booked cars leave when their pickup slot comes, drivers send the odd
// message, and BahnBot raises a suggestion when something it watches goes
// wrong. Every decision an operator makes, on the map or on a case page, lands
// here, so every open tab sees the same state.
//
// It is a simulation and the screen says so. Nothing is written back to the
// dataset; a server restart, or Reset, starts again from the snapshot.
import { SNAPSHOT_AT, load } from './data'
import { buildCases } from './cases'
import { type Approval, type Proposal, proposeFor } from './propose'
import { type OpsOrder, type Risk, buildOps } from './ops'
import { type StoryItem, plain } from './story'

const HOUR = 3_600_000
const MIN = 60_000
const TICK_MS = 1000
const EVENTS_KEPT = 300
const HARD_ENOUGH = 11

/* ------------------------------------------------------------------ types */

export type Suggestion = {
  id: string
  caseKey: string | null
  orderIds: string[]
  title: string
  because: string | null
  approval: Approval
  approver: string | null
  changes: string[]
  unchanged: string[]
  draft: Proposal['draft']
  /** From a case's proposal, or raised by BahnBot while watching the live feed. */
  source: 'case' | 'watch'
  rule: 'case' | 'eta' | 'stale' | 'arrival' | 'close'
  command: string
  /** Sim time it was raised, and wall time, so the screen can flag what is new. */
  raisedAt: number
  raisedReal: number
}

export type Verdict = 'approved' | 'rejected'

export type Decision = {
  id: string
  title: string
  verdict: Verdict
  edited: boolean
  approval: Approval
  orderIds: string[]
  at: number
}

export type LiveOrder = {
  status: string
  lane: string
  progress: number | null
  remainingKm: number | null
  eta: number | null
  /** Sim time of the last position report. */
  fixAt: number | null
  risk: Risk
  /** Every suggestion from its case has been decided. */
  settled: boolean
}

export type LiveEvent = {
  id: number
  t: number
  actor: 'operator' | 'driver' | 'agent' | 'other'
  cmd: string
  orderId: string | null
  toState: string | null
  text: string
}

export type LiveState = {
  rev: number
  simNow: number
  snapshot: number
  speed: number
  paused: boolean
  orders: Record<string, LiveOrder>
  suggestions: Suggestion[]
  decisions: Decision[]
  events: LiveEvent[]
  story: Record<string, StoryItem[]>
  owners: Record<string, string>
}

export type Action =
  | { type: 'decide'; id: string; verdict: Verdict; body?: string }
  | { type: 'assign'; caseKey: string }
  | { type: 'control'; speed?: number; paused?: boolean }
  | { type: 'reset' }

export const SPEEDS = [1, 60, 600] as const

/* ------------------------------------------------------------------ world */

type Reply = { at: number; orderId: string; actor: StoryItem['actor']; who: string; text: string; then?: () => void }

type World = {
  state: LiveState
  dormant: Map<string, Suggestion>
  base: Map<string, OpsOrder>
  kmh: Map<string, number>
  /** Moving, but the app has gone quiet: no position until someone asks. */
  quiet: Set<string>
  raised: Set<string>
  /** Orders whose customer has agreed a new time, so a slip is no longer news. */
  repromised: Set<string>
  loggedFix: Map<string, number>
  lastRaised: number
  replies: Reply[]
  seq: number
  rand: () => number
}

// Seeded, so a demo plays the same way twice from Reset.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const first = (name: string | null) => (name ? name.split(' ')[0] : 'the driver')

function create(): World {
  const data = load()
  const model = buildOps(data)
  const snapshot = SNAPSHOT_AT.getTime()
  const rand = rng(20261021)

  // The hard cases' proposals are the queue. The rest are kept, so their case
  // pages can still decide them, but they do not crowd the map.
  const suggestions: Suggestion[] = []
  const dormant = new Map<string, Suggestion>()
  for (const c of buildCases(data)) {
    const proposed = proposeFor(c.key, data)
    for (const p of proposed?.proposals ?? []) {
      const into = (x: Suggestion) => (c.score < HARD_ENOUGH ? dormant.set(x.id, x) : suggestions.push(x))
      into({
        id: p.id,
        caseKey: c.key,
        orderIds: c.orders.map((o) => o.id),
        title: p.title,
        because: plain(p.because),
        approval: p.approval,
        approver: p.approver,
        changes: p.changes,
        unchanged: p.unchanged,
        draft: p.draft,
        source: 'case',
        rule: 'case',
        command: p.command,
        raisedAt: snapshot,
        raisedReal: 0,
      })
    }
  }

  const orders: Record<string, LiveOrder> = {}
  const kmh = new Map<string, number>()
  const quiet = new Set<string>()
  for (const o of model.orders) {
    const moving = o.status === 'IN_TRANSIT'
    const fixAt = o.feedAgeH !== null ? snapshot - o.feedAgeH * HOUR : null
    if (moving && o.feedAgeH !== null && o.feedAgeH > 6) quiet.add(o.id)
    const speed = 68 + rand() * 26
    kmh.set(o.id, speed)
    orders[o.id] = {
      status: o.status,
      lane: o.lane,
      progress: o.progress,
      remainingKm: o.remainingKm,
      eta: o.eta ? new Date(o.eta).getTime() : null,
      fixAt,
      risk: o.risk,
      settled: false,
    }
  }

  return {
    state: {
      rev: 0,
      simNow: snapshot,
      snapshot,
      speed: 60,
      paused: false,
      orders,
      suggestions,
      decisions: [],
      events: [],
      story: {},
      owners: {},
    },
    dormant,
    base: new Map(model.orders.map((o) => [o.id, o])),
    kmh,
    quiet,
    raised: new Set(),
    repromised: new Set(),
    loggedFix: new Map(),
    lastRaised: 0,
    replies: [],
    seq: 0,
    rand,
  }
}

/* ------------------------------------------------------------------ helpers */

function log(w: World, e: Omit<LiveEvent, 'id' | 't'> & { t?: number }) {
  w.state.events.push({ id: ++w.seq, t: e.t ?? w.state.simNow, ...e })
  if (w.state.events.length > EVENTS_KEPT) w.state.events.splice(0, w.state.events.length - EVENTS_KEPT)
}

function tell(w: World, orderId: string, item: Omit<StoryItem, 't' | 'internal' | 'language'> & { internal?: boolean }) {
  const list = (w.state.story[orderId] ??= [])
  list.push({ t: w.state.simNow, internal: false, language: null, ...item })
}

function raise(w: World, s: Omit<Suggestion, 'raisedAt' | 'raisedReal' | 'source' | 'caseKey' | 'changes' | 'unchanged'> & Partial<Pick<Suggestion, 'changes' | 'unchanged'>>) {
  const key = `${s.rule}:${s.orderIds[0]}`
  if (w.raised.has(key)) return false
  w.raised.add(key)
  w.state.suggestions.unshift({
    caseKey: null,
    source: 'watch',
    changes: [],
    unchanged: [],
    ...s,
    raisedAt: w.state.simNow,
    raisedReal: Date.now(),
  })
  w.lastRaised = w.state.simNow
  for (const id of s.orderIds) {
    tell(w, id, { actor: 'agent', who: 'BahnBot', kind: 'raised', text: `Suggested: ${s.title}` })
  }
  log(w, { actor: 'agent', cmd: 'proposal.created', orderId: s.orderIds[0], toState: null, text: `BahnBot suggests: ${s.title}` })
  return true
}

const TZ: Record<string, string> = { FI: 'Europe/Helsinki', DK: 'Europe/Copenhagen', SE: 'Europe/Stockholm' }

/** A time on the clock of the country it happens in. */
const clock = (t: number, country: string) =>
  new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ[country] ?? 'Europe/Berlin' })

const late = (ms: number) => {
  const m = Math.round(ms / MIN)
  return m < 90 ? `${m} min` : `${Math.round(m / 60)} h`
}

/* ------------------------------------------------------------------ the step */

const CHATTER = [
  (o: OpsOrder) => `Fuel stop, back on the road in 15 min.`,
  (o: OpsOrder, km: number) => `All good, about ${Math.round(km)} km to ${o.to}.`,
  (o: OpsOrder) => `Slow traffic before ${o.to}, maybe 20 min behind.`,
  () => `Car drives fine. Tyre pressure light came on once, checked, it is ok.`,
  () => `Short break, back in 30.`,
]

const ROUTINE = [
  (o: OpsOrder) => `Reminded ${first(o.driver)} about the pickup at ${o.from}`,
  (o: OpsOrder) => `Confirmed the pickup slot with the dealer in ${o.from}`,
  (o: OpsOrder) => `Sent ${o.customer ?? 'the customer'} the tracking link for ${o.ref}`,
  (o: OpsOrder) => `Checked ${first(o.driver)}'s travel back from ${o.to}`,
]

function step(w: World, dt: number) {
  const s = w.state
  const now = s.simNow
  const pick = <T,>(xs: T[]) => xs[Math.floor(w.rand() * xs.length)]

  for (const [id, lo] of Object.entries(s.orders)) {
    const o = w.base.get(id)!

    // A booked car leaves when its slot comes, if someone is there to drive it.
    if (
      lo.status !== 'IN_TRANSIT' &&
      lo.status !== 'DELIVERED' &&
      lo.lane === 'booked' &&
      o.driver &&
      o.pickupAt !== null &&
      o.pickupAt > s.snapshot &&
      o.pickupAt <= now
    ) {
      lo.status = 'IN_TRANSIT'
      lo.lane = 'moving'
      lo.progress = 0
      lo.remainingKm = o.distanceKm ?? 400
      lo.fixAt = now
      tell(w, id, { actor: 'driver', who: o.driver, kind: 'did', text: 'Car picked up' })
      log(w, { actor: 'driver', cmd: 'vehicle.picked_up', orderId: id, toState: 'IN_TRANSIT', text: `${o.driver} picked up ${o.ref} in ${o.from}` })
      continue
    }

    if (lo.status !== 'IN_TRANSIT') continue
    if (w.quiet.has(id)) continue

    const total = o.distanceKm ?? (lo.remainingKm !== null && lo.progress ? lo.remainingKm / (1 - lo.progress) : 400)
    const v = w.kmh.get(id)!
    const left = Math.max(0, (lo.remainingKm ?? total) - (v * dt) / HOUR)
    lo.remainingKm = Math.round(left)
    lo.progress = Math.min(1, Math.max(lo.progress ?? 0, 1 - left / Math.max(total, 1)))
    lo.fixAt = now
    lo.eta = now + (left / v) * HOUR

    if ((w.loggedFix.get(id) ?? 0) + 2 * HOUR <= now) {
      w.loggedFix.set(id, now)
      log(w, { actor: 'other', cmd: 'tracking.observed', orderId: id, toState: null, text: `Position report · ${o.ref} · ${lo.remainingKm} km to ${o.to}` })
    }

    if (left <= 0) {
      lo.status = 'DELIVERED'
      lo.lane = 'delivered'
      lo.progress = null
      lo.remainingKm = null
      lo.eta = null
      tell(w, id, { actor: 'driver', who: o.driver ?? 'Driver', kind: 'did', text: `Car delivered in ${o.to}` })
      log(w, { actor: 'driver', cmd: 'vehicle.delivered', orderId: id, toState: 'DELIVERED', text: `${o.ref} delivered in ${o.to}` })
      // What BahnBot was asking about the drive no longer matters.
      const moot = s.suggestions.filter((x) => x.source === 'watch' && x.orderIds.includes(id))
      for (const x of moot) {
        s.suggestions.splice(s.suggestions.indexOf(x), 1)
        log(w, { actor: 'agent', cmd: 'proposal.withdrawn', orderId: id, toState: null, text: `BahnBot withdrew: ${x.title} (car delivered)` })
      }
      // A clean handover is routine and BahnBot closes it alone. One with a
      // doubt about the photos waits for a person.
      if (w.rand() < 0.65) {
        tell(w, id, { actor: 'agent', who: 'BahnBot', kind: 'did', text: 'Checked the handover photos and closed the order' })
        log(w, { actor: 'agent', cmd: 'order.closed', orderId: id, toState: 'CLOSED', text: `BahnBot closed ${o.ref} · photos complete, fee released` })
        continue
      }
      raise(w, {
        id: `watch:close:${id}`,
        orderIds: [id],
        rule: 'close',
        command: 'order.close',
        title: `Close ${o.ref}: check the handover photos and release ${first(o.driver)}'s fee`,
        because: `${o.ref} was delivered in ${o.to} at ${clock(now, o.toCountry)}. One of the eight handover photos is too dark to show the odometer, so BahnBot will not accept the set alone.`,
        approval: 'NEEDS_APPROVAL',
        approver: 'ops-evidence',
        draft: null,
        changes: ['Accepts the photo set as it is.', "Releases the driver's fee for payment."],
        unchanged: ['The customer invoice, which already went out.'],
      })
    }
  }

  // BahnBot watches the road. At most one new suggestion per tick, so they arrive one by one.
  let raisedOne = now - w.lastRaised < 20 * MIN
  for (const [id, lo] of Object.entries(s.orders)) {
    if (raisedOne || lo.status !== 'IN_TRANSIT' || now - s.snapshot < 8 * MIN) continue
    const o = w.base.get(id)!

    if (w.quiet.has(id) && lo.fixAt !== null && now - lo.fixAt > 3 * HOUR) {
      // The case may already be asking for exactly this.
      const asked = s.suggestions.some((x) => x.orderIds.includes(id) && x.command === 'driver.request_position')
      if (!asked) {
        raisedOne = raise(w, {
          id: `watch:stale:${id}`,
          orderIds: [id],
          rule: 'stale',
          command: 'driver.request_position',
          title: `Ask ${first(o.driver)} for a current position on ${o.ref}`,
          because: `No position from ${first(o.driver)}'s app for ${late(now - lo.fixAt)}. The car should be on the road to ${o.to}.`,
          approval: 'AGENT_SENDS',
          approver: null,
          draft: {
            kind: 'DRAFT',
            to: o.driver ?? 'the driver',
            language: 'en',
            body: `Hi ${first(o.driver)}, your app has not sent a position for a while. Where are you now, and when do you expect to reach ${o.to}?`,
          },
          changes: ['Sends one message to the driver.'],
          unchanged: ['The delivery promise and the route.'],
        })
        continue
      }
    }

    if (o.promiseEnd !== null && lo.eta !== null && !w.repromised.has(id) && lo.eta > o.promiseEnd + 20 * MIN) {
      raisedOne = raise(w, {
        id: `watch:eta:${id}`,
        orderIds: [id],
        rule: 'eta',
        command: 'promise.notify_customer',
        title: `Tell ${o.customer ?? 'the customer'} that ${o.ref} will be about ${late(lo.eta - o.promiseEnd)} late`,
        because: `${first(o.driver)}'s ETA is ${clock(lo.eta, o.toCountry)}, after the promise that ends ${clock(o.promiseEnd, o.toCountry)}. ${lo.remainingKm} km still to go.`,
        approval: 'NEEDS_APPROVAL',
        approver: 'ops-support',
        draft: {
          kind: 'DRAFT',
          to: o.customer ?? 'the customer',
          language: 'en',
          body: `Hello, your ${o.vehicle ?? 'car'} is on its way to ${o.to}. We now expect to arrive around ${clock(lo.eta, o.toCountry)}, later than we promised. Does that still work for you, or should we agree another time?`,
        },
        changes: ['Sends the customer a new arrival time and asks if it works.'],
        unchanged: ['The promise on the order, until the customer answers.'],
      })
      continue
    }

    const delivery = o.handover.find((h) => h.boundary === 'DELIVERY')
    if ((lo.progress ?? 0) > 0.8 && delivery && (delivery.level === 'block' || delivery.level === 'risk')) {
      raisedOne = raise(w, {
        id: `watch:arrival:${id}`,
        orderIds: [id],
        rule: 'arrival',
        command: 'handover.confirm_contact',
        title: `Confirm someone at ${delivery.place} can take ${o.ref} at ${clock(lo.eta!, o.toCountry)}`,
        because: delivery.checks.find((c) => c.level === delivery.level)?.text ?? 'The delivery contact has not confirmed.',
        approval: 'AGENT_SENDS',
        approver: null,
        draft: {
          kind: 'DRAFT',
          to: delivery.place,
          language: 'en',
          body: `Hello, our driver is bringing the ${o.vehicle ?? 'car'} (${o.ref}) and expects to arrive around ${clock(lo.eta!, o.toCountry)}. Will someone be there to receive it?`,
        },
        changes: ['Messages the delivery contact.'],
        unchanged: ['The arrival time and the route.'],
      })
    }
  }

  // Drivers talk, and the agents keep doing routine work.
  if (w.rand() < dt / (35 * MIN)) {
    const moving = Object.entries(s.orders).filter(([id, lo]) => lo.status === 'IN_TRANSIT' && !w.quiet.has(id) && w.base.get(id)!.driver)
    if (moving.length) {
      const [id, lo] = pick(moving)
      const o = w.base.get(id)!
      const text = pick(CHATTER)(o, lo.remainingKm ?? 0)
      tell(w, id, { actor: 'driver', who: o.driver!, kind: 'said', text })
      log(w, { actor: 'driver', cmd: 'message.received', orderId: id, toState: null, text: `${o.driver}: “${text}”` })
    }
  }
  if (w.rand() < dt / (25 * MIN)) {
    const waiting = Object.entries(s.orders).filter(([id, lo]) => lo.lane === 'booked' && w.base.get(id)!.driver)
    if (waiting.length) {
      const [id] = pick(waiting)
      const text = pick(ROUTINE)(w.base.get(id)!)
      tell(w, id, { actor: 'agent', who: 'BahnBot', kind: 'did', text })
      log(w, { actor: 'agent', cmd: 'agent.routine', orderId: id, toState: null, text: `BahnBot: ${text}` })
    }
  }

  // Answers to what was sent arrive a while later.
  for (const r of w.replies.filter((r) => r.at <= now)) {
    tell(w, r.orderId, { actor: r.actor, who: r.who, kind: 'said', text: r.text })
    log(w, { actor: r.actor, cmd: 'message.received', orderId: r.orderId, toState: null, text: `${r.who}: “${r.text}”` })
    r.then?.()
  }
  w.replies = w.replies.filter((r) => r.at > now)

  settle(w)
}

/** Risk follows what is still open: the case, a live suggestion that needs a yes, an alert. */
function settle(w: World) {
  const s = w.state
  const pendingCase = new Set<string>()
  const pendingWatch = new Set<string>()
  for (const x of s.suggestions) {
    for (const id of x.orderIds) {
      if (x.source === 'case') pendingCase.add(id)
      else if (x.approval !== 'AGENT_SENDS') pendingWatch.add(id)
    }
  }
  const decided = new Set(s.decisions.flatMap((d) => d.orderIds))
  for (const [id, lo] of Object.entries(s.orders)) {
    const o = w.base.get(id)!
    lo.settled = Boolean(o.caseKey) && !pendingCase.has(id) && decided.has(id)
    const open = o.caseKey && !lo.settled
    lo.risk =
      open && (o.risk === 'critical' || o.risk === 'warn')
        ? o.risk
        : pendingWatch.has(id) || (!lo.settled && o.alerts.length)
          ? 'warn'
          : lo.status === 'IN_TRANSIT'
            ? 'moving'
            : lo.status === 'DELIVERED'
              ? 'done'
              : 'idle'
  }
}

/* ------------------------------------------------------------------ decisions */

function decide(w: World, id: string, verdict: Verdict, body?: string): string | null {
  const s = w.state
  const i = s.suggestions.findIndex((x) => x.id === id)
  const x = i >= 0 ? s.suggestions.splice(i, 1)[0] : w.dormant.get(id)
  if (!x) return 'Already decided, or no longer open.'
  w.dormant.delete(id)
  const edited = Boolean(body && x.draft && body.trim() !== x.draft.body.trim())
  s.decisions.unshift({ id, title: x.title, verdict, edited, approval: x.approval, orderIds: x.orderIds, at: s.simNow })

  const word = verdict === 'rejected' ? 'Stopped' : edited ? 'Edited and approved' : x.approval === 'AGENT_SENDS' ? 'Sent' : 'Approved'
  log(w, { actor: 'operator', cmd: verdict === 'rejected' ? 'proposal.rejected' : 'proposal.approved', orderId: x.orderIds[0] ?? null, toState: null, text: `You: ${word.toLowerCase()} · ${x.title}` })
  for (const oid of x.orderIds) tell(w, oid, { actor: 'operator', who: 'You', kind: 'decided', text: `${word}: ${x.title}` })

  if (verdict === 'approved') {
    const lead = x.orderIds[0]
    const o = lead ? w.base.get(lead) : undefined
    if (x.draft && lead) {
      const text = x.draft.kind === 'DRAFT' ? (body ?? x.draft.body) : `Replied, covering: ${x.draft.body.slice(0, 140)}`
      tell(w, lead, { actor: 'agent', who: 'BahnBot', kind: x.draft.kind === 'DRAFT' ? 'said' : 'did', text })
      log(w, { actor: 'agent', cmd: 'message.sent', orderId: lead, toState: null, text: `BahnBot → ${x.draft.to}` })
    }
    const later = (min: number) => w.state.simNow + (min + w.rand() * min) * MIN
    if (o && lead) {
      if (x.command === 'driver.request_position' || x.command === 'driver.confirm_positioning') {
        for (const oid of x.orderIds) {
          const q = w.base.get(oid)!
          if (!w.quiet.has(oid)) continue
          w.replies.push({
            at: later(12),
            orderId: oid,
            actor: 'driver',
            who: q.driver ?? 'Driver',
            text: `Sorry, phone died. On the road to ${q.to}, will keep the app on now.`,
            then: () => {
              w.quiet.delete(oid)
              const lo = w.state.orders[oid]
              // They kept driving while the app was quiet.
              const away = (w.state.simNow - (lo.fixAt ?? w.state.simNow)) / HOUR
              const gone = Math.min((lo.remainingKm ?? 0) * 0.8, away * 60)
              lo.remainingKm = Math.round((lo.remainingKm ?? 0) - gone)
              lo.fixAt = w.state.simNow
              log(w, { actor: 'other', cmd: 'tracking.observed', orderId: oid, toState: null, text: `Position back · ${q.ref} · ${lo.remainingKm} km to ${q.to}` })
            },
          })
        }
      } else if (x.rule === 'eta') {
        w.replies.push({
          at: later(15),
          orderId: lead,
          actor: 'other',
          who: o.customer ?? 'Customer',
          text: 'Thanks for telling me. That time is fine, I will be home.',
          then: () => {
            w.repromised.add(lead)
            tell(w, lead, { actor: 'agent', who: 'BahnBot', kind: 'did', text: 'Moved the delivery promise to the new ETA, agreed by the customer' })
          },
        })
      } else if (x.rule === 'arrival') {
        w.replies.push({ at: later(10), orderId: lead, actor: 'other', who: 'Site contact', text: 'Yes, someone is here until 18:00. Use the side gate.' })
      } else if (x.rule === 'close') {
        log(w, { actor: 'operator', cmd: 'order.closed', orderId: lead, toState: 'CLOSED', text: `${o.ref} closed · driver fee released` })
      } else if (x.draft?.kind === 'DRAFT' || x.approval === 'AGENT_SENDS') {
        if (o.driver) w.replies.push({ at: later(20), orderId: lead, actor: 'driver', who: o.driver, text: 'Ok, thanks. Will do.' })
      }
    }
  }
  settle(w)
  return null
}

/* ------------------------------------------------------------------ the singleton */

type Live = {
  world: World
  timer: ReturnType<typeof setInterval> | null
  listeners: Set<(json: string) => void>
}

// One world per server process, kept across hot reloads of this module.
const g = globalThis as unknown as { __bahnLive?: Live }

function start(l: Live) {
  if (l.timer) clearInterval(l.timer)
  l.timer = setInterval(() => {
    const s = l.world.state
    if (!s.paused) {
      const dt = s.speed * TICK_MS
      s.simNow += dt
      step(l.world, dt)
    }
    broadcast(l)
  }, TICK_MS)
  l.timer.unref?.()
}

function broadcast(l: Live) {
  l.world.state.rev++
  const json = JSON.stringify(l.world.state)
  for (const fn of l.listeners) fn(json)
}

function live(): Live {
  if (!g.__bahnLive) {
    g.__bahnLive = { world: create(), timer: null, listeners: new Set() }
    start(g.__bahnLive)
  }
  return g.__bahnLive
}

export function snapshotJson(): string {
  return JSON.stringify(live().world.state)
}

export function subscribe(fn: (json: string) => void): () => void {
  const l = live()
  l.listeners.add(fn)
  return () => l.listeners.delete(fn)
}

export function act(a: Action): { ok: boolean; error?: string } {
  const l = live()
  const w = l.world
  let error: string | null = null
  if (a.type === 'decide') error = decide(w, a.id, a.verdict, a.body)
  else if (a.type === 'assign') {
    w.state.owners[a.caseKey] = 'You'
    log(w, { actor: 'operator', cmd: 'case.assigned', orderId: null, toState: null, text: `You took ${a.caseKey.replace(':', ' ')}` })
  } else if (a.type === 'control') {
    if (a.speed !== undefined && (SPEEDS as readonly number[]).includes(a.speed)) w.state.speed = a.speed
    if (a.paused !== undefined) w.state.paused = a.paused
  } else if (a.type === 'reset') {
    l.world = create()
  }
  broadcast(l)
  return error ? { ok: false, error } : { ok: true }
}
