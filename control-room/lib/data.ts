// Reads the challenge snapshot straight from the JSONL files. No database.
// Everything is read-only; the snapshot never changes while the app runs.
import fs from 'node:fs'
import path from 'node:path'

export const SNAPSHOT_AT = new Date('2026-10-21T09:00:00Z')

const DIR =
  process.env.DATASET_DIR ?? path.join(process.cwd(), '..', 'dataset', 'data')

export type Order = {
  id: string; reference: string; status: string; readiness_status: string
  route_kind: string; customer_id: string; display_lane: string
  active_plan_id: string | null; cancelled_at: string | null
  pickup_address_id: string; delivery_address_id: string
  pickup_site_id: string | null; delivery_site_id: string | null
  created_at: string; updated_at: string
}
export type Driver = {
  id: string; display_name: string; home_city: string | null
  home_country: string | null; active: boolean
}
export type Vehicle = {
  id: string; make: string; model: string; model_year: number
  registration: string | null; fuel: string
}
export type OrderItem = { id: string; order_id: string; vehicle_id: string; role: string }
export type Assignment = {
  id: string; order_id: string; driver_id: string; status: string
  fee_cents: number | null; currency: string | null
  accepted_at: string | null; started_at: string | null
  completed_at: string | null; cancelled_at: string | null
}
export type Conversation = {
  id: string; order_id: string | null; category: string | null; channel: string
  counterparty_id: string | null; counterparty_type: string | null
  status: string; started_at: string; updated_at: string
}
export type Message = {
  id: string; conversation_id: string; order_id: string | null; body: string
  author_type: string; author_id: string; recipient_type: string | null
  authored_at: string; language: string | null; visibility: string; channel: string
}
export type InboxThread = {
  id: string; counterparty_id: string | null; counterparty_type: string | null
  category: string; channel: string; status: string; link_state: string
  linked_order_ids: string[]; candidate_order_ids: string[]
  candidate_basis: string | null; waiting_on: string | null
  owner: string | null; opened_at: string; updated_at: string
}
export type Alert = {
  id: string; order_id: string | null; signal: string; summary: string
  severity: string; status: string; owner?: string | null
  assignment_id: string | null; triggered_at: string
  evidence_refs?: string[]
}
export type Incident = {
  id: string; order_id: string; kind: string; status: string
  owner: string | null; opened_at: string; resolved_at: string | null
  recovery_decision?: string; reported_symptom?: string
  reported_stop_text?: string; location_verified?: boolean
  warning_photo_status?: string
}
export type WorkItem = {
  id: string; order_id: string; kind: string; summary: string
  status: string; owner: string | null; priority: string | null
  next_action: string | null; opened_at: string; due_at: string | null
}
export type Proposal = {
  id: string; order_id: string; command: string; summary: string
  rationale: string; status: string; proposed_by_agent_id: string
  proposed_payload: Record<string, unknown>
  evidence_refs: { table: string; id: string }[]
  review: { decision: string; decision_note: string; reviewer_id: string
            reviewed_at: string; final_payload: Record<string, unknown> } | null
  execution: { status: string; error: string | null; attempted_at: string
               effect_event_ids: string[] } | null
  created_at: string; target_type: string; target_id: string
}
export type TimeWindow = {
  id: string; order_id: string; purpose: string; source: string
  is_selected: boolean; start_at: string; end_at: string; timezone: string
}
export type Tracking = {
  id: string; order_id: string; assignment_id: string; source: string
  observed_at: string; received_at: string
  estimated_delivery_at: string | null; location_quality: string | null
  distance_remaining_km: number | null; progress_fraction: number | null
}
export type Proof = {
  id: string; order_id: string; kind: string; status: string
  required: boolean; submitted_at: string | null; reviewed_at: string | null
  file_count: number
}
export type CustodyAsset = { id: string; order_id: string; kind: string; vehicle_id?: string }
export type CustodyAssetEvent = { id: string; custody_asset_id: string; kind?: string; source?: string; occurred_at?: string }
export type Customer = { id: string; display_name?: string; name?: string; tier?: string }

function read<T>(name: string): T[] {
  const file = path.join(DIR, `${name}.jsonl`)
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T)
}

export type Dataset = ReturnType<typeof loadUncached>

function loadUncached() {
  return {
    orders: read<Order>('orders'),
    drivers: read<Driver>('drivers'),
    vehicles: read<Vehicle>('vehicles'),
    orderItems: read<OrderItem>('order_items'),
    assignments: read<Assignment>('work_assignments'),
    conversations: read<Conversation>('conversations'),
    messages: read<Message>('messages'),
    inbox: read<InboxThread>('support_inbox_threads'),
    alerts: read<Alert>('alerts'),
    incidents: read<Incident>('incidents'),
    workItems: read<WorkItem>('work_items'),
    proposals: read<Proposal>('agent_proposals'),
    timeWindows: read<TimeWindow>('time_windows'),
    tracking: read<Tracking>('tracking_observations'),
    proofs: read<Proof>('proofs'),
    custodyAssets: read<CustodyAsset>('custody_assets'),
    custodyAssetEvents: read<CustodyAssetEvent>('custody_asset_events'),
    customers: read<Customer>('customers'),
  }
}

let cache: Dataset | null = null
export function load(): Dataset {
  if (!cache) cache = loadUncached()
  return cache
}

// Small helpers the detectors and the view both want.

export function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]))
}

export function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = out.get(k)
    if (list) list.push(row)
    else out.set(k, [row])
  }
  return out
}

