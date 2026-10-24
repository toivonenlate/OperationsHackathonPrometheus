# Driver support: everything the packet says about the problem

Collected from `PARTICIPANT-BRIEF.md`, `OPERATIONS-CONTEXT.md`, `README.md`,
`dataset/README.md`, `dataset/SCHEMA.md` and `attachments/README.md`. Quotes are
verbatim; the source is named so claims can be checked.

---

## 1. The mandate

The brief offers four agent domains. Ours, verbatim:

> **Driver support.** Drivers write in with questions all day. An agent that
> handles the routine ones and hands the hard ones to a person with the context
> already gathered.

Three of the other four overlap it heavily and are fair game inside the same agent:

- **Pickup readiness, by phone** — call the seller or pickup place, confirm the car
  and papers, "deals with phone menus, and tries again later if nobody answers".
- **Driver travel** — "Plan how the driver gets there and how the car gets home:
  trains, buses, a taxi for the last stretch, the ferry, flights and hotels.
  Compare prices and times, then book them... but stop before any real purchase."
- **On the road** — "Breakdowns, missed ships and delays. Gather the facts, ask the
  driver, and propose the next step to a person."

The required shape of the agent: "It should do the cheap work first, reading,
asking and looking things up, and then either finish the job or bring a person a
clear decision."

## 2. The rules that bind it

From **The rules of the game**:

- "The agent never contacts a customer on its own. A customer is anyone who pays
  us. **Drivers and pickup places are fine to contact.**"
- "Start with approvals. Build it so a person says yes before the agent changes
  anything: a booking, a date, a cost, or a message to a customer. **Asking
  questions and looking things up need no yes.** Build it so you could give the
  agent more freedom later as it earns trust."
- "The agent has to be real: a language model doing the work in a loop.
  Everything around it can be fake... A simulated driver who answers in the demo
  is fine."
- "The control room is for people in operations, not engineers. It must not look
  like a developer tool."

**Why this makes driver support the strongest pick:** it is the only domain where
the agent can legally complete a loop unaided, because asking a driver a question
needs no approval.

## 3. The scenarios the brief names

A "normal week" (brief, *What our operations team does*):

- "A driver flies to Germany, misses the train, and cannot make the pickup slot."
- "The seller said the car was ready. The driver arrives and it is not."
- "The seller wants a paper nobody mentioned before the car can leave."
- "The ferry is sold out, so the driver needs a later ship and maybe a hotel."
- "An order says Tampere in the delivery address and Helsinki in the notes."

And the reason these are hard:

> "None of these is hard on its own. The hard part is that each one starts a
> chain. A missed ship becomes a new booking, a hotel question, an email to the
> ferry line and a decision about the cost, and **someone has to hold the whole
> chain in their head.**"

### The worked example (the brief's own target behaviour)

> "A red warning light comes on, and a driver stops at a motorway service area
> and writes to us in the app. Before anyone at Bahn sees it, the agent asks the
> driver if they are safe, where exactly they are, and for a photo of the warning
> light. It looks up the car: a Bentley owned by the dealer, due in Hamburg
> tomorrow. Then it brings a person one decision: the car is stopped and the
> driver is safe, so call the dealer and ask whether they send their own roadside
> assistance or want the car towed, and expect tomorrow's delivery to be late.
> The person makes the call, or tells the agent what to do instead."

Note the ordering: **safety question first, then location, then evidence, then
context lookup, then exactly one decision.** This is in the data as `CD-420322`.

## 4. What drivers actually ask about

`OPERATIONS-CONTEXT.md`: "Drivers ask about **keys, travel, costs and changed
plans**." And on where those conversations live: "Support conversations have
historically sat apart from the order tool; operations alerts often appear in
Slack."

Conversation categories in the data, driver-side: `driver_travel`,
`vehicle_custody`, `driver_availability`, `ferry_and_route`,
`documents_and_proof`, `costs_and_payments`, `pickup_and_release`,
`offer_and_pricing`.

The two decisions from `OPERATIONS-CONTEXT.md` aimed straight at this agent:

- **Dispatch:** "Does the assigned driver have a credible way to reach pickup
  after another duty?"
- **Live monitoring:** "Is a car likely to miss a promise, or is the signal stale?
  **What should the agent ask before raising the issue to a person?**"

And the named agent failure modes: an agent "can also make an exception harder to
understand if a quote is treated as a booking, **a driver message as a fresh
location**, or an old instruction as the current plan."

## 5. The evidence traps, by topic

This is the real content. Every line below is the packet telling you a specific
way a driver-support agent will be wrong. Source: `dataset/SCHEMA.md` unless noted.

### Offers, fees and "am I booked?"

- "a driver's message about taking work does not create a booking"
- "A published directed offer is not an assignment."
- `SHOWN` "means an exposure was created, **not that a notification reached the
  driver**". `NOTIFIED` records delivery, `VIEWED` an app view.
- A directed offer has a "live five-minute decision window", one recipient at a time.
- "An ordinary offer can pass its booking cutoff while its stored status is still
  `PUBLISHED`; it must be withdrawn before a replacement is posted."
