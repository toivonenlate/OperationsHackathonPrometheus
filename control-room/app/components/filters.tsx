// Two scopes, because a case is either waiting on a human or it is resolved.
// Links rather than state, so a view is shareable and survives a reload.
import Link from 'next/link'
import { Icon, type IconName } from './icons'

export type Scope = 'needs' | 'resolved'
export type Decider = 'all' | 'bot' | 'human'

function Pill({
  href,
  label,
  icon,
  count,
  active,
  small = false,
}: {
  href: string
  label: string
  icon?: IconName
  count?: number
  active: boolean
  small?: boolean
}) {
  return (
    <Link
      href={href}
      className={
        'inline-flex items-center gap-[6px] rounded-full border transition-colors ' +
        (small ? 'px-[10px] py-[3px] text-[12px] ' : 'px-[13px] py-[5px] text-[13px] ') +
        (active
          ? 'border-label bg-label font-semibold text-birch'
          : 'border-sand/70 bg-card font-medium text-label hover:bg-hair/60')
      }
    >
      {icon ? <Icon name={icon} size={small ? 12 : 13} /> : null}
      {label}
      {count !== undefined ? (
        <span
          className={
            'font-mono tabular-nums ' + (active ? 'text-birch/70' : 'text-tertiary')
          }
        >
          {count}
        </span>
      ) : null}
    </Link>
  )
}

export default function Filters({
  scope,
  decider,
  counts,
}: {
  scope: Scope
  decider: Decider
  counts: { needs: number; resolved: number; bot: number; human: number }
}) {
  const q = (s: Scope, d?: Decider) =>
    `/cases?show=${s}${d && d !== 'all' ? `&by=${d}` : ''}`

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex flex-wrap gap-[6px]">
        <Pill
          href={q('needs')}
          label="Needs a human"
          icon="warning"
          count={counts.needs}
          active={scope === 'needs'}
        />
        <Pill
          href={q('resolved')}
          label="Resolved"
          icon="confirmed"
          count={counts.resolved}
          active={scope === 'resolved'}
        />
      </div>

      {scope === 'resolved' ? (
        <div className="flex flex-wrap items-center gap-[6px]">
          <span className="mr-[2px] text-[12px] text-secondary">Decided by</span>
          <Pill href={q('resolved')} label="All" count={counts.resolved} active={decider === 'all'} />
          <Pill
            href={q('resolved', 'bot')}
            label="BahnBot resolved"
            icon="agent"
            count={counts.bot}
            active={decider === 'bot'}
            small
          />
          <Pill
            href={q('resolved', 'human')}
            label="Human decided"
            icon="person"
            count={counts.human}
            active={decider === 'human'}
            small
          />
        </div>
      ) : null}
    </div>
  )
}
