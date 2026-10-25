'use client'
// The live half of the ops map: the clock bar, BahnBot's suggestions as cards
// and as a queue, and the toasts that bring a new one onto the map.
//
// Every button here posts to /api/live; nothing changes on screen until the
// server's next frame says it did, so two tabs can never disagree.
import { useEffect, useRef, useState } from 'react'
import type { Action, Decision, LiveState, Suggestion } from '../../lib/live'
import { deskName } from '../../lib/labels'
import { Icon, type IconName } from '../components/icons'

// Same tokens as the console.
const CAPTION =
  'flex items-center gap-[6px] font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-tertiary'

/** BahnBot's colour, as in the activity chart. */
export const BOT = '#9085e9'

const SPEEDS = [1, 60, 600]
const HOUR = 3_600_000

export type Act = (a: Action) => Promise<{ ok: boolean; error?: string }>

/** A suggestion counts as new for this long after it arrives, in wall time. */
export const FRESH_MS = 20_000

export const APPROVAL: Record<Suggestion['approval'], { label: string; verb: string; icon: IconName; tone: string }> = {
  AGENT_SENDS: { label: 'BahnBot sends once you say go', verb: 'Send', icon: 'agent', tone: 'text-teal' },
  NEEDS_APPROVAL: { label: 'Needs your approval', verb: 'Approve', icon: 'shield', tone: 'text-orange' },
  NEEDS_PERSON: { label: 'Needs a person to decide', verb: 'Resolve', icon: 'person', tone: 'text-red' },
}

const RULE: Record<Suggestion['rule'], string> = {
  case: 'From the case',
  eta: 'Live · ETA slip',
  stale: 'Live · quiet app',
  arrival: 'Live · arrival',
  close: 'Live · delivered',
}

function since(t: number, now: number): string {
  const m = Math.max(0, Math.round((now - t) / 60_000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  return `${Math.floor(m / 60)} h ${m % 60} min ago`
}

function simStamp(t: number): string {
  return new Date(t).toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  })
}

/* ---------------------------------------------------------------- live bar */