/** Cars on an order, primary item first. */
export function vehicleFor(data: Dataset, orderId: string): Vehicle | null {
  const item =
    data.orderItems.find((i) => i.order_id === orderId && i.role !== 'TRADE_IN') ??
    data.orderItems.find((i) => i.order_id === orderId)
  if (!item) return null
  return data.vehicles.find((v) => v.id === item.vehicle_id) ?? null
}

/** Assignments that still count: anything not cancelled. */
export function liveAssignments(data: Dataset): Assignment[] {
  return data.assignments.filter((a) => a.status !== 'CANCELLED')
}

export function hoursBefore(iso: string | null | undefined, from = SNAPSHOT_AT): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return (from.getTime() - t) / 3_600_000
}

export type Agent = { id: string; title: string; kind: string; scope: string }
export type OperationalEvent = {
  id: string
  order_id: string | null
  actor_id: string
  actor_type: string
  command: string | null
  target_type: string | null
  target_id: string | null
  from_state: string | null
  to_state: string | null
  source: string | null
  recorded_at: string
  changes: Record<string, unknown> | null
}

/** Loaded separately: the event log is the biggest file and only the Handled
 *  view needs it. */
let extra: { agents: Agent[]; events: OperationalEvent[] } | null = null
export function loadLog() {
  if (!extra) {
    extra = {
      agents: read<Agent>('agents'),
      events: read<OperationalEvent>('operational_events'),
    }
  }
  return extra
}

export type Expense = {
  id: string
  order_id: string
  assignment_id: string | null
  driver_id: string | null
  kind: string
  status: string
  amount_cents: number
  currency: string
  merchant?: string
  cost_country?: string
  payer: string
  reimbursable_to_driver: boolean
  receipt_count: number
  receipt_state?: string
  review_note: string | null
  submission_source: string
  service_at: string
  submitted_at: string
  reviewed_at: string | null
}

export type InboxMessage = {
  id: string
  thread_id: string
  author_id: string
  author_type: string
  recipient_id: string | null
  recipient_type: string | null
  body: string
  channel: string
  language: string | null
  visibility: string
  authored_at: string
}

export type CustodyReport = {
  id: string
  order_id?: string
  assignment_id?: string
  reported_at?: string
  summary?: string
  source?: string
}

/** Records only the case view needs. Kept out of the main load for the list. */
let caseExtra: {
  expenses: Expense[]
  inboxMessages: InboxMessage[]
  custodyReports: CustodyReport[]
} | null = null

export function loadCaseRecords() {
  if (!caseExtra) {
    caseExtra = {
      expenses: read<Expense>('expenses'),
      inboxMessages: read<InboxMessage>('support_inbox_messages'),
      custodyReports: read<CustodyReport>('custody_reports'),
    }
  }
  return caseExtra
}

export type Address = {
  id: string
  city: string
  country: string
  name: string | null
  kind: string
  address_line1: string | null
  timezone: string | null
  access_note: string | null
}
export type TransportPoint = {
  id: string
  plan_id: string
  address_id: string
  site_id: string | null
  role: string
  order_boundary: string | null
  sequence: number
}
export type TransportSegment = {
  id: string
  plan_id: string
  from_point_id: string
  to_point_id: string
  transport_mode: string
  distance_km: number | null
  status: string
  sequence: number
}
export type TravelOption = {
  id: string
  order_id?: string
  assignment_id: string | null
  from_city: string | null
  to_city?: string | null
  departure_at: string | null
  arrival_at: string | null
  check_in_cutoff_at: string | null
  capacity_note: string | null
  checked_at: string
  kind?: string
}
export type TravelReservation = {
  id: string
  order_id?: string
  assignment_id: string | null
  kind: string
  status?: string
  from_city?: string | null
  to_city?: string | null
  departure_at: string | null
  expected_arrival_at: string | null
  check_in_cutoff_at?: string | null
}

/** Route records, loaded only where a route is drawn. */
let routeData: {
  addresses: Address[]
  points: TransportPoint[]
  segments: TransportSegment[]
  options: TravelOption[]
  reservations: TravelReservation[]
} | null = null

export function loadRoute() {
  if (!routeData) {
    routeData = {
      addresses: read<Address>('addresses'),
      points: read<TransportPoint>('transport_points'),
      segments: read<TransportSegment>('transport_segments'),
      options: read<TravelOption>('travel_options'),
      reservations: read<TravelReservation>('travel_reservations'),
    }
  }
  return routeData
}

export type Site = {
  id: string
  name: string | null
  timezone: string | null
  opening_hours: { mon_fri?: string | null; sat?: string | null; sun?: string | null } | null
  advance_notice_minutes: number | null
}
export type Endpoint = {
  order_id: string
  boundary: 'PICKUP' | 'DELIVERY'
  site_id: string | null
  address_id: string
  access_status: string
  access_instruction: string | null
  contact_name: string | null
  contact_role: string | null
  contact_status: string
  last_confirmed_at: string | null
  last_confirmed_source: string | null
}

/** Sites and the per-order handover details, loaded only where a handover is checked. */
let handoverData: { sites: Map<string, Site>; endpoints: Endpoint[] } | null = null

export function loadHandover() {
  if (!handoverData) {
    handoverData = {
      sites: new Map(read<Site>('sites').map((s) => [s.id, s])),
      endpoints: read<Endpoint>('order_endpoint_details'),
    }
  }
  return handoverData
}
