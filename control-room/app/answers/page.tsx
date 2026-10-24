// The answer book.
//
// Not an FAQ. Every entry says whether the bot may answer at all — and when it
// may not, what it does instead. The four routings are the product: anything
// the bot can close alone never reaches an operator, and anything touching
// money, dates, authority or safety always does.
import {
  type Entry,
  type Routing,
  KNOWLEDGE,
  byTopic,
  counts,
} from '../../lib/knowledge'
import Shell from '../components/shell'
import { Chevron, Code } from '../components/bits'
import { Icon } from '../components/icons'
import { ROUTING_ICON, topicIcon } from '../components/glyphs'

const ROUTING: Record<
  Routing,
  { label: string; blurb: string; tone: string }
> = {
  ANSWER: {
    label: 'Answers alone',
    blurb: 'Pure policy. No records, no approval, no person.',
    tone: 'text-green bg-green/12',
  },
  LOOKUP: {
    label: 'Reads the records',
    blurb: 'States what the records establish, hedges everything else.',
    tone: 'text-teal bg-teal/12',
  },
  ASK: {
    label: 'Asks first',
    blurb: 'One cheap question before anything else. Asking is free.',
    tone: 'text-amber bg-amber/12',
  },
  ESCALATE: {
    label: 'A person decides',
    blurb: 'Money, dates, authority or safety. Always a human.',
    tone: 'text-red bg-red/12',
  },
}

const CARD =
  'rounded-[14px] border border-hair bg-card shadow-[0_1px_2px_rgba(66,61,51,0.04),0_2px_10px_rgba(66,61,51,0.05)]'

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const SOURCE_LABEL: Record<string, string> = {
  TRAINING: 'training videos',
  WEB_FI: 'bahnexpress.fi',
  WEB_DE: 'bahnexpress.de',
  WEB_COM: 'bahnexpress.com',
  DATASET: 'dataset rules',
}

function Badge({ routing }: { routing: Routing }) {
  const r = ROUTING[routing]
  return (
    <span
      className={`inline-flex items-center gap-[5px] rounded-md px-2 py-[3px] text-[11.5px] font-semibold ${r.tone}`}
    >
      <Icon name={ROUTING_ICON[routing]} size={13} />
      {r.label}
    </span>
  )
}

