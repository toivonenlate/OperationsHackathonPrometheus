# BahnOS

One screen. The car deliveries whose records cannot settle themselves on the
left, everything the agents already handled on the right.

Bahn's operational risk is overclaiming: treating a claim as a fact. A quote is
not a booking, a plan is not a position, an approved expense is not a payment,
and a car standing in a yard is not a car anyone may release. Operations
associates are hired at nought to two years' experience and asked to own a
slice of the operation. This screen is for them.

## Run it

Needs Node 24 or newer. No database and no Docker.

```sh
cd control-room
npm install
npm run dev        # http://localhost:3100
```

The snapshot is read straight from `../dataset/data/*.jsonl` at request time, so
**clone the whole repository**, not just this folder. Point `DATASET_DIR`
elsewhere to run against modified data.

```sh
npm run cases      # the ranked list in the terminal, no browser
npm run typecheck
npm run build
```

## How it is put together

| File | What it does |
| --- | --- |
| `lib/data.ts` | Typed JSONL loader, memoised. `loadLog()` is separate because the event log is large. |
| `lib/detect.ts` | The eleven detectors. **Start here.** Plain functions over the snapshot; no model. |
| `lib/cases.ts` | Subject merging, scoring, the badge, the action verb, the fact rows. |
| `lib/handled.ts` | What the agents actually did, from the event log and the proposal reviews. |
| `app/page.tsx` | The screen. Cards left, `HandledPanel` right. |
| `app/components/` | `handled-panel.tsx`, `bits.tsx` (code chips, dates). |

Styling is Tailwind v4 with Apple system tokens in `app/globals.css`. SF Pro
cannot be served as a webfont, so the `-apple-system` stack is used: it resolves
to real SF Pro on macOS and SF Mono for the code chips.

## What makes a case hard

Hard is not urgent, not severe, and not "has an alert". The packet's own starter
flags 43 of 100 orders because it counts open records. This counts what the
records **cannot settle**:

| Signature | Meaning |
| --- | --- |
| `unknown-outcome` | An action was attempted and nobody knows whether it worked. |
| `needs-human` | The incident record itself says a person must decide. |
| `person-multiplexing` | It is about a driver, not a car, so it spans orders. |
| `split-across-systems` | No single page holds the case. |
| `cannot-be-filed` | A message arrived that cannot be linked to a car. |
| `authority-gap` | Something must happen and no record says who may permit it. |
| `unapproved-promise` | A delivery promise set by SYSTEM or OPS, never agreed with the customer. |
| `rejected-evidence` | Evidence was submitted, refused, and not replaced. |
| `stale-signal` | Car moving, app quiet, promise still standing. |
| `custody-open` | A tracked key set with no recorded release. |
| `ownerless` | Open, with nobody's name on it. |

Nothing on the screen is model output, so the ranking is deterministic and
reproducible. A language model's job starts after this screen.

## Two rules in the ranking

**The subject is the person when the hardness is about a person.** If a driver
holds three cars, their orders' findings belong on their card, not scattered
across three car cards. Eight of 56 drivers hold two or three live duties, and
they account for most of the hard driver-support cases in the snapshot.

**The worst single thing dominates.** Hardness is set by the thing you least
know how to resolve, so the top signature is weighted triple and a pile-up of
*different* kinds adds a little on top. Five small doubts should not outrank one
unknowable outcome.

Weights live in one constant, `WEIGHT` in `lib/detect.ts`.

## Known soft spots

- `ownerless` fires eight times, and eight of 19 alerts simply have no owner
  field, so it may be an artefact of how the data was generated. Lowest weight
  until that is settled.
- `HARD_ENOUGH` in `app/page.tsx` is the fold, at score 11. It is a guess.
- Card copy is composed from templates in `lib/cases.ts`, not written by a
  model. Accurate but plain.
- The failed ferry booking on `CD-420299` appears only on the left. An operator
  looking for "what happened to that booking" would reasonably check the right.

Everything in the dataset is fictional.