export function LiveBar({
  live,
  online,
  act,
  orders,
}: {
  live: LiveState | null
  online: boolean
  act: Act
  orders: number
}) {
  const running = live && online && !live.paused
  const ahead = live ? (live.simNow - live.snapshot) / HOUR : 0
  return (
    <div className="mt-[7px] flex flex-wrap items-center gap-x-[10px] gap-y-[6px] text-[13px] text-secondary">
      <span className="inline-flex items-center gap-[6px]">
        <span className="relative flex size-[8px]">
          {running ? <span className="absolute inset-0 animate-ping rounded-full bg-green opacity-60" /> : null}
          <span className={`relative size-[8px] rounded-full ${running ? 'bg-green' : live?.paused ? 'bg-orange' : 'bg-tertiary'}`} />
        </span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-label">
          {!online ? 'connecting' : live?.paused ? 'paused' : 'live sim'}
        </span>
      </span>
      {live ? (
        <>
          <span className="font-mono text-[12px] tabular-nums text-label">{simStamp(live.simNow)} UTC</span>
          <span className="font-mono text-[11px] text-tertiary">
            snapshot +{Math.floor(ahead)} h {Math.round((ahead % 1) * 60)} min · {orders} orders
          </span>
          <span className="inline-flex items-center overflow-hidden rounded-[7px] border border-hair bg-card">
            <button
              type="button"
              onClick={() => act({ type: 'control', paused: !live.paused })}
              title={live.paused ? 'Resume (P)' : 'Pause (P)'}
              className="px-[7px] py-[3px] text-secondary hover:bg-birch hover:text-label"
            >
              <Icon name={live.paused ? 'arrow-right' : 'pause'} size={12} />
            </button>
            {SPEEDS.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => act({ type: 'control', speed: x })}
                aria-pressed={live.speed === x}
                title={x === 1 ? 'Real time' : `One real second is ${x === 60 ? 'a minute' : '10 minutes'}`}
                className={`border-l border-hair px-[7px] py-[3px] font-mono text-[11px] tabular-nums ${live.speed === x ? 'bg-label font-semibold text-canvas' : 'text-secondary hover:bg-birch hover:text-label'}`}
              >
                ×{x}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Start the demo again from the snapshot? Every decision is cleared.')) act({ type: 'reset' })
              }}
              title="Back to the snapshot"
              className="border-l border-hair px-[7px] py-[3px] text-secondary hover:bg-birch hover:text-label"
            >
              <Icon name="refresh" size={12} />
            </button>
          </span>
        </>
      ) : (
        <span className="font-mono text-[11px] text-tertiary">{orders} orders, as of the snapshot</span>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- one suggestion */

function useDecide(act: Act, s: Suggestion, onDone?: (text: string) => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (verdict: 'approved' | 'rejected', body?: string) => {
    setBusy(true)
    setError(null)
    const r = await act({ type: 'decide', id: s.id, verdict, body })
    setBusy(false)
    if (!r.ok) setError(r.error ?? 'That did not go through.')
    else onDone?.(`${verdict === 'rejected' ? 'Stopped' : APPROVAL[s.approval].verb === 'Send' ? 'Sent' : 'Approved'} · ${s.title}`)
  }
  return { busy, error, run }
}

/** The full card, for the inspector: what, why, the exact words, and the buttons. */
export function SuggestionCard({
  s,
  act,
  now,
  refs,
  onDone,
  primary,
}: {
  s: Suggestion
  act: Act
  now: number
  refs: string[]
  onDone?: (text: string) => void
  primary?: boolean
}) {
  const a = APPROVAL[s.approval]
  const { busy, error, run } = useDecide(act, s, onDone)
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(s.draft?.body ?? '')
  const fresh = s.raisedReal && Date.now() - s.raisedReal < FRESH_MS

  return (
    <div
      className="ops-in rounded-[9px] border bg-birch px-[11px] py-[10px]"
      style={{ borderColor: fresh ? BOT : 'var(--color-sand)' }}
    >
      <p className={CAPTION}>
        <span style={{ color: BOT }}>
          <Icon name="agent" size={12} />
        </span>
        <span style={{ color: BOT }}>BahnBot suggests</span>
        <span className="normal-case tracking-normal">· {RULE[s.rule]}</span>
        <span className="ml-auto normal-case tracking-normal">{s.source === 'watch' ? since(s.raisedAt, now) : ''}</span>
      </p>
      <p className="mt-[6px] text-[13px] font-semibold leading-[1.35] text-label">{s.title}</p>
      {s.because ? <p className="mt-[3px] text-[11.5px] leading-[1.45] text-secondary">{s.because}</p> : null}
      {refs.length > 1 ? (
        <p className="mt-[4px] font-mono text-[10.5px] text-tertiary">Covers {refs.join(', ')}</p>
      ) : null}

      {s.draft ? (
        <div className="mt-[8px] rounded-[7px] border border-hair bg-card px-[9px] py-[7px]">
          <p className="flex items-center gap-[6px] font-mono text-[10px] uppercase tracking-[0.06em] text-tertiary">
            <Icon name={s.draft.kind === 'DRAFT' ? 'message' : 'book'} size={11} />
            {s.draft.kind === 'DRAFT' ? `To ${s.draft.to}` : 'What the reply must establish'}
            {s.draft.language !== 'en' ? <span>· {s.draft.language}</span> : null}
          </p>
          {editing ? (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              autoFocus
              className="mt-[5px] w-full resize-y rounded-[5px] border border-sand bg-canvas px-[7px] py-[5px] text-[12px] leading-[1.45] text-label outline-none focus:border-label"
            />
          ) : (
            <p className="mt-[4px] whitespace-pre-line text-[12px] leading-[1.45] text-body">
              {s.draft.kind === 'DRAFT' ? `“${body}”` : body}
            </p>
          )}
        </div>
      ) : null}

      {s.changes.length || s.unchanged.length ? (
        <details className="group mt-[7px]">
          <summary className="flex cursor-pointer list-none items-center gap-[5px] text-[11.5px] text-secondary hover:text-label [&::-webkit-details-marker]:hidden">
            <Icon name="chevron-right" size={11} className="transition-transform group-open:rotate-90" />
            What changes, and what does not
          </summary>
          <ul className="mt-[5px] space-y-[3px] pl-[16px] text-[11.5px] leading-[1.4]">
            {s.changes.map((c) => (
              <li key={c} className="flex gap-[6px] text-body">
                <Icon name="check" size={11} className="mt-[2px] shrink-0 text-green" />
                {c}
              </li>
            ))}
            {s.unchanged.map((c) => (
              <li key={c} className="flex gap-[6px] text-secondary">
                <Icon name="lock" size={11} className="mt-[2px] shrink-0 text-tertiary" />
                {c}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-[9px] flex flex-wrap items-center gap-[6px]">
        <span className={`inline-flex items-center gap-[5px] text-[11px] ${a.tone}`}>
          <Icon name={a.icon} size={12} />
          {a.label}
          {s.approver ? <span className="text-tertiary">· {deskName(s.approver)}</span> : null}
        </span>
        <span className="ml-auto flex items-center gap-[4px]">
          {s.draft?.kind === 'DRAFT' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(!editing)}
              className="inline-flex items-center gap-[4px] rounded-[6px] px-[8px] py-[4px] text-[12px] font-medium text-label hover:bg-hair/70"
            >
              <Icon name="document" size={12} />
              {editing ? 'Done' : 'Edit'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => run('rejected')}
            title={primary ? 'Stop (R)' : 'Stop'}
            className="inline-flex items-center gap-[4px] rounded-[6px] px-[8px] py-[4px] text-[12px] font-medium text-label hover:bg-hair/70"
          >
            <Icon name="close" size={12} />
            Stop
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run('approved', s.draft?.kind === 'DRAFT' ? body : undefined)}
            title={primary ? `${a.verb} (A)` : a.verb}
            className="inline-flex items-center gap-[5px] rounded-[6px] bg-ink px-[11px] py-[4px] text-[12px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Working…' : a.verb}
            <Icon name={s.approval === 'AGENT_SENDS' ? 'arrow-right' : 'check'} size={12} />
          </button>
        </span>
      </div>
      {error ? <p className="mt-[5px] text-[11.5px] text-red">{error}</p> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- the queue */

const TIER: Suggestion['approval'][] = ['NEEDS_PERSON', 'NEEDS_APPROVAL', 'AGENT_SENDS']

export function SuggestionQueue({
  suggestions,
  refOf,
  act,
  now,
  selectedId,
  open,
  onDone,
}: {
  suggestions: Suggestion[]
  refOf: (orderId: string) => string
  act: Act
  now: number
  selectedId: string | null
  open: (orderId: string) => void
  onDone: (text: string) => void
}) {
  // Newest live ones first, they are the news; then the case backlog by who has to act.
  const sorted = [...suggestions].sort(
    (a, b) =>
      (a.source === 'watch' ? 0 : 1) - (b.source === 'watch' ? 0 : 1) ||
      b.raisedAt - a.raisedAt ||
      TIER.indexOf(a.approval) - TIER.indexOf(b.approval),
  )
  if (!sorted.length) {
    return (
      <div className="px-[14px] py-[22px] text-center">
        <Icon name="confirmed" size={20} className="mx-auto text-green" />
        <p className="mt-[8px] text-[13px] font-medium text-label">Nothing waiting on you.</p>
        <p className="mt-[3px] text-[11.5px] text-secondary">BahnBot will raise the next one here when the road changes.</p>
      </div>
    )
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {sorted.map((s) => (
        <QueueRow
          key={s.id}
          s={s}
          refs={s.orderIds.map(refOf)}
          act={act}
          now={now}
          on={selectedId !== null && s.orderIds.includes(selectedId)}
          open={() => s.orderIds[0] && open(s.orderIds[0])}
          onDone={onDone}
        />
      ))}
    </ul>
  )
}

function QueueRow({
  s,
  refs,
  act,
  now,
  on,
  open,
  onDone,
}: {
  s: Suggestion
  refs: string[]
  act: Act
  now: number
  on: boolean
  open: () => void
  onDone: (text: string) => void
}) {
  const a = APPROVAL[s.approval]
  const { busy, run } = useDecide(act, s, onDone)
  const fresh = s.raisedReal && Date.now() - s.raisedReal < FRESH_MS
  return (
    <li className={`ops-in border-b border-hair/60 ${on ? 'bg-birch shadow-[inset_2px_0_0_var(--color-label)]' : ''}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        className="cursor-pointer px-[12px] py-[8px] hover:bg-birch/60"
      >
        <p className="flex items-center gap-[6px]">
          <span className="relative flex size-[7px] shrink-0">
            {fresh ? <span className="absolute inset-0 animate-ping rounded-full" style={{ background: BOT }} /> : null}
            <span className="relative size-[7px] rounded-full" style={{ background: BOT }} />
          </span>
          <span className="font-mono text-[11.5px] text-label">{refs[0] ?? '—'}</span>
          {refs.length > 1 ? <span className="font-mono text-[10.5px] text-tertiary">+{refs.length - 1}</span> : null}
          <span className="ml-auto font-mono text-[10px] text-tertiary">
            {s.source === 'watch' ? since(s.raisedAt, now) : 'case'}
          </span>
        </p>
        <p className="mt-[3px] line-clamp-2 text-[12px] leading-[1.35] text-body">{s.title}</p>
        <div className="mt-[5px] flex items-center gap-[4px]">
          <span className={`inline-flex min-w-0 items-center gap-[4px] truncate text-[10.5px] ${a.tone}`}>
            <Icon name={a.icon} size={11} />
            {s.approval === 'AGENT_SENDS' ? 'BahnBot sends' : s.approval === 'NEEDS_APPROVAL' ? 'Approve' : 'Decide'}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-[3px]">
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                run('rejected')
              }}
              aria-label={`Stop: ${s.title}`}
              className="rounded-[5px] p-[4px] text-tertiary hover:bg-hair/70 hover:text-label"
            >
              <Icon name="close" size={11} />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                run('approved')
              }}
              className="inline-flex items-center gap-[4px] rounded-[5px] bg-ink px-[7px] py-[2px] text-[11px] font-semibold text-canvas hover:opacity-90 disabled:opacity-50"
            >
              {a.verb}
              <Icon name="check" size={10} />
            </button>
          </span>
        </div>
      </div>
    </li>
  )
}

/* ---------------------------------------------------------------- decided */

export function DecidedList({ decisions, now, refOf, pick }: { decisions: Decision[]; now: number; refOf?: (id: string) => string; pick?: (id: string) => void }) {
  if (!decisions.length) return null
  return (
    <ul className="mt-[5px] space-y-[2px]">
      {decisions.map((d) => (
        <li key={d.id}>
          <button
            type="button"
            disabled={!pick}
            onClick={() => d.orderIds[0] && pick?.(d.orderIds[0])}
            className="flex w-full items-start gap-[7px] rounded-[5px] px-[3px] py-[3px] text-left enabled:hover:bg-birch"
          >
            <Icon
              name={d.verdict === 'rejected' ? 'blocked' : 'confirmed'}
              size={12}
              className={`mt-[2px] shrink-0 ${d.verdict === 'rejected' ? 'text-tertiary' : 'text-green'}`}
            />
            <span className="min-w-0 flex-1 text-[11.5px] leading-[1.4]">
              {refOf && d.orderIds[0] ? <span className="font-mono text-label">{refOf(d.orderIds[0])} </span> : null}
              <span className={d.verdict === 'rejected' ? 'text-tertiary line-through' : 'text-body'}>{d.title}</span>
              <span className="block font-mono text-[10px] text-tertiary">
                You {d.verdict === 'rejected' ? 'stopped it' : d.edited ? 'edited and approved' : 'approved'} · {since(d.at, now)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/* ---------------------------------------------------------------- toasts */

export type Toast = { key: string; kind: 'suggestion'; s: Suggestion } | { key: string; kind: 'done'; text: string }

export function Toasts({
  toasts,
  dismiss,
  refOf,
  act,
  open,
  onDone,
}: {
  toasts: Toast[]
  dismiss: (key: string) => void
  refOf: (id: string) => string
  act: Act
  open: (orderId: string) => void
  onDone: (text: string) => void
}) {
  return (
    <div className="pointer-events-none absolute bottom-[10px] right-[10px] z-[3] flex w-[290px] flex-col-reverse gap-[6px]">
      {toasts.map((t) =>
        t.kind === 'done' ? (
          <DoneToast key={t.key} text={t.text} dismiss={() => dismiss(t.key)} />
        ) : (
          <SuggestionToast
            key={t.key}
            s={t.s}
            refs={t.s.orderIds.map(refOf)}
            act={act}
            open={() => {
              if (t.s.orderIds[0]) open(t.s.orderIds[0])
              dismiss(t.key)
            }}
            dismiss={() => dismiss(t.key)}
            onDone={onDone}
          />
        ),
      )}
    </div>
  )
}

/** The latest callback, so a timer is not restarted by every frame's new closure. */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

function DoneToast({ text, dismiss }: { text: string; dismiss: () => void }) {
  const gone = useLatest(dismiss)
  useEffect(() => {
    const t = setTimeout(() => gone.current(), 3500)
    return () => clearTimeout(t)
  }, [gone])
  return (
    <div className="ops-in pointer-events-auto flex items-start gap-[7px] rounded-[9px] border border-green/40 bg-card/95 px-[10px] py-[7px] text-[11.5px] leading-[1.4] text-body shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur">
      <Icon name="confirmed" size={13} className="mt-[1px] shrink-0 text-green" />
      <span className="line-clamp-2">{text}</span>
    </div>
  )
}

function SuggestionToast({
  s,
  refs,
  act,
  open,
  dismiss,
  onDone,
}: {
  s: Suggestion
  refs: string[]
  act: Act
  open: () => void
  dismiss: () => void
  onDone: (text: string) => void
}) {
  const a = APPROVAL[s.approval]
  const { busy, run } = useDecide(act, s, (text) => {
    onDone(text)
    dismiss()
  })
  const [hold, setHold] = useState(false)
  const gone = useLatest(dismiss)
  useEffect(() => {
    if (hold) return
    const t = setTimeout(() => gone.current(), 12_000)
    return () => clearTimeout(t)
  }, [gone, hold])
  return (
    <div
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      className="ops-in pointer-events-auto rounded-[10px] border bg-card/95 px-[11px] py-[9px] shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur"
      style={{ borderColor: BOT }}
    >
      <p className="flex items-center gap-[6px] font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: BOT }}>
        <Icon name="agent" size={12} />
        BahnBot · {RULE[s.rule].replace('Live · ', '')}
        <span className="text-label normal-case tracking-normal">{refs[0]}</span>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="ml-auto text-tertiary hover:text-label">
          <Icon name="close" size={11} />
        </button>
      </p>
      <p className="mt-[5px] text-[12.5px] font-medium leading-[1.35] text-label">{s.title}</p>
      <div className="mt-[7px] flex items-center gap-[5px]">
        <span className={`inline-flex items-center gap-[4px] text-[10.5px] ${a.tone}`}>
          <Icon name={a.icon} size={11} />
          {s.approval === 'AGENT_SENDS' ? 'Ready to send' : 'Needs approval'}
        </span>
        <span className="ml-auto flex items-center gap-[4px]">
          <button type="button" onClick={open} className="rounded-[5px] px-[7px] py-[3px] text-[11.5px] font-medium text-label hover:bg-hair/70">
            View
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run('approved')}
            className="inline-flex items-center gap-[4px] rounded-[5px] bg-ink px-[9px] py-[3px] text-[11.5px] font-semibold text-canvas hover:opacity-90 disabled:opacity-50"
          >
            {a.verb}
            <Icon name="check" size={11} />
          </button>
        </span>
      </div>
    </div>
  )
}
