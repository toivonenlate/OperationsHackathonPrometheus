// Action required — the cases whose records cannot settle themselves.
//
// There is deliberately no view of all hundred orders. The value of this screen
// is the ninety it does not show.
import { SNAPSHOT_AT, load } from '../lib/data'
import { type Case, type Fact, type Tone, ago, buildCases } from '../lib/cases'
import HandledPanel from './components/handled-panel'
import { Chevron, Code } from './components/bits'

/** Below this, the records have something open but nothing genuinely unsettled. */
const HARD_ENOUGH = 11

/* ---------- icons: SF Symbols geometry, drawn inline ---------- */

function WarningIcon() {
  return (
    <svg className="size-[13px]" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 2.1 12.7 11.9H1.3Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M7 5.6v2.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="7" cy="10.4" r="0.75" fill="currentColor" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="size-[13px]" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7 4.1V7l2.2 1.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg className="size-[13px]" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 6.3v3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="7" cy="4.3" r="0.75" fill="currentColor" />
    </svg>
  )
}

/* ---------- card ---------- */

const TONE: Record<
  Tone,
  { text: string; fill: string; Icon: () => React.ReactElement }
> = {
  critical: { text: 'text-red', fill: 'bg-red/12', Icon: WarningIcon },
  pending: { text: 'text-amber', fill: 'bg-amber/12', Icon: ClockIcon },
  info: { text: 'text-blue', fill: 'bg-blue/12', Icon: InfoIcon },
}

function Badge({ tone, children }: { tone: Tone; children: string }) {
  const { text, fill, Icon } = TONE[tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[12px] font-semibold tracking-[-0.004em] ${text} ${fill}`}
    >
      <Icon />
      {children}
    </span>
  )
}

function FactValue({ fact }: { fact: Fact }) {
  if (!fact.mono) {
    return <span className="text-[13px] text-label">{fact.value}</span>
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {fact.value.split(/\s{2,}|\s(?=CD-)/).map((part) => (
        <Code key={part}>{part}</Code>
      ))}
    </span>
  )
}

function CaseCard({ item }: { item: Case }) {
  const clock = ago(item.oldestAt)
  return (
    <li className="rounded-[14px] border border-black/[0.05] bg-card px-[18px] pt-[14px] pb-[13px] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3">
        <Badge tone={item.tone}>{item.badge}</Badge>
        {clock ? (
          <span className="ml-auto font-mono text-[11.5px] tabular-nums text-secondary">
            {clock}
          </span>
        ) : null}
      </div>

      <h2 className="mt-[13px] font-display text-[17px] font-semibold leading-tight tracking-[-0.015em] text-label">
        {item.title}
      </h2>
      <p className="mt-[1px] text-[12.5px] text-secondary">{item.subtitle}</p>

      <p className="mt-[9px] text-[13.5px] leading-[1.45] text-label">{item.brief}</p>

      <dl className="mt-[13px] border-t border-black/[0.05]">
        {item.facts.map((fact) => (
          <div
            key={fact.label}
            className="flex gap-4 border-b border-black/[0.04] py-[7px] last:border-b-0"
          >
            <dt className="w-[84px] shrink-0 text-[12.5px] text-secondary">
              {fact.label}
            </dt>
            <dd className="min-w-0 flex-1">
              <FactValue fact={fact} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-[11px] flex items-center justify-between">
        <span className="text-[11.5px] text-secondary">
          {item.otherSignals > 0
            ? `+${item.otherSignals} other signal${item.otherSignals === 1 ? '' : 's'}`
            : ' '}
        </span>
        <button
          type="button"
          className="-mr-1 inline-flex items-center gap-[5px] rounded-md px-1 py-[3px] text-[13.5px] font-medium text-blue transition-colors hover:bg-blue/8 active:opacity-60"
        >
          {item.action}
          <Chevron />
        </button>
      </div>
    </li>
  )
}

/* ---------- page ---------- */

export default function Page() {
  const data = load()
  const cases = buildCases(data)
  const hard = cases.filter((c) => c.score >= HARD_ENOUGH)
  const softer = cases.length - hard.length

  const snapshot = SNAPSHOT_AT.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })

  return (
    <main className="min-h-screen bg-canvas">
      <div className="border-b border-black/[0.06]">
        <div className="mx-auto flex max-w-[1020px] items-center px-5 py-[11px]">
          <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-label">
            Bahn<span className="text-secondary">OS</span>
          </span>
          <span className="ml-auto font-mono text-[11.5px] text-tertiary">
            {snapshot} UTC
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[1020px] px-5 pt-9 pb-24">
        <header>
          <h1 className="font-display text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-label">
            Action required
          </h1>
          <p className="mt-[7px] text-[14px] text-secondary">
            {hard.length} of {cases.length} open cases need a person.
          </p>
        </header>

        <div className="mt-7 grid items-start gap-6 lg:grid-cols-[1fr_292px]">
          <div>
            <ul className="flex flex-col gap-[11px]">
              {hard.map((item) => (
                <CaseCard key={item.key} item={item} />
              ))}
            </ul>

            {softer > 0 ? (
              <p className="mt-[18px] px-[2px] text-[12.5px] leading-[1.5] text-secondary">
                <span className="font-medium text-label">
                  {softer} cases are open and owned.
                </span>{' '}
                Their records say what happens next, so they are not here.
              </p>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-6">
            <HandledPanel data={data} />
          </aside>
        </div>

        <p className="mt-10 text-[11.5px] leading-[1.6] text-tertiary">
          Ranked by what the records cannot settle, not by severity.
          Deterministic, no model inference.
        </p>
      </div>
    </main>
  )
}
