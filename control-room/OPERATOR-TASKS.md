# Everything an operator might have to do

A full inventory of the work an Operations Associate at Bahn could face in a
shift, from the first coffee to the last handover note. It builds on
`OPERATOR.md` (who they are) and `DRIVER-SUPPORT-BRIEF.md` (the evidence
traps). The phases follow an order's life; the cross-cutting work (the agent,
follow-ups, shifts, the driver network, improving the tools) comes after.

Each task carries a tag for who should be able to do it, following Bahn's own
rule that asking and looking up need no approval, while bookings, dates, costs
and customer messages do:

- **[A]** the agent can do it alone: reading, asking a driver or pickup place, looking something up
- **[P]** the agent proposes, a person says yes, edits or refuses
- **[H]** a person only: judgement, authority, money, relationships

Desk tags (`ops-*`) are the dataset's eleven desks. They are routing labels,
not separate teams. One person wears most of them before lunch.

---

## 1. Start of shift

- Read the previous shift's handover: what is open, what is waiting, what was promised **[H]**
- Check whether anything needs me right now, or whether the queue really is calm **[A]**
- Look at cars moving overnight that should have reached a checkpoint by now **[A]**
- Check weekend intake: orders that arrived Saturday or Sunday with no one looking **[A]**
- Find alerts that were `ACKNOWLEDGED` but never resolved. Acknowledged is not gone **[A]**
- Find follow-ups whose `next_check_at` passed while nobody was on shift **[A]**
- Check today's pickup and delivery slots against site opening hours **[A]**
- Check for public holidays in FI, DE, DK and SE that close dealers, yards or registration offices **[A]**
- Check weather and road warnings on today's routes: snow, storms, closed passes **[A]**
- Check ferry disruption notices for Helsinki–Tallinn, Travemünde, Rostock, Puttgarden and the like **[A]**
- Check whether any rail strikes or cancellations hit drivers travelling to pickups today **[A]**
- Note who else is on shift and who covers which country **[H]**

## 2. Intake and order cleanup (`ops-intake`)

- Review new orders from the web form and the API **[A]**
- Spot conflicts inside an order: "Tampere" in the address, "Helsinki" in the notes **[A]**
- Ask the customer which address is right. Customers are never contacted by the agent alone **[P]**
- Spot duplicate orders: same VIN, same customer, submitted twice **[A]**
- Merge or cancel the duplicate **[P]**
- Check the VIN, plate and model are consistent with each other **[A]**
- Flag cars needing special handling: EV range, sports cars, vintage, oversize vans, non-runners **[A]**
- Check whether the car is road-legal: registration, insurance, inspection, transit plates **[A]**
- Decide whether to accept an order outside the normal service area or pattern **[H]**
- Check the customer's account standing: unpaid invoices, credit limit, past disputes **[A]**
- Identify who pays (the customer) versus who hands over (the site) versus who receives **[A]**
- Mark private or one-off handovers, where access and authority are harder to settle **[A]**
- Attach orders that came in by email or phone and never reached the system **[P]**
- Set the order's promise date honestly when facts are still uncertain **[H]**

## 3. Readiness: can the car actually leave? (`ops-readiness`)

- Confirm which branch or yard actually has the car **[A]**
- Call the pickup place to confirm the car is ready, through phone menus, retrying if nobody answers **[A]**
- Confirm release time and opening hours for the pickup slot **[A]**
- Confirm who holds the keys, and how many keys and fobs there are **[A]**
- Confirm whether a signed release or authorisation letter is needed **[A]**
- Chase a missing release document from the seller or dealer **[P]**
- Handle the "paper nobody mentioned" the seller suddenly wants **[P]**
- Confirm plate papers, registration certificate, service book and the original paper CMR **[A]**
- Confirm whether the car needs charging or fuel before it can be driven away **[A]**
- Confirm tyre state: winter tyres required in Finland and on many German roads in season **[A]**
- Check for known damage, warning lights or a dead battery before dispatching anyone **[A]**
- Record which statement came from whom: customer, site, driver, app or operator **[A]**
- Decide that the facts are good enough to offer the work **[H]**
- Hold an order back from the market until a missing fact is settled **[P]**
- Plan for a car that is "ready" but behind other cars, in a locked yard, or with a flat battery **[P]**

