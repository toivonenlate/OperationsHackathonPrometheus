// What the agents did, so nobody has to wonder.
//
// Three tiers, and the order matters. Work that needed nobody comes first,
// because that is the reassuring part. Then work a person approved — noting
// where they *edited* it first, because that is the gate doing its job. Then
// work a person stopped.
import { type Dataset, load, loadLog } from './data'

export type Tier = 'autonomous' | 'approved' | 'stopped'

export type HandledItem = {
  id: string
  tier: Tier
  agent: string
  /** What happened, in words an operator would use. */
  action: string
  command: string
  orderRef: string | null
  at: string
  /** The reviewer's own words, when a person was in the loop. */
  note: string | null
  decision: 'APPROVED' | 'EDITED' | 'REJECTED' | null
  reviewer: string | null
  amount: string | null
}

export type Handled = {
  items: HandledItem[]
  summary: {
    total: number
    autonomous: number
    approved: number
    edited: number
    stopped: number
    needingAPerson: number
    feeTotal: string
    since: string
  }
}

const COMMAND_WORDS: Record<string, string> = {
  'offer.published': 'Priced and published an open offer',
  'travel.rebook': 'Rebooked a ferry crossing',
  'travel.booked': 'Booked driver travel',
  'travel.rebooked': 'Rebooked a ferry crossing',
  'alert.resolve': 'Closed a tracking-gap alert',
  'alert.resolved': 'Closed a tracking-gap alert',
  'travel.book_driver_positioning': 'Booked a train to position a driver',
  'travel.book_ferry': 'Book a ferry crossing',
  'driver.request_safe_stop_details': 'Asked a stopped driver for a safe location',
  'condition.record_attribution': 'Attribute vehicle damage to the driver',
  'message.sent': 'Sent a message to a driver',
}

function words(command: string): string {
  return (
    COMMAND_WORDS[command] ??
    command.replace(/[._]/g, ' ').replace(/^./, (c) => c.toUpperCase())
  )
}

const euro = (cents: number) =>
  `€${Math.round(cents / 100).toLocaleString('en-GB')}`

export function buildHandled(data: Dataset = load()): Handled {
  const { agents, events } = loadLog()
  const agentTitle = new Map(agents.map((a) => [a.id, a.title]))
  const orderRef = new Map(data.orders.map((o) => [o.id, o.reference]))

  const items: HandledItem[] = []

  // Tier one: an agent acted and no person was involved.
  const autonomous = events.filter(
    (e) => e.actor_type === 'agent' && e.command === 'offer.published',
  )
  let feeCents = 0
  for (const e of autonomous) {
    const fee = Number(e.changes?.fee_cents ?? 0)
    if (Number.isFinite(fee)) feeCents += fee
    items.push({
      id: e.id,
      tier: 'autonomous',
      agent: agentTitle.get(e.actor_id) ?? e.actor_id,
      action: words(e.command ?? ''),
      command: e.command ?? '',
      orderRef: e.order_id ? orderRef.get(e.order_id) ?? null : null,
      at: e.recorded_at,
      note: null,
      decision: null,
      reviewer: null,
      amount: fee ? `${euro(fee)} fee` : null,
    })
  }

  // Tier two and three: proposals a person ruled on.
  for (const p of data.proposals) {
    const ran = p.execution?.status === 'SUCCEEDED'
    const rejected = p.review?.decision === 'REJECTED'
    if (!ran && !rejected) continue
    items.push({
      id: p.id,
      tier: ran ? 'approved' : 'stopped',
      agent: agentTitle.get(p.proposed_by_agent_id) ?? p.proposed_by_agent_id,
      action: words(p.command),
      command: p.command,
      orderRef: orderRef.get(p.order_id) ?? null,
      at: p.execution?.attempted_at ?? p.review?.reviewed_at ?? p.created_at,
      note: p.review?.decision_note ?? null,
      decision: (p.review?.decision as HandledItem['decision']) ?? null,
      reviewer: p.review?.reviewer_id ?? null,
      amount: null,
    })
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const approved = items.filter((i) => i.tier === 'approved')
  const stopped = items.filter((i) => i.tier === 'stopped')
  const since = autonomous.length
    ? items.reduce((a, b) => (new Date(a.at) < new Date(b.at) ? a : b)).at
    : new Date().toISOString()

  return {
    items,
    summary: {
      total: items.length,
      autonomous: autonomous.length,
      approved: approved.length,
      edited: approved.filter((i) => i.decision === 'EDITED').length,
      stopped: stopped.length,
      needingAPerson: approved.length + stopped.length,
      feeTotal: euro(feeCents),
      since,
    },
  }
}
