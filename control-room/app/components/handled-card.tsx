// A handled action, shown the same way as a raised case: same card, same
// chrome, openable. The difference is the badge — who decided — not the shape.
import Link from 'next/link'
import type { HandledItem } from '../../lib/handled'
import { deskName } from '../../lib/labels'
import { Chevron, Code, shortDate } from './bits'
import { Icon } from './icons'
import { DECIDED_ICON } from './glyphs'

const DECIDED: Record<string, { label: string; tone: string }> = {
  autonomous: { label: 'BahnBot resolved', tone: 'text-green bg-green/12' },
  approved: { label: 'Human approved', tone: 'text-teal bg-teal/12' },
  stopped: { label: 'Human stopped', tone: 'text-red bg-red/12' },
}

const EDIT: Record<string, string> = {
  APPROVED: 'approved as proposed',
  EDITED: 'edited before it ran',
  REJECTED: 'stopped before it ran',
}

export default function HandledCard({
  item,
  stillOpen = 0,
}: {
  item: HandledItem
  /** Signals still open on the order this action belongs to. */
  stillOpen?: number
}) {
  const d = DECIDED[item.tier]
  const href = item.orderId ? `/case/order/${item.orderId}` : null
  return (
    <li className="rounded-[14px] border border-hair bg-card shadow-[0_1px_2px_rgba(66,61,51,0.04),0_2px_10px_rgba(66,61,51,0.05)]">
      <div className="px-[18px] pt-[12px] pb-[12px]">
        <div className="flex flex-wrap items-center gap-[9px]">
          <span
            className={`inline-flex items-center gap-[5px] rounded-md px-2 py-[3px] text-[11.5px] font-semibold ${d.tone}`}
          >
            <Icon name={DECIDED_ICON[item.tier]} size={13} />
            {d.label}
          </span>
          {item.decision ? (
            <span className="text-[11.5px] text-secondary">
              {EDIT[item.decision] ?? item.decision.toLowerCase()}
            </span>
          ) : null}
          <span className="ml-auto font-mono text-[11px] tabular-nums text-secondary">
            {shortDate(item.at)}
          </span>
        </div>

        <h2 className="mt-[10px] font-display text-[15.5px] font-semibold leading-tight tracking-[-0.012em] text-label">
          {item.action}
        </h2>

        <div className="mt-[5px] flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-secondary">
          <span className="inline-flex items-center gap-[4px]">
            <Icon name="agent" size={12} className="text-teal" />
            {item.agent}
          </span>
          {item.orderRef ? <Code>{item.orderRef}</Code> : null}
          {item.amount ? <span className="text-tertiary">{item.amount}</span> : null}
        </div>

        {item.note ? (
          <blockquote className="mt-[9px] border-l-2 border-hair pl-[10px] text-[12.5px] leading-[1.45] text-body">
            {item.note}
            {item.reviewer ? (
              <span className="text-secondary"> — {deskName(item.reviewer)}</span>
            ) : null}
          </blockquote>
        ) : null}
      </div>

      {href ? (
        <Link
          href={href}
          className="flex items-center gap-[9px] border-t border-hair/60 px-[18px] py-[10px] text-[13px] transition-colors hover:bg-canvas/60"
        >
          {/* This action is finished. The order it belongs to may not be, so
              say which before sending anyone there. */}
          {stillOpen > 0 ? (
            <span className="inline-flex items-center gap-[6px] font-medium text-orange">
              <Icon name="warning" size={13} />
              {stillOpen} signal{stillOpen === 1 ? '' : 's'} still open on this
              order
            </span>
          ) : (
            <span className="inline-flex items-center gap-[6px] font-medium text-secondary">
              <Icon name="confirmed" size={13} className="text-green" />
              Nothing else open on this order
            </span>
          )}
          <span className="ml-auto text-tertiary">
            <Chevron />
          </span>
        </Link>
      ) : null}
    </li>
  )
}
