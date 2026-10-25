// Which icon stands for which thing. One table, so a custody case shows a key
// on the ops map, in the queue and on the case page alike.
import type { IconName } from './icons'

/** Keyed by the case badge, which is what the operator reads beside it. */
const BADGE: Record<string, IconName> = {
  'Reconciliation Required': 'compare',
  'Action Required': 'warning',
  'Concurrent Duties': 'backup',
  'Fragmented Case': 'attachment',
  'Unlinked Message': 'message',
  'Multiple Threads': 'message',
  'No Authority on Record': 'receiver',
  'Date Unconfirmed': 'calendar',
  'Evidence Rejected': 'camera',
  'Signal Stale': 'locate',
  'Custody Open': 'key',
  'Incident Open': 'incident',
  Unassigned: 'person',
  'Awaiting Review': 'view',
  'Execution Pending': 'waiting',
  'Check Open': 'open-check',
}

export const badgeIcon = (badge: string): IconName => BADGE[badge] ?? 'warning'

/** Support thread categories, as lib/support prettifies them. */
const CATEGORY: Record<string, IconName> = {
  'driver availability': 'calendar',
  'ferry and route': 'ferry',
  'driver travel': 'train',
  'vehicle custody': 'key',
  'documents and proof': 'id-card',
  'travel and assignment': 'route',
  'costs and payments': 'receipt',
  'expense payout': 'euro',
  'pickup and release': 'car',
  'offer and pricing': 'euro',
  'general policy': 'book',
}

export const categoryIcon = (category: string): IconName =>
  CATEGORY[category.toLowerCase()] ?? 'message'

/** Answer-book topics. */
const TOPIC: Record<string, IconName> = {
  Availability: 'calendar',
  'Closing the gig': 'confirmed',
  'Delivery & handover': 'handover',
  'Expenses & receipts': 'receipt',
  'Getting gigs': 'search',
  Insurance: 'shield',
  'On the road': 'route',
  Onboarding: 'person',
  'Pay & invoicing': 'euro',
  'Penalties & damage': 'damage',
  Pickup: 'car',
  'Plates & documents': 'id-card',
  Support: 'support',
}

export const topicIcon = (topic: string): IconName => TOPIC[topic] ?? 'book'

/** How the bot may handle a driver question. */
export const ROUTING_ICON: Record<string, IconName> = {
  ANSWER: 'agent',
  LOOKUP: 'search',
  ASK: 'message',
  ESCALATE: 'person',
}

/** Who closed a handled action. */
export const DECIDED_ICON: Record<string, IconName> = {
  autonomous: 'agent',
  approved: 'confirmed',
  stopped: 'blocked',
}
