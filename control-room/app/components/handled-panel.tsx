// The reassurance column. Small on purpose: it is not a second product, it is
// the answer to "what happened while I wasn't looking".
import { type Dataset } from '../../lib/data'
import { buildHandled } from '../../lib/handled'
import { shortDate } from './bits'

const DECISION: Record<string, { word: string; tone: string }> = {
  APPROVED: { word: 'Approved', tone: 'text-green bg-green/12' },
  EDITED: { word: 'Edited', tone: 'text-blue bg-blue/12' },
  REJECTED: { word: 'Stopped', tone: 'text-red bg-red/12' },
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 py-[5px]">
      <span className="text-[12.5px] text-secondary">{label}</span>
      <span className="ml-auto font-mono text-[12.5px] tabular-nums text-label">
        {value}
      </span>
    </div>
  )
}

export default function HandledPanel({ data }: { data: Dataset }) {
  const { items, summary } = buildHandled(data)
  const reviewed = items.filter((i) => i.tier !== 'autonomous')

  return (
    <div className="rounded-[14px] border border-black/[0.05] bg-card px-[16px] py-[14px] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-secondary">
        Handled by agents
      </p>
      <p className="mt-[9px] font-display text-[22px] font-bold leading-none tracking-[-0.02em] text-label">
        {summary.total}
      </p>
      <p className="mt-[5px] text-[12.5px] leading-[1.45] text-secondary">
        actions since {shortDate(summary.since)}. {summary.autonomous} needed
        nobody.
      </p>

      <div className="mt-[13px] border-t border-black/[0.06] pt-[6px]">
        <Stat label="Without a person" value={String(summary.autonomous)} />
        <Stat label="After your approval" value={String(summary.approved)} />
        <Stat label="Stopped by you" value={String(summary.stopped)} />
        <Stat label="Fees priced" value={summary.feeTotal} />
      </div>

      <p className="mt-[15px] text-[11px] font-semibold uppercase tracking-[0.07em] text-secondary">
        A person ruled on these
      </p>
      <ul className="mt-[9px] flex flex-col gap-[13px]">
        {reviewed.map((item) => {
          const d = item.decision ? DECISION[item.decision] : null
          return (
            <li key={item.id}>
              <div className="flex items-center gap-2">
                {d ? (
                  <span
                    className={`rounded px-[6px] py-[1px] text-[11px] font-semibold ${d.tone}`}
                  >
                    {d.word}
                  </span>
                ) : null}
                <span className="ml-auto font-mono text-[11px] tabular-nums text-tertiary">
                  {shortDate(item.at)}
                </span>
              </div>
              <p className="mt-[5px] text-[12.5px] font-medium leading-[1.35] text-label">
                {item.action}
              </p>
              {item.note ? (
                <p className="mt-[3px] line-clamp-2 text-[12px] leading-[1.4] text-secondary">
                  {item.note}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>

      <p className="mt-[15px] border-t border-black/[0.06] pt-[11px] text-[11.5px] leading-[1.5] text-tertiary">
        The dispatch agent prices and publishes offers under a policy a person
        approved. No agent moved a delivery date or wrote to a customer.
      </p>
    </div>
  )
}
