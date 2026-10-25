// Will someone be there to hand the car over?
//
// For each end of an order: when the driver is planned to arrive, whether the
// site is open then on its own clock, and whether the access route and the
// contact have actually been confirmed. Arrival comes from records only: the
// selected pickup slot, the driver's own ETA while moving, or else the
// customer's promise window. A site with no recorded hours is unknown, never
// assumed open.
import { type Dataset, type Site, SNAPSHOT_AT, load, loadHandover, loadRoute } from './data'
import { codeName } from './labels'

export type Level = 'block' | 'risk' | 'ok' | 'unknown'

export type Check = { level: Level; text: string }

export type HandoverEnd = {
  boundary: 'PICKUP' | 'DELIVERY'
  /** Already happened, so its checks no longer matter. */
  done: boolean
  /** The end the driver reaches next. */
  next: boolean
  place: string
  city: string
  arrive: string | null
  arriveSource: 'pickup slot' | 'driver ETA' | 'promise window' | null
  /** "Tue 21 Oct, 18:40" on the site's own clock. */
  local: string | null
  hoursToArrive: number | null
  checks: Check[]
  level: Level
  /** The next handover, within SOON_H of the snapshot, with something blocking or unconfirmed. */
  flagged: boolean
}

export const SOON_H = 48

const RANK: Record<Level, number> = { block: 0, risk: 1, unknown: 2, ok: 3 }
const worst = (checks: Check[]): Level =>
  checks.reduce<Level>((w, c) => (RANK[c.level] < RANK[w] ? c.level : w), 'ok')

const DAY_NAME: Record<string, string> = {
  Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays',
  Fri: 'Fridays', Sat: 'Saturdays', Sun: 'Sundays',
}

/** Weekday, minutes after midnight and a label, on a site's clock. */
function clock(t: number, tz: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(t)
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? ''
  const hh = Number(get('hour'))
  const mm = Number(get('minute'))
  return {
    weekday: get('weekday'),
    minute: hh * 60 + mm,
    time: `${get('hour')}:${get('minute')}`,
    label: `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')}`,
  }
}

/** The opening range for that weekday: [open, close] in minutes, 'closed', or null if not recorded. */
function hoursOn(site: Site, weekday: string): [number, number, string] | 'closed' | null {
  const h = site.opening_hours
  if (!h || !Object.keys(h).length) return null
  const key = weekday === 'Sat' ? 'sat' : weekday === 'Sun' ? 'sun' : 'mon_fri'
  if (!(key in h)) return null
  const v = h[key as keyof typeof h]
  if (!v) return 'closed'
  const m = v.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/)
  if (!m) return null
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4]), v.replace('-', '–')]
}

const SOURCE: Record<string, string> = {
  MANAGED_SITE_PROFILE: 'the site profile',
  HANDOFF_ACCESS_REPLY: 'a reply from the handover contact',
  DIRECT_HANDOFF_CONTACT_REPLY: 'a reply from the handover contact',
  CUSTOMER_AND_HANDOFF_CONTACT: 'the customer and handover contact',
  SITE_CONTACT_REPLY: 'a reply from the site',
  SITE_ACCESS_REPLY: 'a reply from the site',
}