## 4. Planning and pricing (`ops-planning`)

- Choose the route: drive the whole way, relay through a transfer yard, or combine with other jobs **[P]**
- Pair orders so one driver can take two cars, or deliver one and collect a trade-in **[P]**
- Plan how the driver returns home after delivery **[P]**
- Estimate travel cost for positioning and return **[A]**
- Set or adjust the driver fee for the job **[P]**
- Reprice an offer nobody books, without assuming repricing explains why **[P]**
- Decide whether a job is worth taking at the customer's price **[H]**
- Plan around ferry timetables, border crossings and rest-time rules **[A]**
- Plan EV charging stops for long routes **[A]**
- Handle route restrictions: low-emission zones, toll vignettes, bridge tolls, congestion charges **[A]**
- Build in buffer for weather, holidays and late sites **[H]**

## 5. Offers and dispatch: the driver market (`ops-dispatch`)

- Publish an open offer for simpler domestic orders **[P]**
- Send a directed offer to one driver, with its five-minute decision window **[P]**
- Move a directed offer to the next driver when the window closes **[P]**
- Withdraw an offer that passed its booking cutoff while still marked `PUBLISHED` **[P]**
- Check who actually accepted the current offer **[A]**
- Check whether an earlier booking was cancelled before a new one was made **[A]**
- Tell `SHOWN` (exposure created) apart from `NOTIFIED` (delivered) and `VIEWED` (opened) **[A]**
- Check whether the assigned driver has a credible way to reach the pickup after their previous duty **[A]**
- Find a driver for an urgent or same-day job **[P]**
- Find a driver with the right licence, language or experience for the car **[A]**
- Avoid offering a job to a driver already stretched across several live duties **[A]**
- Handle the driver who says "I'll take it" in chat. A message is not a booking **[A]**
- Replace a driver who drops out **[P]**
- Decide whether to raise the fee to fill a hard job **[H]**
- Explain to a driver why they did not get a job **[P]**

## 6. Driver positioning and travel (`ops-travel`)

- Plan how the driver gets to the pickup: train, bus, flight, ferry, taxi for the last stretch **[A]**
- Compare prices and times across options **[A]**
- Book the travel. The agent stops before any real purchase **[P]**
- Book a hotel when a ferry or train forces an overnight stay **[P]**
- Keep quotes and bookings apart. A quote is not a booking **[A]**
- Rebook after a missed train or flight **[P]**
- Book a later ferry when the first is sold out, but check whether the first booking really failed **[P]**
- Cancel or amend a booking that is no longer needed, and claim refunds **[P]**
- Contact a ferry line about an amendment, a name change or a vehicle-length mismatch **[P]**
- Plan the return journey after delivery **[P]**
- Handle a driver stuck at an airport, a station or a closed terminal at night **[P]**
- Keep track of which tickets are on which booking reference **[A]**
- Know which ferry booking is for the driver alone and which includes the car **[A]**

## 7. On the road: live monitoring (`ops-shift`)

- Watch moving cars for late or stopped tracking **[A]**
- Tell a stale signal from a real delay: `observed_at` against `received_at` **[A]**
- Ask the driver before raising an alert to a person **[A]**
- Decide whether a car is likely to miss its promise **[P]**
- Warn the receiving customer of a late delivery **[P]**
- Handle an alert that is just a reason to look, not a diagnosis **[A]**
- Resolve, dismiss or acknowledge alerts, honestly **[P]**
- Check in on drivers on long or night drives **[A]**
- Watch rest and driving times on long routes **[A]**
- Handle a driver whose phone died and who went silent **[A]**
- Remember that a signal near a terminal is not a gate scan **[A]**

## 8. Incidents and emergencies