- `VIEW` = opened the gig detail. `PASS` = explicitly passed. "These records do not
  include reasons." "repricing alone does not prove why an offer lacked a booking."
- "The absence of a signal is not evidence of no exposure or no interest."
- Fees are "fictional planning values, not observed market prices". No personalised
  driver pricing, no complete eligibility checks. An agent "should not claim it has
  measured marketplace demand or a complete pricing policy."

### Cancelled work and money owed

- A cancelled assignment records `PAYOUT_DUE` or `NO_PAYOUT`. "**`PAYOUT_DUE` does
  not mean money has been paid**, and an approved expense does not reinstate the
  cancelled assignment's fee."

### Positioning — "can this driver even get there?"

- "A planned release city and tracking ETA are **not a current driver location**."
- Quotes (`matching_quote_ids`) are separate from purchases (`positioning_reservation_ids`).
- `earliest_positioning_departure_at` is "an estimate from the previous duty's ETA
  and handover buffer".
- Where a driver reports later availability, "the reported time is still **an
  attributed claim, not a verified location**."
- `driver_history`: "A prior delivery city is a past observation; `current_location`
  remains unknown. A cancelled duty supplies no release location."
- "For other assignments, position may be unknown."
- `dataset/README.md`: "**a home city is not treated as a current location**."

### Travel, ferries and hotels

- `travel_options` are "capacity checks or quotes observed at `checked_at`";
  `travel_reservations` are bookings. "**a booking does not prove check-in or
  boarding**."
- `carrier_amendments` change "the named reservation only. It does not establish
  space or a booking on a proposed replacement sailing."
- "Booked lodging is also a travel reservation; it **does not prove a driver stayed
  there** or create a driver expense claim."
- `travel_confirmations` "are attributed driver reports. Read their sources before
  treating them as independent confirmation."
- `kind=FLIGHT` "names its main mode, not a nonstop service between those cities."
- Only a gate observation (`ferry_terminal_events`) can confirm or reject check-in.

### Assignment steps and pre-handover checks

- "A `PLANNED` step can cite a purchased ticket **without proving travel occurred**."
- `CALL_AHEAD`, `PLATE_PAPERWORK_CHECK`, `DIGITAL_CMR_CHECK` steps: `UNVERIFIED`
  "means the step is due but its completion is not evidenced; the cited instruction
  is **not proof of a call, paperwork check or signature**."
- `custody_reports` are "attributed driver statements, **not continuous observation
  of a vehicle**" — and per `dataset/README.md` they "do not verify exact parking
  location or continuous custody".

### Keys and custody — the sharpest driver question in the packet

- `custody_assets` tracks keys, plate papers and an original paper CMR, with a
  "current holder claim and source references".
- "A key count or asset identifier is null unless a source establishes it."
- `REPORTED_UNVERIFIED` and `DOCUMENT_RECORD_ONLY` are "deliberately weaker than a
  verified physical handover". The one chain present uses the narrower
  `QUESTION_ONLY`, `INSTRUCTION_ONLY`, `FOLLOWUP_ONLY`.
- "A vehicle pickup or delivery event proves car movement at that boundary; **it
  does not by itself count keys**, identify who accepted plate papers or sign a
  paper CMR."
- The only chain in the packet: "a key set for the second car of a two-car driver
  plan on **CD-420384**. It has no handover evidence and an owned follow-up."

### Photos and proof — "why was my upload rejected?"

- `REQUIRED` / `SUBMITTED` / `REJECTED` / `APPROVED` / `WAIVED`.
- "Physical handover does not automatically satisfy every proof requirement."
- "A point-level requirement alone does not identify its photographer or resolve a
  custody dispute."
- "**A direct site statement about vehicle identity does not turn rejected condition
  photos into approved pickup evidence.**"
- An open unsubmitted key proof can migrate from a cancelled assignment to a
  replacement step; "submitted evidence is never moved this way."
- `attachments/README.md`: `file_count` can exceed supplied bytes; "do not infer
  that a missing sample photo means the underlying proof has no file, or that a
  submitted file proves a signature, a cause of damage, or a site-confirmed fact."

### Expenses — "when do I get paid?"

- `expenses` "distinguishes a submitted cost from payment; payroll and invoices are
  outside this packet."
- `service_at` = incurred, `submitted_at` = entered review, `reviewed_at` = decided.
- "**`APPROVED` means the claim was accepted, not that money moved.**"
- `SUPERSEDED` "retains an older submission linked to its correction".
- `receipt_state`: `ATTACHED_SAMPLED` has inspectable bytes, `ATTACHED_NOT_SAMPLED`
  claims a receipt with no bytes supplied, `MISSING` records none.
- Flight costs with `payer=BAHN` and `submission_source=CENTRAL_RECEIPT_MATCHER`
  "have no driver claimant and are **not reimbursement requests**".
- "some fictional costs are in DKK. **No exchange-rate or payout ledger is
  included**, so do not treat the DKK number as euros or infer a settled
  reimbursement."