export function handoverOf(orderId: string, data: Dataset = load()): HandoverEnd[] {
  const { sites, endpoints } = loadHandover()
  const { addresses } = loadRoute()
  const addr = new Map(addresses.map((a) => [a.id, a]))
  const order = data.orders.find((o) => o.id === orderId)
  if (!order) return []

  const pickedUp = order.status === 'IN_TRANSIT' || order.status === 'DELIVERED'
  const delivered = order.status === 'DELIVERED'
  const cancelled = Boolean(order.cancelled_at)

  const fix = data.tracking
    .filter((t) => t.order_id === orderId && t.estimated_delivery_at)
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0]
  const window = (purpose: string) =>
    data.timeWindows.find((w) => w.order_id === orderId && w.is_selected && w.purpose === purpose)

  return (['PICKUP', 'DELIVERY'] as const).map((boundary) => {
    const ep = endpoints.find((e) => e.order_id === orderId && e.boundary === boundary)
    const site = ep?.site_id ? sites.get(ep.site_id) : undefined
    const a = addr.get(ep?.address_id ?? (boundary === 'PICKUP' ? order.pickup_address_id : order.delivery_address_id))
    const tz = site?.timezone ?? a?.timezone ?? 'Europe/Helsinki'
    const done = boundary === 'PICKUP' ? pickedUp : delivered
    const next = !cancelled && !done && (boundary === 'PICKUP' || pickedUp)

    // When the driver is planned to be there, and until when.
    let from: string | null = null
    let until: string | null = null
    let source: HandoverEnd['arriveSource'] = null
    if (boundary === 'PICKUP') {
      const w = window('SELECTED_PICKUP_SLOT')
      if (w) [from, until, source] = [w.start_at, w.end_at, 'pickup slot']
    } else if (order.status === 'IN_TRANSIT' && fix?.estimated_delivery_at) {
      ;[from, source] = [fix.estimated_delivery_at, 'driver ETA']
    } else {
      const w = window('CUSTOMER_DELIVERY_PROMISE')
      if (w) [from, until, source] = [w.start_at, w.end_at, 'promise window']
    }

    const checks: Check[] = []
    const hoursToArrive = from ? (Date.parse(from) - SNAPSHOT_AT.getTime()) / 3_600_000 : null
    // A planned time that has gone by without the handover is the loudest thing here.
    const lastChance = until ?? from
    if (next && lastChance && Date.parse(lastChance) < SNAPSHOT_AT.getTime()) {
      checks.push({
        level: 'block',
        text: `The ${source} has passed and the ${boundary === 'PICKUP' ? 'pickup' : 'delivery'} is not recorded.`,
      })
    }
    const at = from ? clock(Date.parse(from), tz) : null
    const end = until ? clock(Date.parse(until) - 60_000, tz) : null

    if (site && at) {
      const h = hoursOn(site, at.weekday)
      if (h === null) {
        checks.push({ level: 'unknown', text: 'Opening hours are not recorded for this site.' })
      } else if (h === 'closed') {
        checks.push({ level: 'block', text: `The site is closed on ${DAY_NAME[at.weekday] ?? at.weekday}.` })
      } else {
        const [open, close, label] = h
        if (at.minute < open || at.minute >= close) {
          checks.push({
            level: 'block',
            text: `Planned for ${at.time}, but the site is open ${label} that day.`,
          })
        } else if (end && end.weekday === at.weekday && end.minute >= close) {
          checks.push({
            level: 'risk',
            text: `The ${source} runs past closing time (${label}).`,
          })
        } else if (!until && close - at.minute <= 30) {
          checks.push({
            level: 'risk',
            text: `Arrives ${at.time}, ${close - at.minute} min before the site closes.`,
          })
        } else {
          checks.push({ level: 'ok', text: `Open at the planned time (${label}).` })
        }
      }
      if (site.advance_notice_minutes) {
        checks.push({ level: 'ok', text: `Call ${site.advance_notice_minutes} min ahead.` })
      }
    } else if (!site && at) {
      checks.push({ level: 'unknown', text: 'A private or one-off address, with no opening hours to check against.' })
    } else if (!at) {
      checks.push({ level: 'unknown', text: 'No planned time is recorded for this handover.' })
    }

    if (ep) {
      if (ep.access_status === 'NEEDS_VERIFICATION') {
        checks.push({
          level: 'risk',
          text: `Access not verified${ep.access_instruction ? `: ${ep.access_instruction}` : '.'}`,
        })
      } else {
        checks.push({
          level: 'ok',
          text: `Access confirmed${ep.last_confirmed_source ? ` by ${SOURCE[ep.last_confirmed_source] ?? codeName(ep.last_confirmed_source).toLowerCase()}` : ''}.`,
        })
      }
      const who = ep.contact_name
        ? [ep.contact_name, ep.contact_role].filter(Boolean).join(', ')
        : `The ${ep.contact_role ?? 'contact'}`
      if (ep.contact_status === 'UNCONFIRMED') {
        // At a managed site with confirmed access the desk will be there anyway;
        // the contact only carries the handover at a private address or when
        // access is unverified too.
        const carries = !site || ep.access_status === 'NEEDS_VERIFICATION'
        checks.push({ level: carries ? 'risk' : 'unknown', text: `${who} has not confirmed.` })
      } else {
        checks.push({ level: 'ok', text: `${who} confirmed.` })
      }
    }

    return {
      boundary,
      done,
      next,
      place: site?.name ?? (a?.name && a.name !== 'Private handoff' ? a.name : 'Private address'),
      city: a ? `${a.city}, ${a.country}` : '',
      arrive: from,
      arriveSource: source,
      local: at?.label ?? null,
      hoursToArrive,
      checks,
      level: done || cancelled ? 'ok' : worst(checks),
      // Flag it now only if it is close: an unconfirmed contact a week out is not today's work.
      flagged: next && hoursToArrive !== null && hoursToArrive <= SOON_H && RANK[worst(checks)] <= RANK.risk,
    }
  })
}
