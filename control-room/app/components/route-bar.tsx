// Where and when, in one strip.
//
// Dates sit under the place they belong to rather than in a second row, and a
// middle milestone (a ferry check-in) sits under the leg it gates. Everything
// is from records: a ferry leg says whether a booking exists, never whether one
// was attempted.
import type { RouteView, TimelineView } from '../../lib/route'
import { until } from '../../lib/route'
import { Icon } from './icons'

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

export default function RouteBar({
  route,
  timeline,
}: {
  route: RouteView | null
  timeline: TimelineView | null
}) {
  if (!route && !timeline) return null

  const ms = timeline?.milestones ?? []
  const firstDate = ms[0] ?? null
  const lastDate = ms.length > 1 ? ms[ms.length - 1] : null
  const middle = ms.slice(1, -1)

  return (
    <div className="border-t border-hair/60 px-[17px] py-[13px]">
      {route ? (
        <div className="flex items-start justify-between gap-3">
          {route.legs.map((leg, i) => {
            const isFirst = i === 0
            const isLast = i === route.legs.length - 1
            if (leg.kind === 'PLACE') {
              const stamp = isFirst ? firstDate : isLast ? lastDate : null
              return (
                <div
                  key={i}
                  className={`min-w-0 shrink-0 ${isLast ? 'text-right' : ''}`}
                >
                  <p
                    className={`flex items-center gap-[5px] text-[13.5px] font-semibold leading-tight text-label ${isLast ? 'justify-end' : ''}`}
                  >
                    <Icon name="pin" size={14} className="text-secondary" />
                    <span className="truncate">{leg.label}</span>
                  </p>
                  {leg.sub ? (
                    <p className="truncate text-[11.5px] leading-tight text-secondary">
                      {leg.sub}
                    </p>
                  ) : null}
                  {stamp ? (
                    <p
                      className={
                        'mt-[2px] truncate text-[11.5px] leading-tight ' +
                        (stamp.passed
                          ? 'text-tertiary'
                          : stamp.tone === 'risk'
                            ? 'font-medium text-orange'
                            : 'text-secondary')
                      }
                    >
                      {stamp.label} {day(stamp.at)}
                      {stamp.passed ? (
                        <Icon name="check" size={11} className="ml-[3px] inline align-[-1px] text-green" />
                      ) : null}
                    </p>
                  ) : null}
                </div>
              )
            }
            const colour =
              leg.tone === 'unknown'
                ? 'text-red'
                : leg.tone === 'risk'
                  ? 'text-orange'
                  : 'text-secondary'
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center px-1">
                <p className={`truncate text-[11.5px] font-medium leading-tight ${colour}`}>
                  {leg.label}
                </p>
                <div className="my-[4px] flex w-full items-center gap-[3px]">
                  <span className="h-[1px] flex-1 bg-sand" />
                  {/* What carries the car over this stretch. */}
                  <Icon
                    name={leg.label.startsWith('Ferry') ? 'ferry' : 'car'}
                    size={14}
                    className={leg.tone === 'unknown' ? 'text-red' : 'text-secondary'}
                  />
                  <span className="h-[1px] flex-1 bg-sand" />
                  <Icon name="chevron-right" size={9} className="text-sand" />
                </div>
                {leg.sub ? (
                  <p className="truncate text-[11px] leading-tight text-tertiary">
                    {leg.sub}
                  </p>
                ) : null}
                {middle.map((m) => (
                  <p
                    key={m.label}
                    className="mt-[2px] truncate text-[11px] leading-tight text-red"
                  >
                    {m.label} {day(m.at)}
                  </p>
                ))}
              </div>
            )
          })}
        </div>
      ) : null}

      {timeline ? (
        <div className="mt-[12px]">
          <div className="relative h-[3px] rounded-full bg-hair">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-sand"
              style={{ width: `${timeline.nowAt * 100}%` }}
            />
            <span
              className="absolute top-[-3px] size-[9px] -translate-x-1/2 rounded-full border-2 border-card bg-label"
              style={{ left: `${timeline.nowAt * 100}%` }}
              aria-hidden
            />
          </div>
          {timeline.nextLabel && timeline.hoursToNext !== null ? (
            <p className="mt-[8px] flex flex-wrap items-center gap-x-2 text-[12.5px]">
              <span className="inline-flex items-center gap-[5px] text-secondary">
                <Icon name="clock" size={13} />
                Next
              </span>
              <span
                className={
                  'font-semibold ' +
                  (timeline.hoursToNext < 12 ? 'text-red' : 'text-label')
                }
              >
                {timeline.nextLabel} in {until(timeline.hoursToNext)}
              </span>
              {route?.distanceKm ? (
                <span className="ml-auto text-[11.5px] text-tertiary">
                  {route.mode} · {route.distanceKm.toLocaleString('en-GB')} km
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
