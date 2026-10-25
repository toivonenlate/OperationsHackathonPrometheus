'use client'
// The case page's buttons, live. They post to the same server the ops map
// does, so a proposal approved here is gone from the map's queue, and one
// approved on the map shows as decided here.
import { useState } from 'react'
import type { Approval } from '../../../../lib/propose'
import { useLive } from '../../../../lib/use-live'
import { Icon } from '../../../components/icons'

const BUTTON =
  'inline-flex items-center gap-[5px] rounded-[7px] px-[10px] py-[5px] text-[13px] font-medium text-label transition-colors hover:bg-hair/70 disabled:opacity-50'

export function ProposalActions({
  id,
  approval,
  draft,
}: {
  id: string
  approval: Approval
  /** Sendable text, when there is some to edit. */
  draft: string | null
}) {
  const { state, act } = useLive()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(draft ?? '')

  const decision = state?.decisions.find((d) => d.id === id)
  if (decision) {
    const stopped = decision.verdict === 'rejected'
    return (
      <p className={`ml-auto inline-flex items-center gap-[6px] text-[13px] font-medium ${stopped ? 'text-tertiary' : 'text-green'}`}>
        <Icon name={stopped ? 'blocked' : 'confirmed'} size={14} />
        {stopped ? 'Stopped' : decision.edited ? 'Edited and approved' : approval === 'AGENT_SENDS' ? 'Sent' : 'Approved'} by you
      </p>
    )
  }
  const run = async (verdict: 'approved' | 'rejected') => {
    setBusy(true)
    setError(null)
    const r = await act({ type: 'decide', id, verdict, body: draft !== null ? body : undefined })
    setBusy(false)
    if (!r.ok) setError(r.error ?? 'That did not go through.')
  }

  return (
    <div className="ml-auto flex w-full flex-col items-end gap-2 sm:w-auto">
      {editing ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          autoFocus
          className="w-full min-w-[min(460px,100%)] resize-y rounded-[8px] border border-sand bg-canvas px-[10px] py-[8px] text-[13px] leading-[1.5] text-label outline-none focus:border-label"
        />
      ) : null}
      <div className="flex items-center gap-2">
        {draft !== null ? (
          <button type="button" disabled={busy} onClick={() => setEditing(!editing)} className={BUTTON}>
            <Icon name="document" size={13} />
            {editing ? 'Done editing' : 'Edit'}
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => run('rejected')} className={BUTTON}>
          <Icon name="close" size={13} />
          {approval === 'NEEDS_PERSON' ? 'Reject' : 'Stop'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run('approved')}
          className="inline-flex items-center gap-[6px] rounded-[7px] bg-ink px-[13px] py-[6px] text-[13px] font-semibold text-birch transition-opacity hover:opacity-90 active:opacity-70 disabled:opacity-50"
        >
          {busy ? 'Working…' : approval === 'AGENT_SENDS' ? 'Send' : 'Approve'}
          <Icon name={approval === 'AGENT_SENDS' ? 'arrow-right' : 'check'} size={13} />
        </button>
      </div>
      {error ? <p className="text-[12px] text-red">{error}</p> : null}
    </div>
  )
}

export function AssignButton({ caseKey }: { caseKey: string }) {
  const { state, act } = useLive()
  const mine = state?.owners[caseKey] === 'You'
  return (
    <button
      type="button"
      disabled={mine}
      onClick={() => act({ type: 'assign', caseKey })}
      className={`ml-auto inline-flex shrink-0 items-center gap-[6px] rounded-[8px] border px-[12px] py-[6px] text-[13px] font-medium transition-colors ${mine ? 'border-green/50 text-green' : 'border-sand/70 bg-card text-label hover:bg-hair/70'}`}
    >
      <Icon name={mine ? 'confirmed' : 'person'} size={14} />
      {mine ? 'Yours' : 'Assign to me'}
    </button>
  )
}
