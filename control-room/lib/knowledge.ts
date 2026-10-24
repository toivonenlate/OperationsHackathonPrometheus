// The driver-support answer database.
//
// Every entry carries a ROUTING decision, which is the point of the thing. An
// FAQ tells you the answer; this tells you whether the bot is allowed to give
// it, and what it must do instead when it is not.
//
//   ANSWER    Pure policy. No records needed, no approval, no human.
//   LOOKUP    Policy plus this driver's records. The bot may state what the
//             records establish and must hedge everything else.
//   ASK       The bot cannot answer yet. It asks one cheap question. Needs no
//             approval either, because asking is free.
//   ESCALATE  A person decides. Money, dates, authority, safety, or anything a
//             customer will see.
//
// Sources are marked so a reviewer can check them:
//   TRAINING  Bahn's own driver training videos and guides
//   WEB_FI    bahnexpress.fi/kuljettajat
//   WEB_DE    bahnexpress.de/fahrer/faq
//   WEB_COM   bahnexpress.com/drivers
//   DATASET   the challenge snapshot's own schema rules
//
// MARKET MATTERS. Finland, Germany and Denmark do not share plate rules,
// insurance models or reimbursement scope. An entry with a `market` field must
// not be answered for a driver in another market.

export type Routing = 'ANSWER' | 'LOOKUP' | 'ASK' | 'ESCALATE'
export type Source = 'TRAINING' | 'WEB_FI' | 'WEB_DE' | 'WEB_COM' | 'DATASET'
export type Market = 'FI' | 'DE' | 'DK' | 'ALL'

export type CornerCase = {
  /** The situation where the plain answer becomes wrong. */
  when: string
  /** What to do instead. */
  then: string
  routing: Routing
}

export type Entry = {
  id: string
  topic: string
  /** Paraphrases a driver might actually write. Multilingual on purpose. */
  triggers: string[]
  routing: Routing
  answer: string
  /** Facts the bot must read before answering, by dataset table. */
  reads?: string[]
  /** Things the bot must never assert on this topic. */
  cautions?: string[]
  corners?: CornerCase[]
  escalateTo?: string
  market: Market
  sources: Source[]
}

export const TOPICS = [
  'Onboarding',
  'Getting gigs',
  'Plates & documents',
  'Pickup',
  'On the road',
  'Delivery & handover',
  'Closing the gig',
  'Expenses & receipts',
  'Pay & invoicing',
  'Penalties & damage',
  'Insurance',
  'Availability',
  'Support',
] as const