- Breakdown: ask if the driver is safe, where exactly they are, and for a photo of the warning light, in that order **[A]**
- Look up who owns the car and what roadside assistance it has **[A]**
- Call the dealer or owner to decide between their assistance and a tow **[H]**
- Arrange a tow, a garage or a replacement battery **[P]**
- Accident: make sure everyone is safe, then the police report, photos, the other party's details and the insurer **[H]**
- Damage found at pickup: record it with photos before the car moves **[A]**
- Damage reported at delivery: gather evidence without deciding who caused it **[A]**
- Speeding ticket, parking fine or toll fine arriving weeks later: work out which driver had the car **[P]**
- Stolen car, or keys lost or stolen **[H]**
- Driver injured or ill mid-job **[H]**
- Car impounded, stopped by police or held at a border **[H]**
- Driver locked out, keys left inside the car **[P]**
- Misfuel: diesel in petrol, or the other way round **[P]**
- EV runs flat, or no working charger nearby **[P]**
- Severe weather closes the route mid-journey **[P]**
- Driver reports harassment or feels unsafe at a site **[H]**
- Driver and site staff argue at a handover **[H]**
- A stranger wants to take the keys or the car. Being near the car is not authority to take it **[H]**

## 9. Ferries, borders and imports (`ops-import`)

- Confirm the ferry booking includes this car's plate and length **[A]**
- Check check-in at the terminal, which only a gate event proves **[A]**
- Handle a missed sailing: what's next, a hotel, the cost, an email to the ferry line **[P]**
- Prepare export and import paperwork for cars crossing borders **[P]**
- Check transit or export plates and their validity dates **[A]**
- Check the customs status of cars entering or leaving the EU, for Norway or the UK **[A]**
- Handle VAT and registration questions on imported cars **[H]**
- Know which country's rules apply, for example Finnish against German return-travel rules **[A]**

## 10. Pickup handover

- Make sure the driver knows the exact entrance, contact person and opening hours **[A]**
- Confirm the call-ahead was done, not just instructed **[A]**
- Handle "the car isn't ready" when the driver arrives **[P]**
- Handle a site that refuses release without a document **[P]**
- Handle the wrong car, wrong VIN or wrong plate on site **[H]**
- Make sure photos are taken of all sides, the odometer, fuel or charge and any damage **[A]**
- Make sure keys, fobs, papers and the CMR are counted and handed over **[A]**
- Record who actually handed over the car and keys **[A]**
- Handle a site that wants to keep plates or papers **[P]**
- Handle a driver who waited hours: waiting money, rescheduling, a new slot **[P]**

## 11. Delivery handover

- Confirm the receiver is available and authorised to accept the car **[A]**
- Warn the receiver of the arrival time **[P]**
- Handle a receiver who is not there: wait, reschedule or redirect **[P]**
- Handle a receiver who refuses the car over damage, dirt or a missing item **[H]**
- Collect the signed handover or digital CMR **[A]**
- Handle a trade-in collection at delivery and the return leg **[P]**
- Confirm keys, papers and accessories reached the buyer: charging cable, spare wheel, parcel shelf **[A]**
- Handle a delivery to an unattended location, such as a key box or after-hours drop **[P]**
- Tell a delivered car apart from a closed job. Signatures, proofs and disputes may still be open **[A]**

## 12. Evidence and proof review (`ops-evidence`)

- Review submitted pickup and delivery photos **[P]**
- Reject photos that are blurry, incomplete or of the wrong car, and tell the driver why **[P]**
- Approve or waive a proof requirement **[P]**
- Chase missing proofs after delivery **[A]**
- Handle a condition dispute without claiming more than the photos show **[H]**
- Check `file_count` against the files actually present **[A]**
- Match receipts to expenses **[A]**
- Keep custody records honest: reported versus verified **[A]**
- Produce an evidence pack for an insurance claim or customer dispute **[P]**

## 13. Driver support: questions all day (`ops-support`)

- Answer "Am I booked?", "Where do I go?", "What time is my slot?" **[A]**
- Answer "When do I get paid?" without claiming money moved **[A]**
- Answer "Can I claim this taxi, hotel or meal?" **[A]**
- Answer "Am I cancelled?" or "Is my job still on?" **[A]**
- Answer "Can I leave the keys with the hotel or a neighbour?" **[H]**
- Answer "Which job is this message about?" when the driver has several live duties **[A]**
- Link an inbox thread with no order to the right order, without leaking another account's details **[P]**
- Handle a quoted order reference that is wrong or belongs to someone else **[A]**
- Reply in German, Finnish, French or Danish without speaking it **[P]**
- Explain a rejected photo or expense **[P]**
- Explain app problems: login, upload failures, missing notifications **[A]**
- Hand hard questions to a person with the context already gathered **[A]**
- Calm down a frustrated or angry driver **[H]**
- Spot a driver in distress, and stop treating it as a routine ticket **[H]**

