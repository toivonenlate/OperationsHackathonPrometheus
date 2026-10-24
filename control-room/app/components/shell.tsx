// One frame for every view: same bar, same nav, same width, same place for
// "where am I". Previously each page invented its own.
import Link from 'next/link'
import { SNAPSHOT_AT } from '../../lib/data'
import { Icon, type IconName } from './icons'

const SNAPSHOT = SNAPSHOT_AT.toLocaleString('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

// One container width for every view, sized for the ops map. Pages used to
// pick their own, so the wordmark and the nav physically moved when you
// navigated. Narrower views cap their own column inside it, left-aligned, so
// content starts under the wordmark on every page.
const SHELL = 'max-w-[1560px]'
/** The queue and the dashboard: a column plus a side rail. */
const FULL = 'max-w-[1020px]'
/** Reading views. Exactly the width of the queue's left column. */
const MAIN = 'max-w-[704px]'

function NavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string
  label: string
  icon: IconName
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={
        'inline-flex items-center gap-[6px] rounded-[7px] px-[9px] py-[4px] text-[13px] transition-colors ' +
        (active
          ? 'bg-hair font-semibold text-label'
          : 'font-medium text-secondary hover:text-label')
      }
    >
      <Icon name={icon} size={14} />
      {/* Icons alone on a phone, where four labels do not fit beside the wordmark.
          A hidden bold copy reserves the active width, so selecting a tab
          never nudges the ones after it. */}
      <span className="grid max-sm:sr-only">
        <span aria-hidden className="invisible col-start-1 row-start-1 font-semibold">
          {label}
        </span>
        <span className="col-start-1 row-start-1">{label}</span>
      </span>
    </Link>
  )
}

export default function Shell({
  active,
  back,
  backHref,
  full = false,
  wide = false,
  children,
}: {
  active: 'dashboard' | 'ops' | 'cases' | 'support' | 'answers'
  /** Shown above the title when this view is a child of another. */
  back?: string
  /** Where the back link goes. Defaults to the queue. */
  backHref?: string
  /** The queue lays out its own columns and uses the full shell width. */
  full?: boolean
  /** The ops map uses the whole container instead of a capped column. */
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <main className="min-h-screen bg-canvas">
      <div className="sticky top-0 z-10 border-b border-hair bg-canvas/85 backdrop-blur-xl">
        <div className={`mx-auto flex items-center gap-1 px-5 py-[9px] ${SHELL}`}>
          <Link
            href="/"
            className="mr-3 inline-flex items-center gap-[7px] font-display text-[15px] font-semibold tracking-[-0.02em] text-label"
          >
            {/* Same mark as the favicon. */}
            <img src="/icon.svg" alt="" width={20} height={20} className="rounded-[5px]" />
            <span>
              Bahn<span className="text-secondary">OS</span>
            </span>
          </Link>
          <NavLink href="/" label="Ops map" icon="globe" active={active === 'ops'} />
          <NavLink href="/dashboard" label="Dashboard" icon="dashboard" active={active === 'dashboard'} />
          <NavLink href="/cases" label="Cases" icon="cases" active={active === 'cases'} />
          <NavLink href="/support" label="Driver support" icon="support" active={active === 'support'} />
          <NavLink href="/answers" label="Answer book" icon="book" active={active === 'answers'} />
          <span className="ml-auto hidden items-center gap-[5px] font-mono text-[11px] text-tertiary sm:inline-flex">
            <Icon name="clock" size={12} />
            {SNAPSHOT} UTC
          </span>
        </div>
      </div>

      <div className={`mx-auto px-5 pt-8 ${wide ? 'pb-10' : 'pb-28'} ${SHELL}`}>
        <div className={wide ? undefined : full ? FULL : MAIN}>
        {back ? (
          <Link
            href={backHref ?? '/cases'}
            className="mb-[14px] inline-flex items-center gap-[5px] text-[12.5px] font-medium text-teal hover:underline"
          >
            <Icon name="arrow-left" size={13} />
            {back}
          </Link>
        ) : null}
          {children}
        </div>
      </div>
    </main>
  )
}
