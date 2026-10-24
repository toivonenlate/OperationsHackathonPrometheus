// The queue. One glance: what is wrong, and what to do about it.
//
// The fact rows that used to sit on each card moved to the case page. What sits
// here instead is the proposed action, because a list that only tells you what
// is broken still leaves you to work out the move.
import Link from 'next/link'
import { load } from '../../lib/data'
import { type Case, type Tone, ago, buildCases } from '../../lib/cases'
import { type Approval, proposeFor } from '../../lib/propose'
import { detect } from '../../lib/detect'
import { buildHandled } from '../../lib/handled'
import Shell from '../components/shell'
import HandledPanel from '../components/handled-panel'
import Filters, { type Decider, type Scope } from '../components/filters'
import HandledCard from '../components/handled-card'
import { deskName } from '../../lib/labels'
import { Chevron } from '../components/bits'
import { Icon, type IconName } from '../components/icons'
import { badgeIcon } from '../components/glyphs'

/** Below this, the records have something open but nothing genuinely unsettled. */
const HARD_ENOUGH = 11

// The colour says how bad; the icon in the badge says what kind of trouble.
const TONE: Record<Tone, { text: string; fill: string }> = {
  critical: { text: 'text-red', fill: 'bg-red/12' },
  pending: { text: 'text-orange', fill: 'bg-orange/12' },
  info: { text: 'text-teal', fill: 'bg-teal/12' },
}

const WHO: Record<Approval, { label: string; tone: string; icon: IconName }> = {
  AGENT_SENDS: { label: 'BahnBot sends', tone: 'text-teal', icon: 'agent' },
  NEEDS_APPROVAL: { label: 'Needs approval', tone: 'text-orange', icon: 'shield' },
  NEEDS_PERSON: { label: 'Needs a human', tone: 'text-red', icon: 'person' },
}

function CaseCard({
  item,
  rank,
  next,
}: {
  item: Case
  rank: number
  next: { title: string; approval: Approval; approver: string | null } | null
}) {
  const clock = ago(item.oldestAt)
  const { text, fill } = TONE[item.tone]
  const href = `/case/${item.key.replace(':', '/')}`
  return (
    <li className="rounded-[14px] border border-hair bg-card shadow-[0_1px_2px_rgba(0,0,0,0.3),0_2px_10px_rgba(0,0,0,0.25)]">
      <div className="px-[18px] pt-[13px] pb-[12px]">
        <div className="flex items-center gap-[9px]">
          <span className="font-mono text-[11px] tabular-nums text-tertiary">
            {rank}
          </span>
          <span
            className={`inline-flex items-center gap-[5px] rounded-md px-2 py-[3px] text-[11.5px] font-semibold ${text} ${fill}`}
          >
            <Icon name={badgeIcon(item.badge)} size={13} />
            {item.badge}
          </span>
          {clock ? (
            <span className="ml-auto inline-flex items-center gap-[4px] font-mono text-[11px] tabular-nums text-secondary">
              <Icon name="clock" size={11} />
              {clock}
            </span>
          ) : null}
        </div>

        <h2 className="mt-[11px] font-display text-[16.5px] font-semibold leading-tight tracking-[-0.015em] text-label">
          <Link href={href} className="hover:underline underline-offset-2 decoration-sand">
            {item.title}
          </Link>
        </h2>
        <p className="mt-[1px] text-[12px] text-secondary">{item.subtitle}</p>
        <p className="mt-[8px] text-[13.5px] leading-[1.45] text-body">{item.brief}</p>
      </div>

      {next ? (
        <Link
          href={href}
          className="flex items-start gap-[9px] border-t border-hair/60 px-[18px] py-[11px] transition-colors hover:bg-canvas/60"
        >
          <Icon name="arrow-right" size={14} className="mt-[3px] text-tertiary" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium leading-[1.4] text-label">
              {next.title}
            </span>
            <span
              className={`inline-flex items-center gap-[4px] text-[11.5px] font-medium ${WHO[next.approval].tone}`}
            >
              <Icon name={WHO[next.approval].icon} size={12} />
              {WHO[next.approval].label}
              {next.approver ? ` · ${deskName(next.approver)}` : ''}
            </span>
          </span>
          <span className="mt-[4px] text-tertiary">
            <Chevron />
          </span>
        </Link>
      ) : null}
    </li>
  )
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; by?: string }>
}) {
  return <Queue searchParams={searchParams} />
}

