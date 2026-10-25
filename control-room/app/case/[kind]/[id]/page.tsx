// One case, opened.
//
// Two questions, in order: what is wrong, and what to do. Everything else —
// the evidence, the thread — is folded, because it is there to be checked, not
// read. Nothing on this page is written by a model; the proposals come from
// lib/propose.ts crossing the answer book with the records.
import { notFound } from 'next/navigation'
import { load } from '../../../../lib/data'
import {
  type ContextFact,
  type Tier,
  resolveRecord,
  vitalsOf,
} from '../../../../lib/context'
import { type Approval, type Proposal, proposeFor } from '../../../../lib/propose'
import { buildCases } from '../../../../lib/cases'
import { buildHandled } from '../../../../lib/handled'
import { routeOf, timelineOf, until } from '../../../../lib/route'
import RouteBar from '../../../components/route-bar'
import Shell from '../../../components/shell'
import { Chevron, Code, shortDate } from '../../../components/bits'
import { deskName, tableName } from '../../../../lib/labels'
import { Icon, type IconName } from '../../../components/icons'
import { DECIDED_ICON, badgeIcon } from '../../../components/glyphs'
import { AssignButton, ProposalActions } from './actions'

const CARD =
  'rounded-[14px] border border-hair bg-card shadow-[0_1px_2px_rgba(66,61,51,0.04),0_2px_10px_rgba(66,61,51,0.05)]'

const APPROVAL: Record<Approval, { label: string; tone: string; icon: IconName }> = {
  AGENT_SENDS: {
    label: 'BahnBot sends · no approval needed',
    tone: 'text-teal bg-teal/12',
    icon: 'agent',
  },
  NEEDS_APPROVAL: {
    label: 'Needs your approval',
    tone: 'text-orange bg-orange/12',
    icon: 'shield',
  },
  NEEDS_PERSON: { label: 'Needs a human', tone: 'text-red bg-red/12', icon: 'person' },
}

/** Text colour of the case tone, for the issue banner's icon. */
const TONE_TEXT: Record<string, string> = {
  critical: 'text-red',
  pending: 'text-orange',
  info: 'text-teal',
}

/** The vitals strip, keyed by its label. */
const VITAL_ICON: Record<string, IconName> = {
  Order: 'document',
  Orders: 'document',
  Car: 'car',
  Cars: 'car',
  Driver: 'person',
  Fee: 'euro',
  Ferry: 'ferry',
}

/** Left rule on the issue banner, coloured by how bad the case is. */
const BANNER: Record<string, string> = {
  critical: 'border-l-red',
  pending: 'border-l-orange',
  info: 'border-l-teal',
}

const TIER: Record<Tier, { label: string; dot: string }> = {
  RECORDED: { label: 'Recorded', dot: 'bg-green' },
  CLAIMED: { label: 'Claimed', dot: 'bg-orange' },
  UNESTABLISHED: { label: 'Not established', dot: 'bg-red' },
}

const LANGUAGE: Record<string, string> = {
  de: 'German',
  fi: 'Finnish',
  fr: 'French',
  da: 'Danish',
  en: 'English',
}

function Eyebrow({ children }: { children: string }) {
  return (
    <h2 className="mb-[9px] px-[2px] text-[12px] font-semibold tracking-[-0.005em] text-secondary">
      {children}
    </h2>
  )
}

function Fold({
  summary,
  icon,
  children,
}: {
  summary: string
  icon: IconName
  children: React.ReactNode
}) {
  return (
    <details className={`group ${CARD} px-[18px] py-[12px]`}>
      <summary className="flex cursor-pointer list-none items-center gap-[7px] text-[13px] text-teal [&::-webkit-details-marker]:hidden">
        <Icon name={icon} size={14} />
        <span className="font-medium">{summary}</span>
        <Chevron className="transition-transform group-open:rotate-90" />
      </summary>
      {children}
    </details>
  )
}

