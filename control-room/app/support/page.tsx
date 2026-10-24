// Driver support: every question a driver has asked, and what it waits on.
//
// Ordered so the ball being in our court comes first, oldest of those at the
// top. A thread where we spoke last is not finished — it is just not our move.
import Link from 'next/link'
import { load } from '../../lib/data'
import { type SupportThread, buildSupport, supportCounts } from '../../lib/support'
import { until } from '../../lib/route'
import Shell from '../components/shell'
import { Chevron, Code } from '../components/bits'
import { Icon, type IconName } from '../components/icons'
import { ROUTING_ICON, categoryIcon } from '../components/glyphs'

const CARD =
  'rounded-[14px] border border-hair bg-card shadow-[0_1px_2px_rgba(66,61,51,0.04),0_2px_10px_rgba(66,61,51,0.05)]'

const STATE: Record<string, { label: string; tone: string; icon: IconName }> = {
  NEEDS_ANSWER: { label: 'Needs answering', tone: 'text-red bg-red/12', icon: 'alert' },
  WAITING_ON_DRIVER: {
    label: 'Waiting on the driver',
    tone: 'text-orange bg-orange/12',
    icon: 'waiting',
  },
  RESOLVED: { label: 'Resolved', tone: 'text-green bg-green/12', icon: 'confirmed' },
}

const ROUTING: Record<string, { label: string; tone: string }> = {
  ANSWER: { label: 'BahnBot can answer', tone: 'text-teal' },
  LOOKUP: { label: 'BahnBot can answer from the records', tone: 'text-teal' },
  ASK: { label: 'BahnBot can ask the next question', tone: 'text-teal' },
  ESCALATE: { label: 'Needs a human', tone: 'text-red' },
}

const LANGUAGE: Record<string, string> = {
  de: 'German',
  fi: 'Finnish',
  fr: 'French',
  da: 'Danish',
}

function Pill({
  href,
  label,
  icon,
  count,
  active,
}: {
  href: string
  label: string
  icon: IconName
  count: number
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={
        'inline-flex items-center gap-[6px] rounded-full border px-[13px] py-[5px] text-[13px] transition-colors ' +
        (active
          ? 'border-label bg-label font-semibold text-birch'
          : 'border-sand/70 bg-card font-medium text-label hover:bg-hair/60')
      }
    >
      <Icon name={icon} size={13} />
      {label}
      <span
        className={'font-mono tabular-nums ' + (active ? 'text-birch/70' : 'text-tertiary')}
      >
        {count}
      </span>
    </Link>
  )
}