async function Queue({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; by?: string }>
}) {
  const sp = await searchParams
  const scope: Scope = sp.show === 'resolved' ? 'resolved' : 'needs'
  const decider: Decider =
    sp.by === 'bot' ? 'bot' : sp.by === 'human' ? 'human' : 'all'

  const data = load()
  const cases = buildCases(data)
  const hard = cases.filter((c) => c.score >= HARD_ENOUGH)
  const { items, summary } = buildHandled(data)

  const rows = hard.map((item) => {
    const top = proposeFor(item.key, data)?.proposals[0] ?? null
    return {
      item,
      next: top
        ? { title: top.title, approval: top.approval, approver: top.approver }
        : null,
    }
  })
  const botCan = rows.filter((r) => r.next?.approval === 'AGENT_SENDS').length

  // A human "decided" covers approving, editing and stopping. Three of the
  // four that ran were edited and one was rejected, so "approved" would be
  // wrong for most of them.
  const resolved =
    decider === 'bot'
      ? items.filter((i) => i.tier === 'autonomous')
      : decider === 'human'
        ? items.filter((i) => i.tier !== 'autonomous')
        : items

  // How much is still open per order, so a resolved action can say what the
  // order looks like today rather than implying the order is closed too.
  const openPerOrder = new Map<string, number>()
  for (const f of detect(data)) {
    if (f.subject.kind !== 'order') continue
    openPerOrder.set(f.subject.id, (openPerOrder.get(f.subject.id) ?? 0) + 1)
  }

  const counts = {
    needs: hard.length,
    resolved: items.length,
    bot: summary.autonomous,
    human: summary.approved + summary.stopped,
  }

  return (
    <Shell active="cases" full>
      <header>
        <h1 className="font-display text-[29px] font-bold leading-[1.1] tracking-[-0.025em] text-label">
          Operations centre
        </h1>
      </header>

      <div className="mt-6">
        <Filters scope={scope} decider={decider} counts={counts} />
      </div>

      <div
        className={
          'mt-6 grid items-start gap-6 ' +
          (scope === 'needs' ? 'lg:grid-cols-[1fr_292px]' : 'lg:grid-cols-1')
        }
      >
        <div className={scope === 'resolved' ? 'lg:max-w-[704px]' : undefined}>
          {scope === 'needs' ? (
            <>
              <ul className="flex flex-col gap-[11px]">
                {rows.map(({ item, next }, i) => (
                  <CaseCard key={item.key} item={item} rank={i + 1} next={next} />
                ))}
              </ul>
              {cases.length - hard.length > 0 ? (
                <p className="mt-[18px] px-[2px] text-[12.5px] leading-[1.5] text-secondary">
                  <span className="font-medium text-label">
                    {cases.length - hard.length} cases are open and owned.
                  </span>{' '}
                  Their records say what happens next, so they are not here.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <ul className="flex flex-col gap-[11px]">
                {resolved.map((item) => (
                  <HandledCard
                    key={item.id}
                    item={item}
                    stillOpen={item.orderId ? openPerOrder.get(item.orderId) ?? 0 : 0}
                  />
                ))}
              </ul>
              {!resolved.length ? (
                <p className="px-[2px] text-[12.5px] text-secondary">
                  Nothing in this slice.
                </p>
              ) : null}
            </>
          )}
        </div>

        {scope === 'needs' ? (
          <aside className="lg:sticky lg:top-[60px]">
            <HandledPanel data={data} />
          </aside>
        ) : null}
      </div>
    </Shell>
  )
}
