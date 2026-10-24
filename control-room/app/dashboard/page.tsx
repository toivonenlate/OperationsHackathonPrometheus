// The dashboard.
//
// Not a wall of counts: every tile is a door into work, and the number on it is
// how many things are behind that door. Nothing here is decorative, because an
// operator's complaint about dashboards is that they describe instead of act.
import Link from 'next/link'
import { SNAPSHOT_AT, load } from '../../lib/data'
import { buildCases } from '../../lib/cases'
import { buildHandled } from '../../lib/handled'
import { buildSupport, supportCounts } from '../../lib/support'
import { proposeFor } from '../../lib/propose'
import { timelineOf, until } from '../../lib/route'
import { deskName } from '../../lib/labels'
import Shell from '../components/shell'
import { Chevron, Code } from '../components/bits'
import { Icon, type IconName } from '../components/icons'
import { badgeIcon, categoryIcon } from '../components/glyphs'

const HARD_ENOUGH = 11

const TONE_TEXT: Record<string, string> = {
  critical: 'text-red',
  pending: 'text-orange',
  info: 'text-teal',
}

const CARD =
  'rounded-[14px] border border-hair bg-card shadow-[0_1px_2px_rgba(0,0,0,0.3),0_2px_10px_rgba(0,0,0,0.25)]'

function Tile({
  href,
  label,
  value,
  note,
  icon,
  tone = 'neutral',
}: {
  href: string
  label: string
  icon: IconName
  value: string
  note: string
  tone?: 'danger' | 'warn' | 'ok' | 'neutral'
}) {
  const colour =
    tone === 'danger'
      ? 'text-red'
      : tone === 'warn'
        ? 'text-orange'
        : tone === 'ok'
          ? 'text-green'
          : 'text-label'
  return (
    <Link href={href} className={`${CARD} group block px-[17px] py-[14px] transition-colors hover:bg-canvas/50`}>
      <p className="flex items-center gap-[7px] text-[12px] font-semibold tracking-[-0.005em] text-secondary">
        <span className={`grid size-[26px] place-items-center rounded-[7px] bg-canvas ${colour}`}>
          <Icon name={icon} size={15} />
        </span>
        {label}
        <span className="ml-auto text-tertiary opacity-0 transition-opacity group-hover:opacity-100">
          <Chevron />
        </span>
      </p>
      <p className={`mt-[9px] font-display text-[30px] font-bold leading-none tracking-[-0.03em] ${colour}`}>
        {value}
      </p>
      <p className="mt-[6px] text-[12.5px] leading-[1.4] text-secondary">{note}</p>
    </Link>
  )
}