function Thread({ t }: { t: SupportThread }) {
  const s = STATE[t.state]
  const r = t.answer ? ROUTING[t.answer.routing] : null
  return (
    <li className={CARD}>
      <div className="px-[18px] pt-[13px] pb-[13px]">
        <div className="flex flex-wrap items-center gap-[9px]">
          <span
            className={`inline-flex items-center gap-[5px] rounded-md px-2 py-[3px] text-[11.5px] font-semibold ${s.tone}`}
          >
            <Icon name={s.icon} size={13} />
            {s.label}
          </span>
          <span className="inline-flex items-center gap-[5px] text-[12px] text-secondary">
            <Icon name={categoryIcon(t.category)} size={13} />
            {t.category}
          </span>
          {t.source === 'inbox' && !t.orderRef ? (
            <span className="rounded bg-orange/12 px-[6px] py-[1px] text-[11px] font-semibold text-orange">
              no order linked
            </span>
          ) : null}
          <span className="ml-auto font-mono text-[11px] tabular-nums text-secondary">
            {t.state === 'RESOLVED' ? null : (
              <Icon name="clock" size={11} className="mr-[4px] inline align-[-1px]" />
            )}
            {t.state === 'RESOLVED' ? 'closed' : until(t.idleHours) + ' ago'}
          </span>
        </div>

        <h2 className="mt-[10px] flex items-center gap-[7px] font-display text-[15.5px] font-semibold leading-tight tracking-[-0.012em] text-label">
          <Icon name="person" size={15} className="text-secondary" />
          {t.driverName}
        </h2>
        <div className="mt-[2px] flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-secondary">
          {t.homeCity ? (
            <span className="inline-flex items-center gap-[3px]">
              <Icon name="pin" size={12} />
              {t.homeCity}
            </span>
          ) : null}
          <Code>{t.channel}</Code>
          {t.language && t.language !== 'en' ? (
            <span className="rounded bg-teal/12 px-[5px] py-[1px] text-[10.5px] font-semibold uppercase text-teal">
              {LANGUAGE[t.language] ?? t.language}
            </span>
          ) : null}
          {t.orderRef ? <Code>{t.orderRef}</Code> : null}
        </div>

        <p className="mt-[9px] border-l-2 border-hair pl-[10px] text-[13.5px] leading-[1.5] text-label">
          {t.lastBody}
        </p>
        <p className="mt-[5px] pl-[12px] text-[11.5px] text-tertiary">
          {t.lastFrom === 'driver' ? t.driverName : 'Bahn'} spoke last ·{' '}
          {t.driverMessages} of {t.messageCount} messages from them
          {t.waitingOn ? ` · waiting on ${t.waitingOn.toLowerCase().replace(/_/g, ' ')}` : ''}
        </p>
      </div>

      {t.state !== 'RESOLVED' ? (
        <Link
          href={`/case/driver/${t.driverId}`}
          className="flex items-center gap-[9px] border-t border-hair/60 px-[18px] py-[10px] transition-colors hover:bg-canvas/60"
        >
          <span className="min-w-0 flex-1">
            {r ? (
              <>
                <span
                  className={`flex items-center gap-[6px] text-[13.5px] font-medium ${r.tone}`}
                >
                  <Icon name={ROUTING_ICON[t.answer!.routing]} size={14} />
                  {r.label}
                </span>
                <span className="flex items-center gap-[5px] pl-[20px] text-[11.5px] text-secondary">
                  <Icon name="book" size={11} />
                  From the answer book · {t.answer!.topic}
                </span>
              </>
            ) : (
              <span className="flex items-center gap-[6px] text-[13.5px] font-medium text-label">
                <Icon name="open-check" size={14} className="text-secondary" />
                No answer-book entry covers this — open the case
              </span>
            )}
          </span>
          <span className="text-tertiary">
            <Chevron />
          </span>
        </Link>
      ) : null}
    </li>
  )
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>
}) {
  const sp = await searchParams
  const show = sp.show ?? 'needs'

  const threads = buildSupport(load())
  const c = supportCounts(threads)

  const visible =
    show === 'waiting'
      ? threads.filter((t) => t.state === 'WAITING_ON_DRIVER')
      : show === 'resolved'
        ? threads.filter((t) => t.state === 'RESOLVED')
        : show === 'all'
          ? threads
          : threads.filter((t) => t.state === 'NEEDS_ANSWER')

  return (
    <Shell active="support" full>
      <header>
        <h1 className="font-display text-[29px] font-bold leading-[1.1] tracking-[-0.025em] text-label">
          Driver support
        </h1>
        <p className="mt-[7px] max-w-[62ch] text-[14px] leading-[1.5] text-secondary">
          {c.needsAnswer} question{c.needsAnswer === 1 ? '' : 's'} waiting on us.
          BahnBot can take {c.botCanAct} of them without asking you.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-[6px]">
        <Pill
          href="/support"
          label="Needs answering"
          icon="alert"
          count={c.needsAnswer}
          active={show === 'needs'}
        />
        <Pill
          href="/support?show=waiting"
          label="Waiting on the driver"
          icon="waiting"
          count={c.waiting}
          active={show === 'waiting'}
        />
        <Pill
          href="/support?show=resolved"
          label="Resolved"
          icon="confirmed"
          count={c.resolved}
          active={show === 'resolved'}
        />
        <Pill href="/support?show=all" label="All" icon="cases" count={c.all} active={show === 'all'} />
      </div>

      <ul className="mt-6 flex max-w-[704px] flex-col gap-[11px]">
        {visible.map((t) => (
          <Thread key={t.id} t={t} />
        ))}
      </ul>

      {!visible.length ? (
        <p className="mt-6 max-w-[62ch] text-[13px] text-secondary">
          Nothing here. No driver is waiting on us in this slice.
        </p>
      ) : null}

      {show === 'waiting' ? (
        <p className="mt-5 max-w-[62ch] text-[11.5px] leading-[1.6] text-tertiary">
          We spoke last on these, so they are not our move — but a thread nobody
          chases is how things fall through. The oldest here has been quiet for{' '}
          {until(Math.max(...visible.map((t) => t.idleHours)))}.
        </p>
      ) : null}
    </Shell>
  )
}