## 14. Customer, dealer and site communication

- Send arrival updates to customers **[P]**
- Tell a customer about a delay, a damage report or a change of plan **[P]**
- Confirm a changed address, slot or receiver with the customer **[P]**
- Agree a new date when the original one cannot hold **[P]**
- Answer "Where is my car?" truthfully when tracking is stale **[P]**
- Handle a dealer who corrects opening hours or contact people **[A]**
- Negotiate with a site about release terms **[H]**
- Handle complaints and escalate to the Ops Lead **[H]**
- Keep internal notes separate from what the customer sees **[A]**
- Know who has actually seen which message. `PUBLIC` means the named recipient only **[A]**

## 15. Cancellations, changes and reschedules

- Customer cancels: work out what is already booked and what must be undone **[P]**
- Driver cancels: find a replacement, record `PAYOUT_DUE` or `NO_PAYOUT` **[P]**
- Site cancels or delays the release **[P]**
- Cancel travel bookings and recover costs **[P]**
- Move an open key-proof requirement to the replacement assignment **[P]**
- Decide whether the driver is owed anything for a cancelled job **[H]**
- Charge the customer a cancellation fee, or waive it **[H]**
- Rebuild a pairing or relay plan when one leg falls out **[P]**

## 16. Multi-car, relays and trade-ins

- Coordinate a driver moving two cars in one plan **[P]**
- Coordinate a relay through a transfer yard with a separate assignment per leg **[P]**
- Track keys between legs and between drivers **[A]**
- Handle a trade-in return booked as a separate job with a second driver **[P]**
- Plan around a cancelled second leg **[P]**
- Keep both customers informed when one driver serves two orders **[P]**

## 17. Costs, expenses and finance (`ops-expenses`, `ops-finance`)

- Review driver expense claims: travel, fuel, charging, tolls, parking, hotel, meals **[P]**
- Check receipts exist and match the claim **[A]**
- Spot duplicate or corrected claims sharing the same receipt **[A]**
- Tell Bahn-paid costs apart from driver reimbursement requests **[A]**
- Keep DKK and SEK amounts unconverted unless a rate is recorded **[A]**
- Approve or reject a claim. Approved is not paid **[P]**
- Explain an approved claim's payout timing honestly **[A]**
- Hand approved claims to payroll **[P]**
- Spot jobs that lost money and why **[A]**
- Bill the customer for extras: waiting time, extra fuel, tolls, a failed handover **[P]**
- Handle a customer disputing an invoice **[H]**
- Track ferry and travel refunds still owed **[A]**
- Handle fines that arrive weeks after the job **[P]**

## 18. Working with the agent

- Review what the agent did while I was away **[H]**
- Approve a proposal as written **[H]**
- Edit a proposal before approving it. That is the normal case, not the exception **[H]**
- Refuse a proposal without losing the case history **[H]**
- Check what a proposal changes, what it leaves alone and who decides **[H]**
- Check a proposal's sources before trusting it **[H]**
- Reconcile an approved proposal whose external action may have failed **[P]**
- Correct the agent when it treated a claim as a fact **[H]**
- Teach the agent a new rule or answer-book entry **[H]**
- Decide when the agent has earned more freedom for a type of task **[H]**
- Take back freedom after a mistake **[H]**
- Spot needless escalations and missed ones **[H]**
- Report an agent mistake so it does not repeat **[H]**

## 19. Follow-ups and waiting threads

- Track every question waiting on an outside party, via `waiting_on` **[A]**
- Bring back a thread when `next_check_at` passes with no answer **[A]**
- Chase a site, driver or dealer who has gone quiet **[A]**
- Escalate a follow-up after the second unanswered chase **[P]**
- Close a follow-up only when the record actually changes **[H]**
- Keep a support request open after linking it, while a document or update is still owed **[A]**