export default function Dashboard() {
  const data = load()
  const cases = buildCases(data)
  const hard = cases.filter((c) => c.score >= HARD_ENOUGH)
  const { summary } = buildHandled(data)
  const threads = buildSupport(data)
  const sc = supportCounts(threads)

  const botCan = hard.filter(
    (c) => proposeFor(c.key, data)?.proposals[0]?.approval === 'AGENT_SENDS',
  ).length

  // Promises inside the next 24 hours on cars that are still moving.
  const atRisk = data.orders
    .filter((o) => o.status === 'IN_TRANSIT' && !o.cancelled_at)
    .map((o) => ({ o, t: timelineOf(o.id, data) }))
    .filter(
      ({ t }) =>
        t?.nextLabel === 'Delivery promise' &&
        t.hoursToNext !== null &&
        t.hoursToNext > 0 &&
        t.hoursToNext < 24,
    )
    .sort((a, b) => (a.t!.hoursToNext ?? 0) - (b.t!.hoursToNext ?? 0))

  const snapshot = SNAPSHOT_AT.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })

  return (
    <Shell active="dashboard" full>
      <header>
        <h1 className="font-display text-[29px] font-bold leading-[1.1] tracking-[-0.025em] text-label">
          Good morning
        </h1>
        <p className="mt-[7px] text-[14px] text-secondary">
          {snapshot} UTC · {data.orders.length} orders on the books
        </p>
      </header>

      <section className="mt-7 grid gap-[11px] sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          href="/cases"
          label="Needs a human"
          icon="warning"
          value={String(hard.length)}
          note={`BahnBot can take the first step on ${botCan}`}
          tone={hard.length ? 'danger' : 'ok'}
        />
        <Tile
          href="/support"
          label="Drivers waiting on us"
          icon="support"
          value={String(sc.needsAnswer)}
          note={`BahnBot can answer ${sc.botCanAct} without asking you`}
          tone={sc.needsAnswer ? 'warn' : 'ok'}
        />
        <Tile
          href="/cases?show=resolved&by=bot"
          label="BahnBot resolved"
          icon="agent"
          value={String(summary.autonomous)}
          note={`${summary.feeTotal} of driver fees priced`}
          tone="ok"
        />
        <Tile
          href="/cases?show=resolved&by=human"
          label="A human decided"
          icon="person"
          value={String(summary.approved + summary.stopped)}
          note={`${summary.edited} edited, ${summary.stopped} stopped before running`}
        />
      </section>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        {/* ---- what to do first ---- */}
        <section>
          <h2 className="mb-[9px] flex items-center gap-[6px] px-[2px] text-[12px] font-semibold tracking-[-0.005em] text-secondary">
            <Icon name="arrow-right" size={13} />
            Start here
          </h2>
          <ul className={`${CARD} px-[17px] py-[4px]`}>
            {hard.slice(0, 5).map((c, i) => {
              const top = proposeFor(c.key, data)?.proposals[0] ?? null
              return (
                <li key={c.key} className="border-b border-hair/60 last:border-b-0">
                  <Link
                    href={`/case/${c.key.replace(':', '/')}`}
                    className="block py-[11px]"
                  >
                    <div className="flex items-baseline gap-[9px]">
                      <span className="font-mono text-[11px] tabular-nums text-tertiary">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-label">
                        {c.title}
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center gap-[4px] text-[11.5px] ${TONE_TEXT[c.tone]}`}
                      >
                        <Icon name={badgeIcon(c.badge)} size={12} />
                        <span className="text-secondary">{c.badge}</span>
                      </span>
                    </div>
                    {top ? (
                      <p className="mt-[3px] pl-[20px] text-[12.5px] leading-[1.4] text-secondary">
                        {top.title}
                        {top.approver ? ` · ${deskName(top.approver)}` : ''}
                      </p>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
          <Link
            href="/cases"
            className="mt-[9px] inline-flex items-center gap-[5px] px-[2px] text-[12.5px] font-medium text-teal hover:underline"
          >
            All {hard.length} cases
            <Chevron />
          </Link>
        </section>

        {/* ---- promises in the next day ---- */}
        <section>
          <h2 className="mb-[9px] flex items-center gap-[6px] px-[2px] text-[12px] font-semibold tracking-[-0.005em] text-secondary">
            <Icon name="clock" size={13} />
            Promises due in the next 24 hours
          </h2>
          {atRisk.length ? (
            <ul className={`${CARD} px-[17px] py-[4px]`}>
              {atRisk.map(({ o, t }) => (
                <li key={o.id} className="border-b border-hair/60 last:border-b-0">
                  <Link
                    href={`/case/order/${o.id}`}
                    className="flex items-baseline gap-[9px] py-[11px]"
                  >
                    <Code>{o.reference}</Code>
                    <span className="inline-flex min-w-0 flex-1 items-center gap-[5px] self-center truncate text-[13px] text-secondary">
                      <Icon name="car" size={13} />
                      on the road
                    </span>
                    <span
                      className={
                        'shrink-0 font-mono text-[12px] tabular-nums ' +
                        ((t!.hoursToNext ?? 0) < 8 ? 'font-semibold text-red' : 'text-label')
                      }
                    >
                      {until(t!.hoursToNext!)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className={`${CARD} px-[17px] py-[14px]`}>
              <p className="text-[13px] text-secondary">
                No delivery promise falls due in the next day.
              </p>
            </div>
          )}

          <h2 className="mb-[9px] mt-7 flex items-center gap-[6px] px-[2px] text-[12px] font-semibold tracking-[-0.005em] text-secondary">
            <Icon name="support" size={13} />
            Longest a driver has waited
          </h2>
          <ul className={`${CARD} px-[17px] py-[4px]`}>
            {threads
              .filter((t) => t.state === 'NEEDS_ANSWER')
              .slice(0, 3)
              .map((t) => (
                <li key={t.id} className="border-b border-hair/60 last:border-b-0">
                  <Link
                    href="/support"
                    className="flex items-baseline gap-[9px] py-[11px]"
                  >
                    <Icon
                      name={categoryIcon(t.category)}
                      size={13}
                      className="self-center text-secondary"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-label">
                      {t.driverName}
                      <span className="text-secondary"> · {t.category}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[12px] tabular-nums text-secondary">
                      {until(t.idleHours)}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      </div>

      <p className="mt-9 text-[11.5px] leading-[1.6] text-tertiary">
        Every number on this page is a link into the work behind it. Counted from
        the records at the snapshot, with no model inference.
      </p>
    </Shell>
  )
}