export const KNOWLEDGE: Entry[] = [
  // ---------------------------------------------------------------- Onboarding
  {
    id: 'onb-requirements',
    topic: 'Onboarding',
    triggers: [
      'What do I need to become a driver?',
      'Am I eligible?',
      'How old do I have to be?',
    ],
    routing: 'ANSWER',
    answer:
      'At least 19 years old, a licence held for at least a year with a clean record, the right to work as an independent contractor, and a smartphone. Everything runs through the Bahn Driver app.',
    market: 'ALL',
    sources: ['WEB_FI', 'WEB_COM'],
    corners: [
      {
        when: 'The driver is applying in Germany',
        then: 'Germany additionally needs a registered business (Gewerbe) and red 06er plates, and rejects applications with relevant criminal entries or more than three points in Flensburg. Do not quote the Finnish requirements.',
        routing: 'ANSWER',
      },
    ],
  },
  {
    id: 'onb-intro-video',
    topic: 'Onboarding',
    triggers: ['What goes in the intro video?', 'How long should my video be?'],
    routing: 'ANSWER',
    answer:
      'Record in Finnish, under two minutes, answering three prompts: why you want to drive with Bahn, what you would do if heavy traffic was making you late, and how you would handle an upset customer.',
    market: 'FI',
    sources: ['TRAINING'],
  },
  {
    id: 'onb-licence-upload',
    topic: 'Onboarding',
    triggers: ['Which licence classes do I select?', 'What photo of my licence?'],
    routing: 'ANSWER',
    answer:
      'Select every class you actually hold — B full, B automatic-only, BE, C — and upload a clear photo of the front of the licence.',
    market: 'FI',
    sources: ['TRAINING'],
    cautions: [
      'Automatic-only is a real restriction. Never imply it can be worked around.',
    ],
  },
  {
    id: 'onb-driving-record',
    topic: 'Onboarding',
    triggers: ['What driving record do you need?', 'Where do I order my record?'],
    routing: 'ANSWER',
    answer:
      'A complete, readable driving record ordered from Traficom, as a photo or a PDF.',
    market: 'FI',
    sources: ['TRAINING'],
  },
  {
    id: 'onb-exam',
    topic: 'Onboarding',
    triggers: [
      'Can I change my exam answers?',
      'I failed the training exam',
      'Did I pass?',
    ],
    routing: 'ANSWER',
    answer:
      'Exam answers are saved for application review and are final once submitted. Every question must be answered correctly to pass.',
    market: 'ALL',
    sources: ['TRAINING'],
    corners: [
      {
        when: 'The driver asks to have a recorded answer corrected',
        then: 'Recorded answers cannot be changed. Say so plainly; do not promise a reset or a retake.',
        routing: 'ANSWER',
      },
    ],
  },
  {
    id: 'onb-no-gigs-visible',
    topic: 'Onboarding',
    triggers: [
      'I see no gigs in the app',
      'Why are there no jobs?',
      'App is empty',
    ],
    routing: 'LOOKUP',
    answer:
      'Gigs only appear once onboarding is approved. If onboarding is approved and the feed is still empty, it is a coverage or timing question, not an account problem.',
    reads: ['drivers', 'market_offers'],
    market: 'ALL',
    sources: ['TRAINING'],
    cautions: [
      'A missing offer in the feed is not evidence of no demand. The packet has no full driver feed or impression history.',
      'Never tell a driver why an offer did not reach them — reach checks are planning estimates, not delivery records.',
    ],
    corners: [
      {
        when: 'Onboarding status cannot be determined from the records',
        then: 'Ask whether they have had an approval message, and escalate to onboarding rather than guessing.',
        routing: 'ASK',
      },
    ],
  },

  // -------------------------------------------------------------- Getting gigs
  {
    id: 'gig-source-of-truth',
    topic: 'Getting gigs',
    triggers: [
      'Where do I find my gig details?',
      'The app and the email disagree',
      'Which time is right?',
    ],
    routing: 'ANSWER',
    answer:
      'The Driver App is the source of truth for an active gig. If anything else disagrees with it, the app wins.',
    market: 'ALL',
    sources: ['TRAINING'],
    corners: [
      {
        when: 'The driver has more than one live assignment and does not say which',
        then: 'Do not guess which gig they mean. Ask for the job reference and a screenshot of the conflicting message before saying anything about times.',
        routing: 'ASK',
      },
      {
        when: 'The driver is about to set off on the strength of the chat',
        then: 'Tell them explicitly not to set off on a chat message alone.',
        routing: 'ASK',
      },
    ],
  },
  {
    id: 'gig-am-i-booked',
    topic: 'Getting gigs',
    triggers: [
      'Am I booked for this?',
      'I said I would take it, is it mine?',
      'Did you reserve it for me?',
    ],
    routing: 'LOOKUP',
    answer:
      'Only a booking in the app makes a gig yours. Say so from the assignment record, naming its status.',
    reads: ['work_assignments', 'market_offers', 'market_offer_exposures'],
    market: 'ALL',
    sources: ['DATASET'],
    cautions: [
      'A message about taking work does not create a booking.',
      'A published directed offer is not an assignment.',
      'An offer can be past its booking cutoff while its stored status still reads PUBLISHED.',
    ],
    corners: [
      {
        when: 'The driver asked for a different fee',
        then: 'A requested fee is not an agreed fee. Nothing is reserved. Route the request to dispatch and say plainly that nothing is held for them.',
        routing: 'ESCALATE',
      },
    ],
    escalateTo: 'ops-dispatch',
  },
  {
    id: 'gig-offer-not-received',
    topic: 'Getting gigs',
    triggers: ['I never got the offer', 'Why did you send it to someone else?'],
    routing: 'LOOKUP',
    answer:
      'For a directed offer, the records show whether an exposure was created, delivered, viewed, or decided. Report exactly which of those happened.',
    reads: ['market_offer_exposures', 'market_offer_demand_signals'],
    market: 'ALL',
    sources: ['DATASET'],
    cautions: [
      'SHOWN means an exposure was created, not that a notification reached the driver.',
      'A directed offer has a five-minute decision window and one live recipient at a time.',
    ],
  },
  {
    id: 'gig-commitment',
    topic: 'Getting gigs',
    triggers: [
      'Do I have to take a minimum number of gigs?',
      'Can I drive part-time?',
    ],
    routing: 'ANSWER',
    answer:
      'Outside an active gig there is no commitment and no fixed availability. Part-time is normal. Active drivers are asked to take a few gigs a month because processes change.',
    market: 'ALL',
    sources: ['TRAINING', 'WEB_FI'],
    corners: [
      {
        when: 'The driver is in Germany and holds red plates through Bahn',
        then: 'Germany requires a minimum of four trips a month, or the driver returns the plates or pays the monthly insurance themselves. This is an insurance condition, not a Finnish activity guideline.',
        routing: 'ANSWER',
      },
    ],
  },
  {
    id: 'gig-ratings',
    topic: 'Getting gigs',
    triggers: ['Do ratings matter?', 'Why am I getting fewer gigs?'],
    routing: 'ANSWER',
    answer:
      'Customer ratings affect which gigs and what pay rate you are offered later.',
    market: 'ALL',
    sources: ['TRAINING'],
    cautions: [
      'Never attribute a specific drop in offers to a rating. The records do not establish why an offer was not booked.',
    ],
  },

  // ------------------------------------------------------- Plates & documents
  {
    id: 'doc-collect-plates',
    topic: 'Plates & documents',
    triggers: [
      'When do I pick up the plates?',
      'Where do I get the CMR?',
      'Transit plates',
    ],
    routing: 'ANSWER',
    answer:
      'Collect the CMR document and the transport/transit plates from storage the day before the gig.',
    market: 'FI',
    sources: ['TRAINING'],
  },
  {
    id: 'doc-return-plates',
    topic: 'Plates & documents',
    triggers: ['When do I return the plates?', 'Do I keep the plates?'],
    routing: 'ANSWER',
    answer:
      'Return transport plates and storage items within 12 hours of the gig ending — or by 16:00 the next day if the gig ended after 20:00.',
    market: 'FI',
    sources: ['TRAINING'],
  },
  {
    id: 'doc-red-plates-de',
    topic: 'Plates & documents',
    triggers: [
      'Rote Kennzeichen',
      'How do I get red plates?',
      'My registration office refuses',
    ],
    routing: 'ANSWER',
    answer:
      'German red 06er plates take two to four weeks and need a registered business. If the local office will not issue them, the routes are: register the business in a district that does issue them, apply for an exemption from the state transport authority, or register as a vehicle dealer.',
    market: 'DE',
    sources: ['WEB_DE'],
    cautions: [
      'Never quote this to a Finnish or Danish driver. Finland uses transit plates from Bahn storage.',
    ],
  },
  {
    id: 'doc-cmr-refused',
    topic: 'Plates & documents',
    triggers: [
      'They refuse to sign the CMR',
      'Dealer will not sign',
      'What if nobody signs?',
    ],
    routing: 'ANSWER',
    answer:
      'Write "Refused to sign" in Field 22 and continue the gig. Do not wait and do not abandon the pickup over a signature.',
    market: 'ALL',
    sources: ['TRAINING'],
    corners: [
      {
        when: 'The site refuses to release the car at all, not just to sign',
        then: 'That is a release-authority problem, not a paperwork one. Stop, do not take the car, and escalate — vehicle presence is not pickup authority.',
        routing: 'ESCALATE',
      },
    ],
    escalateTo: 'ops-readiness',
  },
  {
    id: 'doc-cmr-copies',
    topic: 'Plates & documents',
    triggers: ['Who keeps the white CMR copy?', 'What goes in Field 1?'],
    routing: 'ANSWER',
    answer:
      'The pickup location staff keep the white copy. Field 1 (Sender) takes the official pickup location name and address.',
    market: 'ALL',
    sources: ['TRAINING'],
  },
  {
    id: 'doc-cmr-signed-meaning',
    topic: 'Plates & documents',
    triggers: ['Is the CMR signed?', 'Is the handover complete?'],
    routing: 'LOOKUP',
    answer:
      'Report the document\'s actual signature scope rather than whether it is "signed".',
    reads: ['documents', 'proofs'],
    market: 'ALL',
    sources: ['DATASET'],
    cautions: [
      'SIGNED by itself does not mean the receiver signed. A digital CMR with COLLECTION_ONLY scope records the pickup side only.',
      'Pickup and delivery proof captures are separate records.',
    ],
  },

  // -------------------------------------------------------------------- Pickup
  {
    id: 'pick-first-step',
    topic: 'Pickup',
    triggers: ['What do I do when I arrive?', 'How do I start the pickup?'],
    routing: 'ANSWER',
    answer:
      'Introduce yourself at the dealership and identify the car. Then collect the keys using the Power of Attorney or the pickup code in the Driver App.',
    market: 'ALL',
    sources: ['TRAINING'],
  },
  {
    id: 'pick-photo-order',
    topic: 'Pickup',
    triggers: [
      'When do I take the photos?',
      'Photos before or after the plates?',
    ],
    routing: 'ANSWER',
    answer:
      'On international gigs, take the required pickup photos BEFORE attaching the transit plates. Inspect the car carefully and record all existing damage before moving it, and confirm every photo has uploaded before you leave.',
    market: 'ALL',
    sources: ['TRAINING'],
    cautions: [
      'Photos protect the customer, Bahn and the driver. Never suggest skipping or deferring them.',
    ],
    corners: [
      {
        when: 'The driver has already attached the plates and not photographed',
        then: 'Photograph now anyway, note the sequence in the app, and flag it — a missing photo process carries a penalty of 50% of the gig fee, and only a person decides whether it applies.',
        routing: 'ESCALATE',
      },
    ],
    escalateTo: 'ops-evidence',
  },
  {
    id: 'pick-photos-rejected',
    topic: 'Pickup',
    triggers: [
      'My photos were rejected',
      'Why do I need to retake them?',
      'Wrong car in the photos',
    ],
    routing: 'LOOKUP',
    answer:
      'Name the specific proof requirement and the recorded reason, and ask for the exact replacement set: this vehicle\'s registration and four sides.',
    reads: ['proofs', 'documents'],
    market: 'ALL',
    sources: ['DATASET', 'TRAINING'],
    cautions: [
      'A rejected set keeps its files and its reason.',
      'A direct site statement about vehicle identity does not turn rejected condition photos into approved pickup evidence.',
    ],
  },
  {
    id: 'pick-car-not-ready',
    topic: 'Pickup',
    triggers: [
      'The car is not here',
      'They say it is not ready',
      'Nobody has the keys',
    ],
    routing: 'ASK',
    answer:
      'Gather the facts first: which site, who you spoke to, what they said, and whether the car is physically present. Then escalate with that in hand.',
    reads: ['order_endpoint_details', 'sites', 'custody_assets'],
    market: 'ALL',
    sources: ['TRAINING', 'DATASET'],
    cautions: [
      'Vehicle presence is not pickup authority.',
      'Do not tell the driver to wait a specific time, and never mark the car collected.',
    ],
    escalateTo: 'ops-readiness',
  },
  {
    id: 'pick-extra-paper',
    topic: 'Pickup',
    triggers: [
      'They want a document nobody mentioned',
      'Seller demands a release paper',
    ],
    routing: 'ESCALATE',
    answer:
      'Record exactly which document is being demanded and by whom, then hold the collection. Do not take the car.',
    reads: ['documents', 'order_endpoint_details'],
    market: 'ALL',
    sources: ['TRAINING', 'DATASET'],
    escalateTo: 'ops-readiness',
  },

  // --------------------------------------------------------------- On the road
  {
    id: 'road-speed',
    topic: 'On the road',
    triggers: ['How fast can I drive?', 'Is there a speed cap?'],
    routing: 'ANSWER',
    answer:
      'Follow every posted speed limit, and never exceed 150 km/h under any circumstances. Bahn monitors vehicle location and speed, and misconduct is reported.',
    market: 'ALL',
    sources: ['TRAINING'],
  },
  {
    id: 'road-route',
    topic: 'On the road',
    triggers: ['Can I take a different route?', 'Can I stop at home on the way?'],
    routing: 'ANSWER',
    answer:
      'Take the most efficient route. Private detours are not covered and, in Germany, private route deviations void insurance cover.',
    market: 'ALL',
    sources: ['TRAINING', 'WEB_DE'],
  },
  {
    id: 'road-in-car-rules',
    topic: 'On the road',
    triggers: ['Can I smoke?', 'Can I eat in the car?', 'Can I take a passenger?'],
    routing: 'ANSWER',
    answer:
      'No eating, no smoking, and no trash left in the car. In Germany, passengers and cargo are not insured.',
    market: 'ALL',
    sources: ['TRAINING', 'WEB_DE'],
  },
  {
    id: 'road-ev-range',
    topic: 'On the road',
    triggers: [
      'How much charge on delivery?',
      'Where do I charge?',
      'Ionity login',
    ],
    routing: 'ANSWER',
    answer:
      'Deliver electric vehicles with at least 20% range remaining. For charging on a Bahn gig, request Ionity account credentials from Driver Support.',
    market: 'ALL',
    sources: ['TRAINING'],
  },
  {
    id: 'road-ran-out',
    topic: 'On the road',
    triggers: [
      'I ran out of fuel',
      'Battery died',
      'The car stopped and I am stuck',
    ],
    routing: 'ASK',
    answer:
      'Safety and location first: are you safe, and exactly where are you. Then explain that running out mid-drive carries a €100 contractual penalty, and that a person decides recovery.',
    market: 'ALL',
    sources: ['TRAINING'],
    cautions: [
      'Never authorise onward driving. Never promise a recovery time or who pays.',
    ],
    escalateTo: 'ops-shift',
  },
  {
    id: 'road-warning-light',
    topic: 'On the road',
    triggers: [
      'Warning light is on',
      'The car is making a noise',
      'Reduced power',
    ],
    routing: 'ASK',
    answer:
      'Ask three things, in this order: are you safe, exactly where are you, and send a photo of the warning light. Then bring a person one decision. Tell the driver to keep the vehicle stopped.',
    reads: ['incidents', 'orders', 'vehicles', 'time_windows'],
    market: 'ALL',
    sources: ['TRAINING', 'DATASET'],
    cautions: [
      'Never clear the driver to continue. Only the owner decides recovery.',
      'A driver-reported stop location is not a verified position.',
    ],
    escalateTo: 'ops-shift',
  },
  {
    id: 'road-delay',
    topic: 'On the road',
    triggers: ['I am running late', 'Traffic is bad', 'I will miss the slot'],
    routing: 'ASK',
    answer:
      'Get a current position and a revised arrival estimate from the driver, then record it. Contact Driver Support as soon as it is safe to do so.',
    reads: ['tracking_observations', 'time_windows'],
    market: 'ALL',
    sources: ['TRAINING', 'DATASET'],
    cautions: [
      'Do not change the delivery promise. A new promise needs the customer, and the agent may not contact a customer.',
      'A driver message is not a position fix.',
    ],
    escalateTo: 'ops-shift',
  },
  {
    id: 'road-ferry-risk',
    topic: 'On the road',
    triggers: [
      'I will miss the ferry',
      'The queue is not moving',
      'Can I get a later sailing?',
      'I am still in the queue with the car',
      'The queue before the terminal has barely moved',
      'the booked crossing may close before I reach check-in',
    ],
    routing: 'ASK',
    answer:
      'Confirm whether they are still in the queue with the car and get their latest estimate. Keep the existing booking active.',
    reads: ['travel_reservations', 'travel_options', 'ferry_terminal_events'],
    market: 'ALL',
    sources: ['DATASET', 'TRAINING'],
    cautions: [
      'Never tell a driver to turn away from the terminal.',
      'Never promise another crossing before capacity and fare are confirmed. A quote is not a booking.',
      'Only a gate observation confirms check-in.',
    ],
    escalateTo: 'ops-travel',
  },
  {
    id: 'road-overnight-custody',
    topic: 'On the road',
    triggers: [
      'Can the hotel keep the key?',
      'Where do I park overnight?',
      'Can someone else hold the car?',
      'Am I meant to keep the car overnight?',
      'who confirms the keys and where should I report',
      'Should I collect the second set of keys early?',
    ],
    routing: 'ESCALATE',
    answer:
      'Tell the driver to keep the keys with them for now. Third-party custody needs the vehicle owner\'s approval, which no record establishes.',
    reads: ['custody_assets', 'custody_reports'],
    market: 'ALL',
    sources: ['DATASET'],
    cautions: [
      'Never approve a third party taking custody. Ask if they need another parking arrangement instead.',
    ],
    escalateTo: 'ops-shift',
  },

  // ------------------------------------------------------- Delivery & handover
  {
    id: 'del-arrival',
    topic: 'Delivery & handover',
    triggers: ['What do I do on arrival?', 'Delivery steps'],
    routing: 'ANSWER',
    answer:
      'Park the car and take the required delivery photos before doing anything else.',
    market: 'ALL',
    sources: ['TRAINING'],
  },
  {
    id: 'del-keys',
    topic: 'Delivery & handover',
    triggers: [
      'Where do I leave the keys?',
      'Can I leave the key on the tyre?',
      'Nobody is here to take the keys',
    ],
    routing: 'ANSWER',
    answer:
      'Keys go in a lockable key box or directly to a dealership salesperson, as instructed. Never leave keys on a tyre or anywhere unsecured. Photograph the drop location, upload it, and write a short description of where you left them.',
    market: 'ALL',
    sources: ['TRAINING'],
    corners: [
      {
        when: 'There is no key box and nobody authorised is present',
        then: 'Do not improvise a drop. Keep the keys and escalate — no record names anyone authorised to receive.',
        routing: 'ESCALATE',
      },
    ],
    escalateTo: 'ops-evidence',
  },
  {
    id: 'del-receiver-authority',
    topic: 'Delivery & handover',
    triggers: [
      'Who signs for the car?',
      'Someone else says they can take it',
      'Can I hand it to this person?',
    ],
    routing: 'ESCALATE',
    answer:
      'Get the name and role of whoever is presenting themselves, and hold the handover until a recorded authority exists.',
    reads: ['order_endpoint_details', 'endpoint_claims', 'documents'],
    market: 'ALL',
    sources: ['DATASET'],
    cautions: [
      'A claim to be authorised is not authority. A buyer naming a contact is not the same as that contact being verified.',
    ],
    escalateTo: 'ops-readiness',
  },
  {
    id: 'del-address-conflict',
    topic: 'Delivery & handover',
    triggers: [
      'The address in the app differs from the notes',
      'Which city am I delivering to?',
    ],
    routing: 'ASK',
    answer:
      'The app is the source of truth for the gig. Confirm what the app shows, do not act on the note, and raise the conflict.',
    reads: ['addresses', 'order_notes', 'order_endpoint_details'],
    market: 'ALL',
    sources: ['TRAINING', 'DATASET'],
    escalateTo: 'ops-planning',
  },

  // --------------------------------------------------------- Closing the gig
  {
    id: 'close-complete',
    topic: 'Closing the gig',
    triggers: ['When is the gig finished?', 'Do I need to confirm anything?'],
    routing: 'ANSWER',
    answer:
      'A gig is complete only when the handover is confirmed in the app.',
    market: 'ALL',
    sources: ['TRAINING'],
  },
  {
    id: 'close-locked-out',
    topic: 'Closing the gig',
    triggers: [
      'I marked it complete and forgot a receipt',
      'Can I add a document now?',
    ],
    routing: 'ESCALATE',
    answer:
      'Once a gig is marked completed, documents and receipts cannot be added to it. Do not tell the driver to try again — route it to a person.',
    market: 'ALL',
    sources: ['TRAINING'],
    cautions: [
      'Never imply the cost is lost, and never promise it will be paid. Only a person decides an out-of-process claim.',
    ],
    escalateTo: 'ops-expenses',
  },

  // ------------------------------------------------------ Expenses & receipts
  {
    id: 'exp-what-covered-intl',
    topic: 'Expenses & receipts',
    triggers: [
      'What is covered on an international gig?',
      'Will you pay my hotel?',
    ],
    routing: 'ANSWER',
    answer:
      'International gigs are reimbursed door to door for necessary costs of the whole journey: fuel, charging, public transport, hotels, road tolls and bridge fees. Hotels have a fixed budget of €80 per night.',
    market: 'ALL',
    sources: ['TRAINING', 'WEB_FI'],
  },
  {
    id: 'exp-what-covered-domestic',
    topic: 'Expenses & receipts',
    triggers: [
      'What is covered on a domestic gig?',
      'Why is my bus ticket not covered?',
    ],
    routing: 'ANSWER',
    answer:
      'Domestic gigs cover charging and refuelling only, because gigs are chained and you get a return car from the delivery point back towards your start. Public transport is not reimbursed on domestic gigs.',
    market: 'FI',
    sources: ['TRAINING', 'WEB_FI'],
  },
  {
    id: 'exp-taxi',
    topic: 'Expenses & receipts',
    triggers: ['Can I take a taxi?', 'Is a taxi covered?'],
    routing: 'ANSWER',
    answer:
      'Taxis are allowed only with prior permission from Driver Support. Ask before you spend.',
    market: 'ALL',
    sources: ['TRAINING'],
    corners: [
      {
        when: 'The driver already took the taxi without asking',
        then: 'Do not approve it retrospectively and do not refuse it either. Record the cost and route the decision to a person.',
        routing: 'ESCALATE',
      },
    ],
    escalateTo: 'ops-expenses',
  },
  {
    id: 'exp-unclear',
    topic: 'Expenses & receipts',
    triggers: ['Can I buy this?', 'Will you cover this cost?', 'Not sure if covered'],
    routing: 'ANSWER',
    answer:
      'When coverage is unclear, contact Driver Support before spending. That is the rule, and asking first is always the right move.',
    market: 'ALL',
    sources: ['TRAINING'],
  },
  {
    id: 'exp-receipt-valid',
    topic: 'Expenses & receipts',
    triggers: [
      'What makes a valid receipt?',
      'Can I send a bank screenshot?',
      'Is this receipt enough?',
    ],
    routing: 'ANSWER',
    answer:
      'A valid receipt clearly shows the company name, the total amount, the VAT percentage, the time and date, and the items bought. Bank app screenshots are not accepted.',
    market: 'ALL',
    sources: ['TRAINING'],
  },
  {
    id: 'exp-upload-where',
    topic: 'Expenses & receipts',
    triggers: [
      'Where do I upload a receipt?',
      'Wohin lade ich die Quittung?',
      'How do I claim an expense?',
    ],
    routing: 'ANSWER',
    answer:
      'Upload receipts under Expenses in the active gig, before you mark the gig completed. Use the matching job. Keep the original paper receipt until the reimbursement has arrived.',
    market: 'ALL',
    sources: ['TRAINING', 'DATASET'],
    cautions: [
      'This is a general-policy answer and needs no order link. It does not imply any reimbursement decision for a specific job.',
    ],
  },
  {
    id: 'exp-status',
    topic: 'Expenses & receipts',
    triggers: [
      'Was my expense approved?',
      'Is my claim in review?',
      'I submitted a correction',
      'My parking receipt has not been reimbursed',
      'Parkquittung wurde noch nicht erstattet',
      'Wann wird mir die Quittung erstattet?',
      'Min kvittering er ikke refunderet',
    ],
    routing: 'LOOKUP',
    answer:
      'Report the claim\'s recorded review state and the date it was decided. Name the amount in its own currency.',
    reads: ['expenses'],
    market: 'ALL',
    sources: ['DATASET'],
    cautions: [
      'APPROVED means the claim was accepted, not that money moved.',
      'A superseded entry is kept and linked to its correction; neither is evidence of payment.',
      'A claim in a non-EUR currency must not be converted — no exchange rate exists in the records.',
      'A cost with payer BAHN and no driver claimant is not the driver\'s reimbursement at all.',
    ],
    corners: [
      {
        when: 'The driver asks when the money arrives',
        then: 'The approval record does not contain a payout. State the approval, say plainly that approval is not payment, and say you are checking settlement — then escalate.',
        routing: 'ESCALATE',
      },
      {
        when: 'The driver has submitted the same receipt twice',
        then: 'Tell them not to upload it again, name both entries, and let expenses review each independently.',
        routing: 'LOOKUP',
      },
    ],
    escalateTo: 'ops-expenses',
  },
  {
    id: 'exp-fines',
    topic: 'Expenses & receipts',
    triggers: [
      'Who pays my parking ticket?',
      'I got a speeding fine',
      'Is the fine covered?',
    ],
    routing: 'ANSWER',
    answer:
      'Drivers are personally responsible for parking tickets, speeding tickets and other traffic fines incurred during a gig.',
    market: 'ALL',
    sources: ['TRAINING'],
  },

  // ---------------------------------------------------------- Pay & invoicing
  {
    id: 'pay-when',
    topic: 'Pay & invoicing',
    triggers: ['When do I get paid?', 'Where is my gig fee?', 'Payment schedule'],
    routing: 'ANSWER',
    answer:
      'Invoicing and payouts run through Truster, and payments are issued on Mondays. A gig finished by Wednesday is paid the following Monday; a gig finished after Wednesday is paid the Monday after next. Submitting invoicing on time keeps it on schedule.',
    market: 'ALL',
    sources: ['TRAINING', 'WEB_FI'],
    cautions: [
      'This is the schedule, not a confirmation that any particular payment has been made.',
    ],
    corners: [
      {
        when: 'The driver says a specific payment is missing',
        then: 'That is no longer a schedule question. Get the job reference, state what the records show about the gig and the claim, and escalate — the records contain no payout ledger.',
        routing: 'ESCALATE',
      },
      {
        when: 'The gig was cancelled',
        then: 'A cancelled assignment records PAYOUT_DUE or NO_PAYOUT separately, and PAYOUT_DUE does not mean money has been paid. An approved expense does not reinstate a cancelled gig fee.',
        routing: 'LOOKUP',
      },
    ],
    escalateTo: 'ops-finance',
  },
  {
    id: 'pay-rate',
    topic: 'Pay & invoicing',
    triggers: ['How much does a gig pay?', 'What is the fee?', 'Can I earn more?'],
    routing: 'LOOKUP',
    answer:
      'The fee is fixed and shown in the app before you accept. Quote the fee on the driver\'s own assignment record.',
    reads: ['work_assignments', 'market_offers'],
    market: 'ALL',
    sources: ['WEB_FI', 'DATASET'],
    cautions: [
      'Never negotiate or imply a fee can be raised. A requested fee is not an agreed fee.',
      'Offer fees in the records are planning values, not a pricing policy.',
    ],
    escalateTo: 'ops-dispatch',
  },
  {
    id: 'pay-return-trip',
    topic: 'Pay & invoicing',
    triggers: ['Is my trip home covered?', 'How do I get back?'],
    routing: 'ANSWER',
    answer:
      'On international gigs, return travel by public transport is reimbursed. On domestic gigs, you take a bundled gig that includes a return car rather than being reimbursed for transport.',
    market: 'FI',
    sources: ['WEB_FI', 'TRAINING'],
  },
  {
    id: 'pay-truster',
    topic: 'Pay & invoicing',
    triggers: ['What is Truster?', 'Do I need a company?', 'Am I an employee?'],
    routing: 'ANSWER',
    answer:
      'You work as an independent contractor. Invoicing and payouts go through Truster, as a light entrepreneur or solo entrepreneur. The Truster fee is 3.5% and includes insurance.',
    market: 'FI',
    sources: ['TRAINING', 'WEB_FI'],
    corners: [
      {
        when: 'The driver is in Germany',
        then: 'Germany is different: a registered Gewerbe is required, and insurance is funded by 15% of each trip through a broker, not by a Truster fee.',
        routing: 'ANSWER',
      },
    ],
  },

  // ------------------------------------------------------ Penalties & damage
  {
    id: 'pen-schedule',
    topic: 'Penalties & damage',
    triggers: [
      'What are the penalties?',
      'Will I be fined?',
      'What happens if I mess up?',
    ],
    routing: 'ANSWER',
    answer:
      'The contractual penalties are: missing the required photo process, 50% of the gig fee; a contact or communication breach, €100; running out of fuel or battery mid-drive, €100; a cancellation or missed flight without force majeure, €200 and no gig fee.',
    market: 'ALL',
    sources: ['TRAINING'],
    cautions: [
      'Quote the schedule. Never tell a driver a penalty has been or will be applied to them — that is a person\'s decision.',
    ],
  },
  {
    id: 'pen-deductible',
    topic: 'Penalties & damage',
    triggers: ['What is my deductible?', 'I damaged the car', 'Who pays for damage?'],
    routing: 'ASK',
    answer:
      'Ask whether anyone is hurt and whether the car is safe, then get photos and the location. The deductible for damage caused is €2,000 per incident. In Germany the insurance self-pay is capped at €1,000 for a collision and €0 for liability claims.',
    reads: ['incidents', 'proofs'],
    market: 'ALL',
    sources: ['TRAINING', 'WEB_DE'],
    cautions: [
      'Never attribute cause or fault. Photos establish a reported condition, not when or by whom it happened.',
      'Report damage to Driver Support immediately, as soon as it is safe to do so.',
    ],
    escalateTo: 'ops-shift',
  },
  {
    id: 'pen-condition-claim',
    topic: 'Penalties & damage',
    triggers: [
      'The dealer says I damaged it',
      'There is a damage claim against me',
    ],
    routing: 'ESCALATE',
    answer:
      'Gather the driver\'s account and point at the pickup and delivery photo sets. Do not accept or reject the claim.',
    reads: ['incidents', 'proofs', 'documents'],
    market: 'ALL',
    sources: ['DATASET'],
    cautions: [
      'Photos establish a reported condition, not an attribution. Lighting and angle differences settle nothing.',
    ],
    escalateTo: 'ops-shift',
  },
  {
    id: 'pen-force-majeure',
    topic: 'Penalties & damage',
    triggers: [
      'My flight was cancelled',
      'The ferry was cancelled',
      'Was that my fault?',
    ],
    routing: 'ASK',
    answer:
      'Get what happened, when, and any carrier notice. A cancellation, missed flight or missed ferry is not a breach where force majeure prevented it, and the penalty or deductible is waived — though no gig fee is paid.',
    market: 'ALL',
    sources: ['TRAINING'],
    cautions: [
      'Never rule on whether force majeure applies. Collect the evidence and hand it over.',
    ],
    escalateTo: 'ops-finance',
  },

  // ------------------------------------------------------------- Availability
  {
    id: 'avail-illness',
    topic: 'Availability',
    triggers: [
      'I am ill',
      'I am not fit to drive',
      'I might not make the slot tomorrow',
      'I am still unsure whether I will be well enough to drive',
      'I am unwell this morning',
      'not well enough to drive',
    ],
    routing: 'LOOKUP',
    answer:
      'Thank them, confirm the assignment is still theirs and has not been cancelled, state the unchanged slot, and ask for a definite answer by a named time. Illness must be supported by a doctor\'s certificate.',
    reads: ['work_assignments', 'time_windows'],
    market: 'ALL',
    sources: ['TRAINING', 'DATASET'],
    cautions: [
      'An illness report is not a cancellation. Only the driver can withdraw from accepted work.',
      'Never say a replacement is booked. Preparing cover is not a booking, and double-booking must be avoided.',
      'Never promise the fee is safe either way.',
    ],
    corners: [
      {
        when: 'The driver asks you not to cancel the gig yet',
        then: 'Honour it explicitly in the reply, and make sure dispatch sees that the assignment stays visible while cover is prepared.',
        routing: 'LOOKUP',
      },
      {
        when: 'The slot is within hours and there is still no definite answer',
        then: 'Escalate to dispatch for a backup decision rather than waiting.',
        routing: 'ESCALATE',
      },
    ],
    escalateTo: 'ops-dispatch',
  },
  {
    id: 'avail-cannot-reach',
    topic: 'Availability',
    triggers: [
      'I cannot reach the pickup in time',
      'I need rest after my last gig',
      'No way to get there',
    ],
    routing: 'LOOKUP',
    answer:
      'Confirm the constraint in the driver\'s own words — where they finish and the earliest they can start — and record it. The assignment remains accepted until they withdraw.',
    reads: ['work_assignments', 'travel_reservations', 'travel_options'],
    market: 'ALL',
    sources: ['DATASET'],
    cautions: [
      'A previous duty\'s ETA and a home city are not a current location.',
      'A travel quote is not a booked ticket.',
      'A changed slot needs the customer to agree, and the agent may not contact a customer.',
    ],
    escalateTo: 'ops-dispatch',
  },
  {
    id: 'avail-want-to-cancel',
    topic: 'Availability',
    triggers: ['I want to cancel', 'Can I give the gig back?'],
    routing: 'ESCALATE',
    answer:
      'Record the request and the reason as stated, and the time. Do not process the cancellation and do not discuss what it costs them.',
    reads: ['work_assignments'],
    market: 'ALL',
    sources: ['TRAINING', 'DATASET'],
    cautions: [
      'A cancellation without force majeure carries a €200 penalty and no gig fee, but whether that applies is a person\'s decision.',
    ],
    escalateTo: 'ops-dispatch',
  },

  // ------------------------------------------------------------------ Support
  {
    id: 'sup-how-to-reach',
    topic: 'Support',
    triggers: ['How do I reach you?', 'Is there a phone number?', 'Response time?'],
    routing: 'ANSWER',
    answer:
      'In-app chat on weekdays, with an average response of about ten minutes, and an urgent phone line in the evenings, at night and at weekends. Email drivers@bahnexpress.com for anything not urgent.',
    market: 'ALL',
    sources: ['TRAINING', 'WEB_FI'],
  },
  {
    id: 'sup-who-are-you',
    topic: 'Support',
    triggers: ['Do you actually drive?', 'Who is on the other end?', 'Are you a bot?'],
    routing: 'ANSWER',
    answer:
      'Say plainly that this is Bahn\'s support assistant and that a person is one message away. Bahn\'s operations team are former drivers or people who still drive gigs regularly.',
    market: 'ALL',
    sources: ['TRAINING'],
    cautions: [
      'Never claim to be a person.',
    ],
  },
  {
    id: 'sup-wrong-reference',
    topic: 'Support',
    triggers: [
      'Asking about a job reference that is not theirs',
      'Status of CD-xxxx',
    ],
    routing: 'ASK',
    answer:
      'If the quoted reference does not belong to this sender, ask for the correct one from their own booking confirmation.',
    reads: ['orders', 'support_inbox_threads'],
    market: 'ALL',
    sources: ['DATASET'],
    cautions: [
      'Do not reveal the car, route, buyer or driver on an order that is not theirs. A quoted reference is an unverified claim, not an order link.',
    ],
  },
  {
    id: 'sup-which-job',
    topic: 'Support',
    triggers: [
      'Which job do I follow?',
      'I got a text about a different time',
      'My next pickup',
    ],
    routing: 'ASK',
    answer:
      'Where the driver has more than one upcoming assignment, ask for the job reference and a screenshot of the conflicting message, and tell them not to set off on the chat alone.',
    reads: ['work_assignments', 'support_inbox_threads'],
    market: 'ALL',
    sources: ['DATASET', 'TRAINING'],
    cautions: [
      'Candidate order matches are hypotheses, not links. Never act on an unconfirmed match.',
    ],
  },

  // ------------------------------------ market divergence (found by crawling)
  {
    id: 'mkt-return-travel',
    topic: 'Pay & invoicing',
    triggers: [
      'How do I get home after delivery?',
      'Is my trip back covered?',
      'Wer zahlt die Rückfahrt?',
    ],
    routing: 'ANSWER',
    answer:
      'Establish which market the gig is in first, because all three give a different answer.',
    market: 'ALL',
    sources: ['WEB_FI', 'WEB_DE', 'WEB_COM'],
    cautions: [
      'There is no single Bahn answer to this. Quoting the wrong market’s rule costs the driver money.',
    ],
    corners: [
      {
        when: 'Finland, domestic gig',
        then: 'Public transport is not reimbursed. Gigs are chained, so you take a return car from the delivery point back towards your start. International gigs do reimburse return travel by public transport.',
        routing: 'ANSWER',
      },
      {
        when: 'Denmark',
        then: 'If a car is heading your way you drive it and earn on the return. If not, Bahn covers your transport home.',
        routing: 'ANSWER',
      },
      {
        when: 'Germany',
        then: 'If a car is heading back your way you can drive it. If not, the driver pays their own return costs.',
        routing: 'ANSWER',
      },
    ],
  },
  {
    id: 'mkt-payout-mechanics',
    topic: 'Pay & invoicing',
    triggers: ['How fast is the payout?', 'Wann kommt das Geld?', 'Do I invoice you?'],
    routing: 'ANSWER',
    answer:
      'Payout mechanics differ by market. Establish the market before quoting any timing.',
    market: 'ALL',
    sources: ['TRAINING', 'WEB_DE', 'WEB_FI'],
    corners: [
      {
        when: 'Finland',
        then: 'Invoicing and payouts run through Truster, fee 3.5% including insurance. Payments go out on Mondays: finished by Wednesday pays the following Monday, after Wednesday pays the Monday after next.',
        routing: 'ANSWER',
      },
      {
        when: 'Germany',
        then: 'The driver invoices from a template after each trip and the payout lands within one to three days. No Monday cycle, no Truster.',
        routing: 'ANSWER',
      },
    ],
  },
  {
    id: 'mkt-age-limit',
    topic: 'Onboarding',
    triggers: ['Am I old enough?', 'Minimum age', 'Bin ich alt genug?'],
    routing: 'ANSWER',
    answer:
      'Finland and Denmark require at least 19. Germany states at least 18, past the probationary licence period. Confirm the market before answering.',
    market: 'ALL',
    sources: ['WEB_FI', 'WEB_DE', 'WEB_COM'],
  },

  // ------------------------------------------- waiting time, from the Terms
  {
    id: 'pick-waiting-time',
    topic: 'Pickup',
    triggers: [
      'How long do I wait?',
      'Nobody has come out yet',
      'They are keeping me waiting',
    ],
    routing: 'ANSWER',
    answer:
      'There is 45 minutes of free waiting time at pickup or delivery. Beyond that a waiting fee runs at €25 per vehicle per additional half hour on a driven transfer, capped at the empty pickup fee. Tell the driver to log when they arrived.',
    market: 'ALL',
    sources: ['WEB_COM'],
    cautions: [
      'The waiting fee is charged to the customer, not paid to the driver. Never present it as the driver’s compensation.',
    ],
    corners: [
      {
        when: 'The free 45 minutes is nearly up and nothing is happening',
        then: 'Record the arrival time and escalate before the driver leaves. A failed pickup the customer caused — car unavailable, not roadworthy, nobody authorised, missing documents or keys — is an empty pickup, and that is a commercial decision, not the driver’s.',
        routing: 'ESCALATE',
      },
    ],
    escalateTo: 'ops-readiness',
  },

  // --------------------------------- liability boundaries, from the Terms
  {
    id: 'liab-windshield-photo',
    topic: 'Penalties & damage',
    triggers: [
      'There is a crack in the windscreen',
      'Do I photograph the glass?',
      'Chip in the windshield',
    ],
    routing: 'ANSWER',
    answer:
      'Photograph the windscreen clearly at pickup. Bahn is only liable for windscreen damage if the pickup photo clearly shows no crack. If a crack is visible, or the condition cannot be verified from the photos, there is no liability.',
    market: 'ALL',
    sources: ['WEB_COM'],
    cautions: [
      'This is why the photo process carries a penalty. The pickup photo is the liability boundary, not paperwork.',
    ],
  },
  {
    id: 'liab-excluded-damage',
    topic: 'Penalties & damage',
    triggers: ['Stone chip on the way', 'Tyre puncture', 'Scrape underneath'],
    routing: 'ANSWER',
    answer:
      'Underbody damage is excluded entirely, as are mechanical defects, normal wear, stone chips, tyre punctures and minor paint damage. Report it anyway and never guess at who pays.',
    market: 'ALL',
    sources: ['WEB_COM'],
    cautions: [
      'Exclusion from Bahn’s liability to the customer is not the same as the driver being charged. Do not conflate them.',
    ],
    escalateTo: 'ops-shift',
  },
  {
    id: 'liab-caps',
    topic: 'Penalties & damage',
    triggers: ['How much is the car insured for?', 'What is the cover limit?'],
    routing: 'LOOKUP',
    answer:
      'On a transfer-plate move, cover is the lower of market value or €100,000 per vehicle, direct damage only. On a move using the vehicle’s own plates the cap is €5,000 per vehicle regardless of fault. Check which method the gig uses before quoting either.',
    reads: ['orders', 'transport_segments'],
    market: 'ALL',
    sources: ['WEB_COM'],
  },
  {
    id: 'liab-report-deadlines',
    topic: 'Penalties & damage',
    triggers: [
      'They noticed damage after I left',
      'How long can they claim?',
      'A claim came in days later',
    ],
    routing: 'ANSWER',
    answer:
      'Apparent damage has to be noted at delivery. Hidden damage must be reported within 7 days, excluding Sundays and public holidays. A CMR delay claim needs a written reservation within 21 days.',
    market: 'ALL',
    sources: ['WEB_COM'],
    cautions: [
      'A late claim is not automatically void: the deadline does not apply where the damage could not reasonably have been discovered.',
      'Never tell a driver a claim is time-barred. That is a commercial decision.',
    ],
    escalateTo: 'ops-shift',
  },

  // ---------------------------------- unattended delivery, from the Terms
  {
    id: 'del-unattended',
    topic: 'Delivery & handover',
    triggers: [
      'Can I deliver outside opening hours?',
      'Nobody is there, can I just leave it?',
      'Unattended drop',
    ],
    routing: 'LOOKUP',
    answer:
      'Deliveries may happen at any time, including outside business hours. Where keys are deposited according to the recorded instruction for an unattended delivery, responsibility ends at that point — so follow the instruction exactly and photograph the drop.',
    reads: ['order_endpoint_details', 'sites'],
    market: 'ALL',
    sources: ['WEB_COM', 'TRAINING'],
    cautions: [
      'Only a recorded instruction makes an unattended drop safe. Nobody being there is not an instruction.',
    ],
    corners: [
      {
        when: 'No unattended-delivery instruction exists on the order',
        then: 'Do not improvise one. Keep the keys and escalate — inventing a drop point moves the risk onto the driver.',
        routing: 'ESCALATE',
      },
    ],
    escalateTo: 'ops-evidence',
  },

  // --------------------------------------------------------------- Insurance
  {
    id: 'ins-de-programme',
    topic: 'Insurance',
    triggers: [
      'How does the insurance work?',
      'Wie funktioniert die Versicherung?',
      'What do I pay for insurance?',
    ],
    routing: 'ANSWER',
    answer:
      'Bahn arranges transfer insurance through a broker and pays the premium in full. In return 15% of each trip funds the programme, already reflected in the prices shown in the app. No upfront cost and no fixed monthly fee.',
    market: 'DE',
    sources: ['WEB_DE'],
    corners: [
      {
        when: 'The driver is in Finland',
        then: 'Finland has no 15% deduction — insurance is included in the Truster fee of 3.5%. Never quote the German model to a Finnish driver.',
        routing: 'ANSWER',
      },
    ],
  },
  {
    id: 'ins-de-covered',
    topic: 'Insurance',
    triggers: [
      'What is covered?',
      'Was ist versichert?',
      'Am I covered if I cause an accident?',
    ],
    routing: 'ANSWER',
    answer:
      'Liability for damage you cause to others is paid in full and costs you €0. Comprehensive covers damage from your own driving mistakes and vandalism, with your deductible capped at €1,000 per incident. Partial cover handles stone chips, theft, wildlife and marten damage, storm, hail and fire. Roadside assistance and towing are organised and paid Europe-wide.',
    market: 'DE',
    sources: ['WEB_DE'],
    cautions: ['Cover runs from pickup to handover, across Germany.'],
  },
  {
    id: 'ins-de-excluded',
    topic: 'Insurance',
    triggers: [
      'Am I still covered if…',
      'I took a detour',
      'I put the wrong fuel in',
      'I had a passenger',
    ],
    routing: 'ESCALATE',
    answer:
      'Record what happened in the driver’s own words and hand it over. Do not rule on cover.',
    market: 'DE',
    sources: ['WEB_DE'],
    cautions: [
      'Exclusions: driving without a valid licence or under alcohol, drugs or impairing medication at a strict 0.0 limit; private detours or private use, since only the assigned route is covered; passengers, cargo and personal belongings; and pure operating errors without an accident, such as wrong fuel, an overheated clutch or plain tyre damage.',
      'Never tell a driver they are uninsured. State the rule, collect the facts, escalate.',
    ],
    escalateTo: 'ops-shift',
  },
  {
    id: 'ins-de-roadside',
    topic: 'Insurance',
    triggers: ['I need a tow', 'Breakdown assistance', 'Who do I call?'],
    routing: 'ASK',
    answer:
      'Safety and exact location first. Roadside help and towing are organised and paid Europe-wide, but the ops team is called first — the driver should not arrange their own recovery.',
    market: 'DE',
    sources: ['WEB_DE'],
    escalateTo: 'ops-shift',
  },
  {
    id: 'ins-de-evb',
    topic: 'Insurance',
    triggers: [
      'I have no eVB number',
      'eVB Nummer fehlt',
      'I signed the mandate but nothing arrived',
    ],
    routing: 'ANSWER',
    answer:
      'Check the form was actually submitted after signing — the final submit step is easy to miss. If it was, support will chase the insurer. The eVB number is needed for the plate application.',
    market: 'DE',
    sources: ['WEB_DE'],
  },
  {
    id: 'ins-de-min-trips',
    topic: 'Insurance',
    triggers: ['Do I have to drive a minimum?', 'I did not drive this month'],
    routing: 'ANSWER',
    answer:
      'The programme requires at least four trips a month. Below that the driver either returns the plates or covers the monthly premium themselves. The policy runs for one year.',
    market: 'DE',
    sources: ['WEB_DE'],
    cautions: [
      'This is an insurance condition, not an activity target. Finland and Denmark have no such rule — only a request to take a few trips to stay current.',
    ],
  },

  // ------------------------------------------- German onboarding specifics
  {
    id: 'onb-de-rejection',
    topic: 'Onboarding',
    triggers: [
      'Will my record block me?',
      'I have points in Flensburg',
      'Werde ich abgelehnt?',
    ],
    routing: 'ANSWER',
    answer:
      'Red plate applications are generally rejected for police-record entries covering traffic offences such as drunk driving, driving without a licence or hit and run; for vehicle-related property offences such as fraud, handling stolen goods or document forgery; or for more than three points in the Flensburg register.',
    market: 'DE',
    sources: ['WEB_DE'],
    cautions: [
      'This is the registration office’s decision, not Bahn’s. Never predict an outcome for an individual.',
    ],
  },
  {
    id: 'onb-de-costs',
    topic: 'Onboarding',
    triggers: ['What does signing up cost?', 'Do I pay anything upfront?'],
    routing: 'ANSWER',
    answer:
      'Roughly €60–90 for documents and €150–200 for plate registration, under €300 in total, and the €300 signup bonus paid on the first trip covers it. Business registration itself is about €20–40. Ongoing costs are vehicle tax and public transport tickets.',
    market: 'DE',
    sources: ['WEB_DE'],
  },
  {
    id: 'onb-de-webinar',
    topic: 'Onboarding',
    triggers: [
      'Can someone explain the plates to me?',
      'Is there a session I can join?',
    ],
    routing: 'ANSWER',
    answer:
      'There is a free live webinar every Tuesday at 18:00 covering how to become a transfer driver and how to get red plates. Point the driver there rather than explaining the whole plate process in chat.',
    market: 'DE',
    sources: ['WEB_DE'],
  },
  {
    id: 'onb-de-licence-scope',
    topic: 'Onboarding',
    triggers: ['Do I need a special licence for cross-border?'],
    routing: 'ANSWER',
    answer:
      'No special permit is needed. A standard Class B licence covers all current routes. Cross-border trips use a CMR consignment note, stamped at pickup and photographed in the app.',
    market: 'DE',
    sources: ['WEB_DE'],
  },

  // ----------------------------------------------------- support per market
  {
    id: 'sup-channels-by-market',
    topic: 'Support',
    triggers: [
      'Which email do I use?',
      'Who do I write to?',
      'Is there an out-of-hours number?',
    ],
    routing: 'ANSWER',
    answer:
      'In-app chat on weekdays is the main route, with an emergency phone line in the evenings, at night and at weekends. Driver matters go to drivers@bahnexpress.com. German signup and technical problems go to jobs@bahnexpress.de.',
    market: 'ALL',
    sources: ['WEB_FI', 'WEB_DE', 'WEB_COM'],
    cautions: [
      'support@bahnexpress.fi and orders@bahnexpress.com are customer channels, not driver ones. Never send a driver there.',
    ],
  },
]

/** Entries grouped for display, in reading order. */
export function byTopic(): { topic: string; entries: Entry[] }[] {
  return TOPICS.map((topic) => ({
    topic,
    entries: KNOWLEDGE.filter((e) => e.topic === topic),
  })).filter((g) => g.entries.length > 0)
}

export function counts() {
  const r = (x: Routing) => KNOWLEDGE.filter((e) => e.routing === x).length
  return {
    total: KNOWLEDGE.length,
    answer: r('ANSWER'),
    lookup: r('LOOKUP'),
    ask: r('ASK'),
    escalate: r('ESCALATE'),
    corners: KNOWLEDGE.reduce((n, e) => n + (e.corners?.length ?? 0), 0),
    cautions: KNOWLEDGE.reduce((n, e) => n + (e.cautions?.length ?? 0), 0),
  }
}