## 20. Shift handover and out-of-hours

- Write, or generate, the end-of-shift handover: open, waiting, promised **[A]**
- Hand specific cases to a named colleague **[H]**
- Cover weekend intake and moving cars with fewer people **[H]**
- Decide what can wait until Monday and what cannot **[H]**
- Be reachable on call for night emergencies **[H]**
- Hand over between countries, for example Helsinki HQ and Berlin **[H]**

## 21. The driver network

- Recruit freelance drivers locally **[H]**
- Onboard new drivers: licence check, business registration, the app, the rules **[H]**
- Verify driving licences and their categories and expiry dates **[A]**
- Brief new drivers on keys, photos, the CMR and expenses **[A]**
- Track driver quality: lateness, damage, proof rejections, customer feedback **[A]**
- Give a driver feedback after a problem **[H]**
- Pause or remove a driver from the network **[H]**
- Reward and keep reliable drivers **[H]**
- Spot regions short of drivers ahead of busy weeks **[A]**
- Answer recruitment questions from would-be drivers **[A]**
- Keep driver contact details current. Missing details are common, not alarming **[A]**

## 22. Partners and suppliers

- Keep good relations with key dealers and yards **[H]**
- Keep site profiles current: hours, entrances, contacts, quirks **[A]**
- Manage towing, garage and roadside partners **[H]**
- Deal with ferry lines and travel providers on disputes and refunds **[P]**
- Coordinate with insurers on claims **[H]**

## 23. Making the operation better

- Spot repeated problems, for example one site always late or one route always missing ferries **[A]**
- Suggest a process fix to the Ops Lead **[H]**
- Update the answer book when a new kind of question appears **[H]**
- Adjust BahnOS itself: weights, rules, what counts as urgent **[H]**
- Write down a decision so the next junior does not have to make it from scratch **[H]**
- Review the week: cases per 100 orders, time to decision, missed escalations **[A]**
- Take part in post-mortems after expensive mistakes **[H]**
- Test new tools and features and give feedback **[H]**

## 24. Admin and compliance

- Keep personal data handled under GDPR: who can see driver and customer details **[H]**
- Answer data access or deletion requests **[H]**
- Keep records needed for audits, insurance and tax **[A]**
- Check drivers' freelance status stays compliant **[H]**
- Follow driving-time and rest rules where they apply **[A]**

## 25. Rare, strange but real

- The buyer wants the car delivered somewhere different, mid-drive **[P]**
- The seller sells the car to someone else while the driver is on the way **[H]**
- The car has a dog, child seat, golf clubs or personal items left inside **[P]**
- The car is full of rubbish or smells of smoke and the buyer complains **[P]**
- A car alarm goes off at a hotel at 3 a.m. **[P]**
- The driver is offered cash by the seller to take something extra **[H]**
- Two drivers turn up for the same car **[P]**
- A driver turns up for a car that was already collected **[P]**
- The car has a tracker or immobiliser and won't start away from the dealer **[P]**
- The odometer or fuel on handover differs wildly from the order **[A]**
- A celebrity's or high-value car needs discretion **[H]**
- A journalist or police officer calls asking about a car or driver **[H]**
- The car has a recall or safety notice outstanding **[A]**
- A message claims to be from Bahn but asks for keys or payment. Possible fraud **[H]**
- The receiver is a minor or clearly not the buyer **[H]**
- The ferry line loses the car's booking at the gate **[P]**

---

## What this list says about BahnOS

- **Most of the volume is [A].** Looking up, asking and chasing is where the
  hours go, and none of it needs approval. That is where the agent pays for itself.
- **The [P] tasks are where the screen earns trust.** Each needs "what changes,
  what does not, who decides", with Edit as prominent as Approve.
- **The [H] tasks are relationships, authority and money.** The screen should
  bring those to a person with context already gathered, never attempt them.
- **Sections 19 and 20 are the biggest holes today.** Nothing resurfaces and
  nothing hands over, yet both are daily work. (See `OPERATOR.md` §9.)