function RecordDump({ row }: { row: Record<string, unknown> }) {
  return (
    <dl className="mt-[9px] grid grid-cols-[minmax(0,130px)_1fr] gap-x-4 gap-y-[3px] rounded-[9px] bg-canvas px-[11px] py-[9px]">
      {Object.entries(row)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="truncate font-mono text-[11px] text-secondary">{k}</dt>
            <dd className="min-w-0 break-words font-mono text-[11px] text-label">
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </dd>
          </div>
        ))}
    </dl>
  )
}

function Fact({ fact }: { fact: ContextFact }) {
  const row = fact.source ? resolveRecord(fact.source) : null
  const body = (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[13px] leading-[1.45] text-body">{fact.label}</span>
        {fact.value ? (
          <span className="text-[13px] font-medium text-label">{fact.value}</span>
        ) : null}
      </div>
      {fact.caution ? (
        <p className="mt-[2px] flex gap-[5px] text-[12px] leading-[1.4] text-orange">
          <Icon name="warning" size={12} className="mt-[2px]" />
          {fact.caution}
        </p>
      ) : null}
      {fact.settles ? (
        <p className="mt-[2px] text-[12px] leading-[1.4] text-secondary">
          Settles with {fact.settles.replace(/^[A-Z]/, (c) => c.toLowerCase())}.
        </p>
      ) : null}
    </>
  )
  if (!row || !fact.source) return <li className="py-[8px]">{body}</li>
  return (
    <li>
      <details className="group/f py-[8px]">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {body}
          <span className="mt-[4px] inline-flex items-center gap-[4px] text-[11px] font-medium text-teal">
            <Icon name="view" size={12} />
            Show {tableName(fact.source.table)}
            <span className="transition-transform group-open/f:rotate-90">
              <Chevron />
            </span>
          </span>
        </summary>
        <RecordDump row={row} />
      </details>
    </li>
  )
}

