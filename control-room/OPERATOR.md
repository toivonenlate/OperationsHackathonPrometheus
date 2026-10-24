# The operator

Who BahnOS is for, what they are trying to get done, and what would make them
stop using it.

Everything here is sourced: Bahn's own job ads, their driver and carrier sites,
and the challenge dataset. The persona is a composite of the roles Bahn
advertises — not a real employee. Dataset people are fictional.

---

## 1. Who they actually are

Bahn calls the role **Operations Associate**. The Helsinki ad asks for
**0–2 years of experience, "preferred but not mandatory."** The Berlin opening
is a **working student at ~20 hours a week**. Requirements are English, German
C1+ for Berlin, "solutions-oriented," "comfortable under pressure," on-site.

So the person reading this screen is likely 23, three weeks in, possibly
part-time, in their second or third language, sitting in an office in Helsinki,
Copenhagen or Berlin.

And the ask of them has been escalating while the experience bar has not:

| ~Oct 2025 · Ops Coordinator | ~Mar 2026 · Ops Associate | ~Jun 2026 · Ops Associate |
| --- | --- | --- |
| "coordinate day-to-day", "bridge communications between Finnish HQ and German operations" | "take full responsibility for assigned logistics flows", "act decisively when challenges arise" | "**own a part of our operation and help it scale**", "**spot inefficiencies and fix them**" |

Still 0–2 years, all three times.

**That gap is the product.** Bahn is asking juniors to own a slice of an
operation that went from €150k to over €1M monthly revenue in eighteen months.
Nobody can hire judgement that fast, so the judgement has to live somewhere
other than in people's heads.

## 2. Their day, in their employer's words

Near-verbatim and consistent across the Helsinki, Berlin and Copenhagen ads:

- coordinate daily transports between drivers, customers and central ops
- **provide real-time support to drivers** — route issues, scheduling, problem-solving
- monitor delivery and execution quality
- communicate **by phone, email and chat**, with both sides
- troubleshoot bottlenecks and find fast, practical solutions
- recruit and onboard freelance drivers locally
- **improve processes, strategy, workflows and tools**
- work with the Ops Lead and the HQ team

Two things follow. **Driver support is named in every single ad** — it is not a
side duty. And *improving the tools* is explicitly their job, which means BahnOS
should expect to be adjusted by the person using it, not just used.

## 3. The eleven hats

The dataset models eleven desks:

`ops-intake` · `ops-readiness` · `ops-planning` · `ops-dispatch` ·
`ops-import` · `ops-travel` · `ops-shift` · `ops-support` · `ops-evidence` ·
`ops-finance` · `ops-expenses`

Bahn has roughly 30 people across three countries. **There are not eleven
teams.** One associate wears most of these before lunch, and the data agrees —
only four desks review any proposal, and `ops-shift` takes the hard ones.

Design consequence: a desk is a **routing tag on a case**, never a separate
inbox. Eleven lanes would rebuild the "system of forms, and more forms" that
Bahn's own brief says they are running away from.

## 4. What they are actually afraid of

Not volume. **Saying something that turns out not to be true.**

Every operator reply in the dataset is the same move — refusing to let a claim
become a fact:

> "Die Genehmigung bestätigt noch keine Auszahlung." *(approval is not yet payout)*
> "The driver has not cancelled."
> "Photos establish a reported condition, not when or by whom it happened."
> "Vehicle presence is not pickup authority."
> "Nothing is reserved for you; the live offer must be booked in the app."
> "Do not represent the replacement as booked."
> "Resolve only the connectivity gap. Keep boarding unconfirmed."

A veteran has those reflexes. A working student in week three does not — and the
consequences are real money: a stranger holding keys to a Bentley, a car taken
without release authority, a second ferry booked because nobody checked whether
the first one actually failed, a driver told their €35.50 is on its way when no
payout ledger exists.

## 5. What they want to do in BahnOS

Ranked by how often it comes up.

### 5.1 Find out whether anything needs me — in one glance

> *When I sit down, I want to know whether anything needs me, so I can stop
> scanning and start deciding.*

They do not want a board of 100 orders. They want the handful the records cannot
settle, hardest first, and an honest statement that the rest are fine. The value
is the 90 cases the screen refuses to show.

**Today:** the queue shows 10 of 35, ranked, with "the other N are open and
owned" underneath.

### 5.2 Understand a case without becoming a detective

> *When I open a case, I want what is wrong and what to do, without reading
> eleven records.*

They have minutes, not an afternoon. The issue, the impact, the vitals, the
recommended move. Evidence available but folded.

**Today:** banner with issue and impact, a six-field vitals grid, then
proposals. Evidence behind one line.

### 5.3 Send the right reply without knowing the rule by heart

> *When a driver asks me something, I want the answer and the trap, so I do not
> have to already know that approved is not paid.*

This is the big one for a junior. They should not have to remember that Finnish
and German return-travel rules differ, that DKK cannot be converted, that a
`payer: BAHN` cost is not the driver's claim.

**Today:** 80 answer-book entries, each with a routing, its cautions and its
corner cases; proposals cite the entry they came from.