function EntryCard({ entry }: { entry: Entry }) {
  return (
    <li className="rounded-[14px] border border-hair bg-card px-[18px] pt-[13px] pb-[14px] shadow-[0_1px_2px_rgba(66,61,51,0.04),0_2px_10px_rgba(66,61,51,0.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge routing={entry.routing} />
        {entry.market !== 'ALL' ? (
          <span className="inline-flex items-center gap-[4px] rounded bg-hair px-[6px] py-[1px] text-[11px] font-semibold text-secondary">
            <Icon name="globe" size={11} />
            {entry.market} only
          </span>
        ) : null}
        {entry.escalateTo ? (
          <span className="inline-flex items-center gap-[5px] text-[11.5px] text-secondary">
            <Icon name="arrow-right" size={12} />
            <Code>{entry.escalateTo}</Code>
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[10.5px] text-tertiary">
          {entry.id}
        </span>
      </div>

      <ul className="mt-[11px] flex flex-col gap-[2px]">
        {entry.triggers.map((t) => (
          <li key={t} className="text-[13px] italic leading-[1.4] text-secondary">
            “{t}”
          </li>
        ))}
      </ul>

      <p className="mt-[9px] text-[13.5px] leading-[1.5] text-label">{entry.answer}</p>

      {entry.reads?.length ? (
        <p className="mt-[9px] flex flex-wrap items-center gap-[5px] text-[11.5px] text-secondary">
          <Icon name="search" size={12} />
          Reads
          {entry.reads.map((r) => (
            <Code key={r}>{r}</Code>
          ))}
        </p>
      ) : null}

      {entry.cautions?.length ? (
        <ul className="mt-[11px] flex flex-col gap-[4px]">
          {entry.cautions.map((c) => (
            <li key={c} className="flex gap-2 text-[12.5px] leading-[1.45] text-amber">
              <Icon name="warning" size={13} className="mt-[2px]" />
              {c}
            </li>
          ))}
        </ul>
      ) : null}

      {entry.corners?.length ? (
        <details className="group mt-[11px] border-t border-hair pt-[10px]">
          <summary className="flex cursor-pointer list-none items-center gap-[5px] text-[12px] font-semibold tracking-[-0.005em] text-secondary [&::-webkit-details-marker]:hidden">
            {entry.corners.length} corner case
            {entry.corners.length === 1 ? '' : 's'}
            <Chevron className="text-teal transition-transform group-open:rotate-90" />
          </summary>
          <ul className="mt-[9px] flex flex-col gap-[11px]">
            {entry.corners.map((c) => (
              <li key={c.when} className="rounded-[10px] bg-canvas px-[12px] py-[10px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11.5px] font-semibold tracking-[-0.005em] text-tertiary">
                    If
                  </span>
                  <Badge routing={c.routing} />
                </div>
                <p className="mt-[5px] text-[13px] leading-[1.45] text-label">
                  {c.when}
                </p>
                <p className="mt-[7px] text-[13px] leading-[1.45] text-secondary">
                  <span className="font-semibold text-label">Then</span> {c.then}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="mt-[11px] flex items-center gap-[5px] text-[11px] text-tertiary">
        <Icon name="document" size={11} />
        {entry.sources.map((s) => SOURCE_LABEL[s] ?? s).join(' · ')}
      </p>
    </li>
  )
}

export default function AnswersPage() {
  const c = counts()
  const groups = byTopic()
  const routings: Routing[] = ['ANSWER', 'LOOKUP', 'ASK', 'ESCALATE']
  const n: Record<Routing, number> = {
    ANSWER: c.answer,
    LOOKUP: c.lookup,
    ASK: c.ask,
    ESCALATE: c.escalate,
  }

  return (
    <Shell active="answers">
      <header>
        <h1 className="font-display text-[29px] font-bold leading-[1.1] tracking-[-0.025em] text-label">
          Answer book
        </h1>
        <p className="mt-[7px] max-w-[62ch] text-[14px] leading-[1.5] text-secondary">
          {c.total} driver questions, each with the one thing that matters:
          whether the bot may answer it. {c.corners} corner cases where the plain
          answer becomes wrong, and {c.cautions} things it must never assert.
        </p>
      </header>

      <section className="mt-6 grid gap-[9px] sm:grid-cols-2">
        {routings.map((r) => (
          <div key={r} className={`${CARD} px-[15px] py-[13px]`}>
            <div className="flex items-baseline gap-2">
              <Badge routing={r} />
              <span className="ml-auto font-mono text-[17px] font-semibold tabular-nums text-label">
                {n[r]}
              </span>
            </div>
            <p className="mt-[7px] text-[12.5px] leading-[1.4] text-secondary">
              {ROUTING[r].blurb}
            </p>
          </div>
        ))}
      </section>

      <p className="mt-[18px] rounded-[14px] border border-hair bg-canvas px-[16px] py-[13px] text-[12.5px] leading-[1.5] text-secondary">
        <span className="font-medium text-label">
          {n.ANSWER + n.LOOKUP} of {c.total} never need an operator.
        </span>{' '}
        Market matters: Finland, Germany and Denmark do not share plate rules,
        insurance models or reimbursement scope, so an entry marked for one
        market must not be answered for a driver in another.
      </p>

      {/* topic index, so this is not one long scroll */}
      <nav className="mt-[18px] flex flex-wrap gap-[6px]">
        {groups.map((g) => (
          <a
            key={g.topic}
            href={`#${slug(g.topic)}`}
            className="inline-flex items-center gap-[5px] rounded-full border border-sand/70 bg-card px-[10px] py-[4px] text-[12.5px] font-medium text-label transition-colors hover:bg-hair/70"
          >
            <Icon name={topicIcon(g.topic)} size={13} className="text-secondary" />
            {g.topic}
            <span className="font-mono text-[11px] tabular-nums text-tertiary">
              {g.entries.length}
            </span>
          </a>
        ))}
      </nav>

      {groups.map((g) => (
        <section key={g.topic} id={slug(g.topic)} className="mt-9 scroll-mt-[64px]">
          <h2 className="mb-[9px] flex items-center gap-[6px] px-[2px] text-[12px] font-semibold tracking-[-0.005em] text-secondary">
            <Icon name={topicIcon(g.topic)} size={14} />
            {g.topic}
            <span className="font-normal text-tertiary">
              {g.entries.length}
            </span>
          </h2>
          <ul className="flex flex-col gap-[11px]">
            {g.entries.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-10 text-[11.5px] leading-[1.6] text-tertiary">
        Compiled from Bahn&apos;s driver training materials, bahnexpress.fi,
        bahnexpress.de and the challenge dataset&apos;s own evidence rules.
        Policy figures come from Bahn&apos;s real published guidance; the order
        facts a reply is built on always come from the records.
      </p>
    </Shell>
  )
}