- `attachments/README.md`: CD-420326 has "one corrected-claim pair... that shares
  identical receipt bytes". "A receipt documents a fictional cost, not an approval
  or payout."

### Messages and threads

- `PUBLIC` "means visible to the named recipient, **not to everyone in the case**."
  Internal notes are operator-only.
- "Messages may conflict with each other or with stored data; preserve their
  speaker and time when using them as evidence."
- Category "is a broad issue topic, **not an outcome label**."
- "**An agent-authored message is not a customer or driver reply.**"
- "`language` identifies the authored language; the packet supplies **no
  authoritative translations**." (de, fi, fr all appear.)
- `waiting_on`, `owner`, `next_check_at` "describe the current handoff, not a
  promise that the outside party has replied or that the missing fact is verified."
- "A missing owner is unknown here, not proof that nobody at the company owns the
  conversation."
- A `case_workspace` "can link separate driver, customer and site exchanges" without
  implying all participants saw the same message.

### The support inbox — messages with no home

- Threads "deliberately have no `order_id`."
- "`candidate_order_ids` are possible matches suggested by the available evidence,
  **not links or permission to change those orders**." Only `linked_order_ids` are
  confirmed.
- `link_state` distinguishes "a pending match, an account-identity conflict, one
  confirmed order, a confirmed multi-order inquiry, and a general question that
  needs no order."
- "**A quoted order reference can be wrong or belong to another account; do not
  disclose that account's details while asking for correction.**"
- "A closed general-policy thread does not imply a reimbursement decision for any job."
- "Link resolution does not close the support request: a confirmed thread can remain
  open while an arrival update or document is still owed."

### Tracking and alerts

- `observed_at` and `received_at` are separate. "Uploads may arrive late or stop."
- No map coordinates in this packet.
- "**A signal near a terminal is not a gate scan.**"
- `ACKNOWLEDGED` "records that a person took notice, **not that the risk is gone**."
  `RESOLVED` is "a supported conclusion about that alert episode". `DISMISSED` means
  the source "was invalid or stale".
- A linked `followup_message_id` "did not trigger the earlier signal and is not
  proof that the car moved."

### Work items and proposals

- "an open work item does not by itself mean the car is in trouble." Its `summary`
  and `next_action` are "internal interpretations, not independent proof that a
  customer or driver did anything."
- "`due_at` is a queue reminder, not a customer promise."
- "An assigned owner is not proof that a person has read one."
- "**Proposal text alone is never proof that an order, booking or customer promise
  changed.**" An approved proposal may await execution; "an attempted external
  action may need reconciliation."
- Internal room posts: "Suppressed or failed deliveries do not prove anyone saw the
  notification." "An acknowledged alert can still require action."

## 6. Structural problems (not evidence problems)

- **Driver support lives in two systems.** Order `conversations` and
  `support_inbox_threads` are separate stores, so one driver's threads cannot appear
  on one page. `OPERATIONS-CONTEXT.md` confirms this is the real situation:
  "Support conversations have historically sat apart from the order tool."
- **One driver, several cars.** `dataset/README.md`: some jobs "include the prior
  duty and the evidence available for positioning that driver". Three orders
  (CD-420055, CD-420177, CD-420455) have two drivers because the trade-in return is
  booked separately. CD-420702 relays through a transfer yard with a separate
  assignment per leg, and its second-leg booking is cancelled at the snapshot.
- **Absence is not a signal.** "Missing contact fields are common in this snapshot.
  Their absence alone is not an incident or a reason to contact every driver."

## 7. What the packet will not let you claim

Constraints an honest agent has to live inside:

| You cannot | Because |
| --- | --- |
| Translate authoritatively | "the packet supplies no authoritative translations" |
| Say money moved | no payroll, invoices or payout ledger |
| Convert DKK to EUR | "No exchange-rate... ledger is included" |
| Show a driver on a map | "no map coordinates for those records" |
| Explain why an offer failed | demand signals "do not include reasons" |
| Prove a driver's location | every positioning field is an estimate or a claim |
| Prove boarding | only a gate observation can |
| Prove custody | the one key chain has "no handover evidence" |

## 8. What this implies for the agent

The pattern across every trap above is one thing: **the records distinguish a
claim from a record from an authorisation, and a helpful agent collapses them.**
Driver support is where that collapse is most tempting, because the driver is
asking a direct question and wants a direct answer:

- *"Am I booked?"* — a message about taking work is not a booking.
- *"Will I be paid?"* — approved is not paid.
- *"Can the hotel hold the key?"* — nobody has recorded release authority.
- *"Am I cancelled?"* — the driver has not cancelled.
- *"Did I make the ferry?"* — a booking is not a boarding scan.
- *"Which job do I follow?"* — three live duties, no job reference supplied.

So the agent's job is not to answer. It is to separate what is **recorded**, what
is **claimed**, and what is **authorised**, assert only the first, ask the cheap
question that would settle the second, and escalate the third.