### 5.4 See what the agent already did, and trust it

> *When the agent has been working while I was away, I want to see what it said
> and what a person stopped, so I am not anxious about it.*

Reassurance is a feature. The panel's job is to be *ignorable* — numbers
visible, individual entries folded.

**Today:** 91 agent actions, 86 that needed nobody, and the four a person edited
or stopped before they ran.

### 5.5 Approve, amend, or refuse — and see exactly what will change

> *Before I say yes, I want to know what this writes and what it leaves alone.*

The dataset shows **3 of 4 executed proposals were EDITED, not approved as
proposed**. Amending is the normal case, not the exception, so Edit must be as
prominent as Approve.

**Today:** every proposal carries Changes / Does not / Decided by, its citations
and its withheld list, with one button per action.

### 5.6 Know that nothing I asked for has been forgotten

> *When I or the agent asked somebody a question, I want it to come back if
> nobody answers.*

Their biggest silent failure is a thread waiting on an outside party that nobody
revisits. The dataset already models this with `waiting_on` and `next_check_at`.

**Today: not built.** An unanswered question does not yet resurface. This is the
most valuable missing feature.

### 5.7 Hand over cleanly at the end of a shift

> *When I go home, I want the next person to know what is open and what is
> waiting, without me writing it out.*

The ads mention no shift pattern at all, yet orders arrive at weekends and cars
keep moving overnight. **Today: not built.**

### 5.8 Answer a driver in a language I do not speak

> *When a German driver writes in, I want to reply correctly without German C1.*

Language is a live hiring constraint — the Coordinator ad required Finnish *and*
German *and* English. An agent that comprehends and drafts in the driver's
language removes a limit on who Bahn can hire.

**Today:** partial. The language is detected and shown; the reply text is not
yet generated in it.

## 6. Anti-goals

Things they do **not** want, and that would make them stop using it:

- **A second place to check.** If BahnOS becomes another tab beside the portal
  and Slack, it has failed. It must absorb threads, not add a store.
- **Silent state changes.** Nothing moves unless they act.
- **Losing the case when they say no.** Rejecting the agent must keep the
  history. Bahn's own starter says so.
- **A dashboard.** Counts and charts are not decisions.
- **Being told something confidently wrong.** One hallucinated payout date
  destroys more trust than ten escalations.
- **Needless escalation.** A tool that asks about everything is as useless as
  one that asks about nothing.
- **Anything resolvable without the record changing.** No "Mark resolved" that
  only hides a row.

## 7. The trust ladder

They will not hand over judgement on day one, and should not have to.

1. **Shadow** — agent proposes, person decides every time, system measures agreement.
2. **Cheap work unsupervised** — asking a driver a clarifying question needs no
   approval, because asking is free and reversible. *(Bahn's brief says so.)*
3. **Routine replies unsupervised** — policy answers with no order attached.
4. **Record-based replies unsupervised**, once measured agreement is high enough.
5. **Never unsupervised:** money, dates, bookings, anything a customer sees, any
   authority question. *(Also Bahn's rule.)*

Autonomy should be **earned by measured agreement and visible**, not set by a
slider.

## 8. How we would know it is working

| Measure | Why it matters to them |
| --- | --- |
| Cases needing a person, per 100 orders | The queue should shrink as the agent learns |
| Time from case appearing to decision | Their actual job; a car not moving costs Bahn |
| How often they open the evidence fold | If they must, the card failed |
| Missed escalations | The dangerous error |
| Needless escalations | The error that makes them quietly stop using it |
| Share of agent drafts sent unedited | Rising means trust is being earned |
| Threads resurfaced before anyone chased | Proof nothing falls through |

## 9. Where BahnOS fails them today

Said plainly, so nobody discovers it in the demo:

- **Nothing resurfaces.** `waiting_on` is in the data and unused. §5.6 is the
  biggest hole.
- **No shift handover.** §5.7.
- **Replies are not generated in the driver's language.** §5.8.
- **The proposal engine is keyword-matched**, not a model. It is deliberately
  conservative — two overlapping terms minimum, because a confidently wrong
  answer is worse than none — but it will miss paraphrases a model would catch.
- **Buttons do not write anything yet.** Approve, Edit and Send are inert.
- **`ownerless` may be an artefact.** 8 of 19 alerts simply have no owner field,
  so that signal is on the lowest weight until somebody checks whether it means
  anything.

---

### Sources

Bahn Express job ads on LinkedIn (Operations Associate, Helsinki, ~Jun 2026 and
~Mar 2026; Operations Coordinator, Helsinki, ~Oct 2025), The Hub (Operations
Associate, Copenhagen), BerlinStartupJobs (Working Student, Operations);
`bahnexpress.fi/kuljettajat`, `bahnexpress.de/fahrer/faq`,
`bahnexpress.com/drivers`, `bahnexpress.com/terms`, `bahnexpress.dk/chauffører`;
and the challenge packet's `PARTICIPANT-BRIEF.md`, `OPERATIONS-CONTEXT.md`,
`dataset/SCHEMA.md` and snapshot.
