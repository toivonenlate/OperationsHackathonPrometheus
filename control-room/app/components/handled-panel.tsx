// The reassurance column. Small on purpose: it is not a second product, it is
// the answer to "what happened while I wasn't looking".
import { type Dataset } from '../../lib/data'
import { buildHandled } from '../../lib/handled'
import { Chevron, shortDate } from './bits'
import { Icon, type IconName } from './icons'

const DECISION: Record<string, { word: string; tone: string; icon: IconName }> = {
  APPROVED: { word: 'Approved', tone: 'text-green bg-green/12', icon: 'confirmed' },
  EDITED: { word: 'Edited', tone: 'text-teal bg-teal/12', icon: 'document' },
  REJECTED: { word: 'Stopped', tone: 'text-red bg-red/12', icon: 'blocked' },
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: string
  icon: IconName
  tone: string
}) {
  return (
    <div className="flex items-center gap-[7px] py-[5px]">
      <Icon name={icon} size={13} className={tone} />
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
    <div className="rounded-[14px] border border-hair bg-card px-[16px] py-[14px] shadow-[0_1px_2px_rgba(66,61,51,0.04),0_2px_10px_rgba(66,61,51,0.05)]">
      <p className="flex items-center gap-[6px] text-[12px] font-semibold tracking-[-0.005em] text-secondary">
        <Icon name="agent" size={13} className="text-teal" />
        Handled by BahnBot
      </p>
      <p className="mt-[9px] font-display text-[22px] font-bold leading-none tracking-[-0.02em] text-label">
        {summary.total}
      </p>
      <p className="mt-[5px] text-[12.5px] leading-[1.45] text-secondary">
        actions closed since {shortDate(summary.since)}. {summary.autonomous}{' '}
        needed nobody.
      </p>

      <div className="mt-[13px] border-t border-hair pt-[6px]">
        <Stat label="BahnBot resolved" value={String(summary.autonomous)} icon="agent" tone="text-green" />
        <Stat label="Human approved" value={String(summary.approved)} icon="confirmed" tone="text-teal" />
        <Stat label="Human stopped" value={String(summary.stopped)} icon="blocked" tone="text-red" />
        <Stat label="Fees priced" value={summary.feeTotal} icon="euro" tone="text-secondary" />
      </div>

      {/* Collapsed by default: the numbers above are the reassurance, the
          individual log entries are only there if somebody wants to check. */}
      <details className="group mt-[15px]">
        <summary className="flex cursor-pointer list-none items-center gap-[5px] text-[12px] font-semibold tracking-[-0.005em] text-secondary [&::-webkit-details-marker]:hidden">
          A human decided {reviewed.length}
          <Chevron className="text-teal transition-transform group-open:rotate-90" />
        </summary>
        <ul className="mt-[9px] flex flex-col gap-[13px]">
        {reviewed.map((item) => {
          const d = item.decision ? DECISION[item.decision] : null
          return (
            <li key={item.id}>
              <div className="flex items-center gap-2">
                {d ? (
                  <span
                    className={`inline-flex items-center gap-[4px] rounded px-[6px] py-[1px] text-[11px] font-semibold ${d.tone}`}
                  >
                    <Icon name={d.icon} size={11} />
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
      </details>

      <p className="mt-[15px] border-t border-hair pt-[11px] text-[11.5px] leading-[1.5] text-tertiary">
        BahnBot prices and publishes offers under a policy a human approved. It
        has not moved a delivery date or written to a customer.
      </p>
    </div>
  )
}
