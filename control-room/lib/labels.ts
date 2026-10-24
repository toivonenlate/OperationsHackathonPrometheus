// Plain words for the identifiers the records use.
//
// Operators should never meet travel.book_ferry or RECEIVER_AUTHORITY_CHECK.
// The raw value still exists one fold down in the record itself, which is where
// an engineer or an auditor would look for it.

const TABLE: Record<string, string> = {
  work_assignments: 'the assignment',
  time_windows: 'the schedule',
  expenses: 'the expense claim',
  proofs: 'the photo requirement',
  custody_assets: 'the key record',
  custody_asset_events: 'the key history',
  custody_reports: "the driver's report",
  agent_proposals: "BahnBot's proposal",
  alerts: 'the alert',
  incidents: 'the incident',
  work_items: 'the open check',
  conversations: 'the conversation',
  messages: 'the message',
  support_inbox_threads: 'the support thread',
  support_inbox_messages: 'the support message',
  orders: 'the order',
  tracking_observations: 'the position feed',
  addresses: 'the address',
  transport_segments: 'the route',
}

/** "expenses" → "the expense claim" */
export function tableName(table: string): string {
  return TABLE[table] ?? table.replace(/_/g, ' ')
}

const COMMAND: Record<string, string> = {
  'travel.book_ferry': 'booking the ferry',
  'travel.rebook': 'rebooking the crossing',
  'travel.refresh_quote': 'refreshing the quote',
  'travel.refresh_crossing': 'rechecking the crossing',
  'travel.verify_booking_outcome': 'verifying the booking',
  'travel.book_driver_positioning': 'booking driver travel',
  'alert.resolve': 'closing the alert',
  'assignment.prepare_backup': 'preparing a backup driver',
  'assignment.review_positioning': 'reviewing positioning',
  'pickup.verify_identity': 'verifying the car',
  'condition.compare_evidence': 'comparing condition photos',
  'condition.record_attribution': 'attributing the damage',
  'billing.check_reference': 'checking the invoice',
  'driver.request_safe_stop_details': 'asking the driver for a safe location',
}

/** "travel.book_ferry" → "booking the ferry" */
export function commandName(command: string): string {
  if (COMMAND[command]) return COMMAND[command]
  return command
    .replace(/^[a-z]+\./, '')
    .replace(/[._]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

/** "RECEIVER_AUTHORITY_CHECK" → "Receiver authority check" */
export function codeName(code: string): string {
  return code
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

const DESK: Record<string, string> = {
  'ops-support': 'Support desk',
  'ops-readiness': 'Readiness desk',
  'ops-planning': 'Transport planning',
  'ops-dispatch': 'Driver marketplace',
  'ops-import': 'Import operations',
  'ops-travel': 'Driver travel',
  'ops-shift': 'Shift lead',
  'ops-intake': 'Order intake',
  'ops-evidence': 'Handover evidence',
  'ops-finance': 'Payment review',
  'ops-expenses': 'Expense review',
}

/** "ops-travel" → "Driver travel" */
export function deskName(desk: string): string {
  return DESK[desk] ?? desk
}
