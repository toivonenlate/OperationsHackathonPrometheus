// Driver support: every question a driver has asked, and what it is waiting on.
//
// The unit here is the thread, not the order — a driver can have four of them
// across two systems, which is exactly the case an order-shaped view loses.
// State is derived from who spoke last, because that is what decides whether
// the ball is ours.
import {
  type Dataset,
  SNAPSHOT_AT,
  load,
  loadCaseRecords,
} from './data'
import { type Entry } from './knowledge'
import { matchEntry } from './propose'

export type SupportState = 'NEEDS_ANSWER' | 'WAITING_ON_DRIVER' | 'RESOLVED'

export type SupportThread = {
  id: string
  /** 'conversation' threads hang off an order; 'inbox' ones may not. */
  source: 'conversation' | 'inbox'
  driverId: string
  driverName: string
  homeCity: string | null
  homeCountry: string | null
  category: string
  channel: string
  language: string | null
  orderRef: string | null
  orderId: string | null
  state: SupportState
  lastFrom: 'driver' | 'bahn'
  lastAt: string
  lastBody: string
  messageCount: number
  driverMessages: number
  /** Hours since the last message, from the snapshot. */
  idleHours: number
  /** What the records are waiting on, where the thread says so. */
  waitingOn: string | null
  /** The answer book entry that covers the driver's last question. */
  answer: Pick<Entry, 'id' | 'topic' | 'routing' | 'answer'> | null
  caseKey: string
}

const pretty = (s: string) => s.toLowerCase().replace(/_/g, ' ')

export function buildSupport(data: Dataset = load()): SupportThread[] {
  const { inboxMessages } = loadCaseRecords()
  const driver = new Map(data.drivers.map((d) => [d.id, d]))
  const orderRef = new Map(data.orders.map((o) => [o.id, o.reference]))
  const now = SNAPSHOT_AT.getTime()
  const out: SupportThread[] = []

  const finish = (
    base: Omit<
      SupportThread,
      | 'state'
      | 'lastFrom'
      | 'idleHours'
      | 'answer'
      | 'caseKey'
      | 'lastAt'
      | 'lastBody'
    > & { closed: boolean },
    msgs: { authored_at: string; author_type: string; body: string; visibility: string }[],
  ) => {
    const external = msgs.filter((m) => m.visibility !== 'INTERNAL')
    const last = external[external.length - 1]
    if (!last) return
    const lastFrom = last.author_type === 'driver' ? 'driver' : 'bahn'
    const state: SupportState = base.closed
      ? 'RESOLVED'
      : lastFrom === 'driver'
        ? 'NEEDS_ANSWER'
        : 'WAITING_ON_DRIVER'

    // Answer the driver's own last question, not ours.
    const lastDriver = [...external].reverse().find((m) => m.author_type === 'driver')
    const d = driver.get(base.driverId)
    const entry = lastDriver
      ? matchEntry(lastDriver.body, d?.home_country ?? null)
      : null

    const { closed, ...rest } = base
    out.push({
      ...rest,
      state,
      lastFrom,
      lastAt: last.authored_at,
      lastBody: last.body,
      idleHours: (now - new Date(last.authored_at).getTime()) / 3_600_000,
      answer: entry
        ? {
            id: entry.id,
            topic: entry.topic,
            routing: entry.routing,
            answer: entry.answer,
          }
        : null,
      caseKey: `driver:${base.driverId}`,
    })
  }

  for (const c of data.conversations) {
    if (c.counterparty_type !== 'driver' || !c.counterparty_id) continue
    const d = driver.get(c.counterparty_id)
    const msgs = data.messages
      .filter((m) => m.conversation_id === c.id)
      .sort((a, b) => a.authored_at.localeCompare(b.authored_at))
    finish(
      {
        id: c.id,
        source: 'conversation',
        driverId: c.counterparty_id,
        driverName: d?.display_name ?? c.counterparty_id,
        homeCity: d?.home_city ?? null,
        homeCountry: d?.home_country ?? null,
        category: pretty(c.category ?? 'unlabelled'),
        channel: c.channel,
        language: msgs[msgs.length - 1]?.language ?? null,
        orderRef: c.order_id ? orderRef.get(c.order_id) ?? null : null,
        orderId: c.order_id,
        messageCount: msgs.length,
        driverMessages: msgs.filter((m) => m.author_type === 'driver').length,
        waitingOn: null,
        closed: c.status !== 'OPEN',
      },
      msgs,
    )
  }

  for (const t of data.inbox) {
    if (t.counterparty_type !== 'driver' || !t.counterparty_id) continue
    const d = driver.get(t.counterparty_id)
    const msgs = inboxMessages
      .filter((m) => m.thread_id === t.id)
      .sort((a, b) => a.authored_at.localeCompare(b.authored_at))
    const linked = t.linked_order_ids[0] ?? null
    finish(
      {
        id: t.id,
        source: 'inbox',
        driverId: t.counterparty_id,
        driverName: d?.display_name ?? t.counterparty_id,
        homeCity: d?.home_city ?? null,
        homeCountry: d?.home_country ?? null,
        category: pretty(t.category),
        channel: t.channel,
        language: msgs[msgs.length - 1]?.language ?? null,
        orderRef: linked ? orderRef.get(linked) ?? null : null,
        orderId: linked,
        messageCount: msgs.length,
        driverMessages: msgs.filter((m) => m.author_type === 'driver').length,
        waitingOn: t.waiting_on,
        closed: t.status !== 'OPEN',
      },
      msgs,
    )
  }

  // Oldest unanswered first: the ball is ours and it has been ours longest.
  const rank: Record<SupportState, number> = {
    NEEDS_ANSWER: 0,
    WAITING_ON_DRIVER: 1,
    RESOLVED: 2,
  }
  return out.sort(
    (a, b) => rank[a.state] - rank[b.state] || b.idleHours - a.idleHours,
  )
}

export function supportCounts(threads: SupportThread[]) {
  return {
    all: threads.length,
    needsAnswer: threads.filter((t) => t.state === 'NEEDS_ANSWER').length,
    waiting: threads.filter((t) => t.state === 'WAITING_ON_DRIVER').length,
    resolved: threads.filter((t) => t.state === 'RESOLVED').length,
    // Answering, looking up and asking all need no approval, so all three are
    // things BahnBot can do on its own. Only ESCALATE needs a human.
    botCanAct: threads.filter(
      (t) =>
        t.state === 'NEEDS_ANSWER' &&
        t.answer !== null &&
        t.answer.routing !== 'ESCALATE',
    ).length,
    needsHuman: threads.filter(
      (t) =>
        t.state === 'NEEDS_ANSWER' &&
        (t.answer === null || t.answer.routing === 'ESCALATE'),
    ).length,
  }
}