function ProposalCard({
  p,
  lead,
  bare = false,
}: {
  p: Proposal
  lead: boolean
  /** Inside the decision panel: no card chrome, no repeated issue line. */
  bare?: boolean
}) {
  const a = APPROVAL[p.approval]
  const lang = p.draft?.language ?? 'en'
  return (
    <li
      className={
        bare
          ? 'border-t border-hair/60 px-[17px] pt-[13px] pb-[15px]'
          : `${CARD} px-[20px] pt-[15px] pb-[16px]`
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-[5px] rounded-md px-2 py-[3px] text-[11.5px] font-semibold ${a.tone}`}
        >
          <Icon name={a.icon} size={13} />
          {a.label}
        </span>
        {lead ? (
          <span className="inline-flex items-center gap-[4px] text-[11.5px] font-medium text-tertiary">
            <Icon name="check" size={12} />
            Recommended
          </span>
        ) : null}
      </div>

      <h3 className="mt-[10px] text-[16px] font-semibold leading-[1.3] tracking-[-0.012em] text-label">
        {p.title}
      </h3>
      {bare ? null : (
        <p className="mt-[4px] text-[12.5px] leading-[1.45] text-secondary">
          {p.because}
        </p>
      )}

      {p.draft ? (
        <div className="mt-[11px] rounded-[10px] border border-hair bg-canvas px-[13px] py-[11px]">
          <div className="mb-[6px] flex items-center gap-2">
            <span className="inline-flex items-center gap-[5px] text-[11.5px] font-medium text-secondary">
              <Icon name={p.draft.kind === 'DRAFT' ? 'mail' : 'open-check'} size={12} />
              {p.draft.kind === 'DRAFT'
                ? `To ${p.draft.to}`
                : 'The reply must establish'}
            </span>
            {lang !== 'en' ? (
              <span className="inline-flex items-center gap-[3px] rounded bg-teal/12 px-[5px] py-[1px] text-[10.5px] font-semibold uppercase text-teal">
                <Icon name="globe" size={10} />
                sends in {LANGUAGE[lang] ?? lang}
              </span>
            ) : null}
          </div>
          <p
            className={
              p.draft.kind === 'DRAFT'
                ? 'text-[13.5px] leading-[1.55] text-label'
                : 'text-[13.5px] leading-[1.55] text-body italic'
            }
          >
            {p.draft.body}
          </p>
          {p.draft.kind === 'SPEC' ? (
            <p className="mt-[7px] text-[11px] text-tertiary">
              Wording is the agent&apos;s job. The facts it may use are cited
              below; the facts it must not assert are listed beside them.
            </p>
          ) : null}
        </div>
      ) : null}

      <dl className="mt-[12px] space-y-[5px]">
        <div className="flex gap-3">
          <dt className="w-[66px] shrink-0 text-[11.5px] text-secondary">Changes</dt>
          <dd className="text-[12.5px] leading-[1.45] text-body">
            {p.changes.join(' ')}
          </dd>
        </div>
        {p.approver ? (
          <div className="flex gap-3">
            <dt className="w-[66px] shrink-0 text-[11.5px] text-secondary">
              Decided by
            </dt>
            <dd className="text-[12.5px] text-body">{deskName(p.approver)}</dd>
          </div>
        ) : null}
        <div className="flex gap-3">
          <dt className="w-[66px] shrink-0 text-[11.5px] text-secondary">
            Does not
          </dt>
          <dd className="text-[12.5px] leading-[1.45] text-body">
            {p.unchanged.join(' ')}
          </dd>
        </div>
      </dl>

      <div className="mt-[12px] flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hair/60 pt-[11px]">
        {p.withheld.length ? (
          <details className="group/w">
            <summary className="flex cursor-pointer list-none items-center gap-[5px] text-[12px] font-medium text-orange [&::-webkit-details-marker]:hidden">
              <Icon name="lock" size={12} />
              {p.withheld.length} things it will not say
              <Chevron className="transition-transform group-open/w:rotate-90" />
            </summary>
            <ul className="mt-[7px] flex flex-col gap-[4px]">
              {p.withheld.map((w) => (
                <li
                  key={w}
                  className="flex gap-2 text-[12px] leading-[1.4] text-secondary"
                >
                  <Icon name="blocked" size={11} className="mt-[3px] text-red" />
                  {w}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <ProposalActions
          id={p.id}
          approval={p.approval}
          draft={p.draft?.kind === 'DRAFT' ? p.draft.body : null}
        />
      </div>

      {p.basis ? (
        <p className="mt-[10px] flex items-center gap-[5px] text-[11px] text-tertiary">
          <Icon name="book" size={11} />
          From the answer book · {p.basis.topic}
        </p>
      ) : null}
    </li>
  )
}

export default async function CasePage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>
}) {
  const { kind, id } = await params
  const key = `${kind}:${id}`
  const data = load()
  const result = proposeFor(key, data)
  if (!result) notFound()
  const { context, proposals } = result

  const summary = buildCases(data).find((c) => c.key === key)
  const driverName = context.driver?.display_name ?? 'the driver'
  const tiers: Tier[] = ['RECORDED', 'CLAIMED', 'UNESTABLISHED']
  const count = (t: Tier) => context.facts.filter((f) => f.tier === t).length
  const primaryOrder = context.orderRefs.length
    ? data.orders.find((o) => o.reference === context.orderRefs[0])?.id ?? null
    : null
  const route = primaryOrder ? routeOf(primaryOrder, data) : null
  const timeline = primaryOrder ? timelineOf(primaryOrder, data) : null
  // Arriving from Resolved, you should see the thing you clicked. These are the
  // actions already closed on this order — history, not pending work.
  const orderIds = new Set(
    context.orderRefs
      .map((r) => data.orders.find((o) => o.reference === r)?.id)
      .filter((id): id is string => Boolean(id)),
  )
  const settled = buildHandled(data).items.filter(
    (i) => i.orderId && orderIds.has(i.orderId),
  )
  const vitals = vitalsOf(context, data)
  const lead = proposals[0] ?? null
  const rest = proposals.slice(1)
  const impact =
    timeline?.nextLabel && timeline.hoursToNext !== null
      ? `${timeline.nextLabel} in ${until(timeline.hoursToNext)}`
      : null

  return (
    <Shell active="cases" back="Cases">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-bold leading-[1.12] tracking-[-0.025em] text-label">
            {context.title}
          </h1>
          <p className="mt-[4px] text-[13px] text-secondary">{context.subtitle}</p>
        </div>
        <AssignButton caseKey={key} />
      </header>

      {/* The problem, and the move, before anything else. */}
      <section
        className={`mt-6 overflow-hidden rounded-[14px] border border-hair bg-card shadow-[0_1px_2px_rgba(66,61,51,0.04),0_2px_10px_rgba(66,61,51,0.05)]`}
      >
        <div className={`border-l-[3px] ${BANNER[summary?.tone ?? 'pending']} px-[17px] py-[14px]`}>
          <p className="text-[12px] font-semibold tracking-[-0.005em] text-secondary">
            Issue to resolve
          </p>
          <p className="mt-[7px] flex items-center gap-[8px] text-[16.5px] font-semibold leading-[1.35] tracking-[-0.012em] text-label">
            <Icon
              name={summary ? badgeIcon(summary.badge) : 'person'}
              size={18}
              className={TONE_TEXT[summary?.tone ?? 'pending']}
            />
            {summary?.badge ?? 'Needs a human'}
          </p>
          <p className="mt-[5px] max-w-[66ch] text-[13.5px] leading-[1.5] text-body">
            {summary?.brief ?? context.facts[0]?.label}
          </p>
          {impact ? (
            <p className="mt-[9px] flex flex-wrap items-center gap-x-2 text-[13px]">
              <span className="inline-flex items-center gap-[5px] text-secondary">
                <Icon name="clock" size={13} />
                Impact
              </span>
              <span className="font-medium text-orange">{impact}</span>
            </p>
          ) : null}
        </div>

        <RouteBar route={route} timeline={timeline} />

        {vitals.length ? (
          <dl className="grid grid-cols-1 gap-x-8 border-t border-hair/60 px-[17px] py-[12px] sm:grid-cols-2">
            {vitals.map((v) => (
              <div
                key={v.label}
                className="flex items-baseline gap-3 border-b border-hair/60 py-[5px] last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
              >
                <dt className="flex w-[62px] shrink-0 items-center gap-[5px] self-center text-[12px] text-secondary">
                  <Icon name={VITAL_ICON[v.label] ?? 'info'} size={12} />
                  {v.label}
                </dt>
                <dd
                  className={
                    'min-w-0 text-[12.5px] ' +
                    (v.tone === 'unknown'
                      ? 'font-medium text-red'
                      : v.tone === 'risk'
                        ? 'font-medium text-orange'
                        : 'text-label')
                  }
                >
                  {v.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {lead ? <ProposalCard p={lead} lead bare /> : null}
      </section>

      {rest.length ? (
        <section id="what-to-do" className="mt-7 scroll-mt-[64px]">
          <Eyebrow>
            {rest.length === 1 ? 'One other option' : `${rest.length} other options`}
          </Eyebrow>
          <ul className="flex flex-col gap-[11px]">
            {rest.map((p) => (
              <ProposalCard key={p.id} p={p} lead={false} />
            ))}
          </ul>
        </section>
      ) : null}

      {!lead ? (
        <section className="mt-7">
          <Eyebrow>What to do</Eyebrow>
          <div className={`${CARD} px-[18px] py-[14px]`}>
            <p className="text-[13.5px] text-secondary">
              Nothing to propose. The records do not contain an action this case
              needs, which usually means it is waiting on somebody outside Bahn.
            </p>
          </div>
        </section>
      ) : null}

      {settled.length ? (
        <section className="mt-7">
          <Eyebrow>Already resolved</Eyebrow>
          <ul className={`${CARD} px-[18px] py-[4px]`}>
            {settled.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hair/60 py-[10px] last:border-b-0"
              >
                <span className="inline-flex items-center gap-[6px] self-center text-[13px] text-label">
                  <Icon
                    name={DECIDED_ICON[i.tier]}
                    size={13}
                    className={
                      i.tier === 'autonomous'
                        ? 'text-green'
                        : i.tier === 'stopped'
                          ? 'text-red'
                          : 'text-teal'
                    }
                  />
                  {i.action}
                </span>
                <span className="text-[12px] text-secondary">
                  {i.tier === 'autonomous'
                    ? 'BahnBot, no approval needed'
                    : i.decision === 'REJECTED'
                      ? `stopped by ${deskName(i.reviewer ?? '')}`
                      : i.decision === 'EDITED'
                        ? `edited and approved by ${deskName(i.reviewer ?? '')}`
                        : `approved by ${deskName(i.reviewer ?? '')}`}
                </span>
                <span className="ml-auto font-mono text-[11.5px] tabular-nums text-tertiary">
                  {shortDate(i.at)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-[8px] px-[2px] text-[11.5px] leading-[1.5] text-tertiary">
            Closed already. Anything above this is what the order still needs.
          </p>
        </section>
      ) : null}

      <section className="mt-8">
        <Eyebrow>Evidence and history</Eyebrow>
        <div className="flex flex-col gap-[9px]">
          <Fold
            icon="open-check"
            summary={`${count('RECORDED')} recorded, ${count('CLAIMED')} claimed, ${count('UNESTABLISHED')} not established`}
          >
            <div className="mt-[4px]">
              {tiers.map((tier) => {
                const facts = context.facts.filter((f) => f.tier === tier)
                if (!facts.length) return null
                return (
                  <div key={tier} className="border-t border-hair/60 first:border-t-0">
                    <div className="flex items-center gap-[7px] pt-[11px] pb-[2px]">
                      <span className={`size-[6px] rounded-full ${TIER[tier].dot}`} />
                      <span className="text-[12px] font-semibold tracking-[-0.005em] text-label">
                        {TIER[tier].label}
                      </span>
                    </div>
                    <ul className="divide-y divide-hair/60 pb-[4px]">
                      {facts.map((f, n) => (
                        <Fact key={`${f.label}-${n}`} fact={f} />
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </Fold>

          <Fold icon="message" summary={`Read all ${context.asked.length} messages`}>
            <div className="mt-[4px] divide-y divide-hair/60">
              {context.asked.map((m) => {
                const isDriver = m.who === 'driver'
                return (
                  <div key={m.id} className="py-[10px]">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-secondary">
                      <span
                        className={
                          isDriver
                            ? 'font-semibold text-label'
                            : m.internal
                              ? 'font-medium text-orange'
                              : 'font-medium text-secondary'
                        }
                      >
                        {isDriver ? driverName : m.internal ? 'Internal note' : 'Bahn'}
                      </span>
                      <span className="font-mono tabular-nums text-tertiary">
                        {m.at.slice(5, 16).replace('T', ' ')}
                      </span>
                      <Code>{m.channel}</Code>
                      {m.language && m.language !== 'en' ? (
                        <span className="rounded bg-teal/12 px-[5px] py-[1px] font-semibold uppercase text-teal">
                          {m.language}
                        </span>
                      ) : null}
                      <span className="ml-auto text-tertiary">{m.thread}</span>
                    </div>
                    <p
                      className={
                        'mt-[4px] text-[13px] leading-[1.5] ' +
                        (isDriver ? 'text-label' : 'text-secondary')
                      }
                    >
                      {m.body}
                    </p>
                  </div>
                )
              })}
            </div>
          </Fold>
        </div>
      </section>
    </Shell>
  )
}
