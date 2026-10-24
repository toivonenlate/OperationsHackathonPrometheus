'use client'
// The interactive half of the ops map.
//
// One piece of state drives everything: the filters decide which orders exist,
// the time brush decides which of them were touched in a window, and the
// selection decides what the inspector shows. The map, the list, the KPIs, the
// timeline and the feed all read from the same derived set, so they never
// disagree about what is on screen.
import Link from 'next/link'
import { Suspense, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LngLatBoundsLike, Map as Basemap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { OpsEvent, OpsModel, OpsOrder, Risk } from '../../lib/ops'
import { MARKETS, type MarketCode, type NewsKind, type Watch, localDay } from '../../lib/markets'
import { commandName, codeName } from '../../lib/labels'
import { Icon, type IconName } from '../components/icons'

/* ---------------------------------------------------------------- tokens */

// Status, Bahn's own semantics: red danger, orange risk, teal live, green done.
const RISK: Record<Risk, { colour: string; label: string; icon: IconName }> = {
  critical: { colour: 'var(--color-red)', label: 'Needs a human', icon: 'warning' },
  warn: { colour: 'var(--color-orange)', label: 'Open case or alert', icon: 'alert' },
  moving: { colour: 'var(--color-teal)', label: 'On the road', icon: 'car' },
  done: { colour: 'var(--color-green)', label: 'Delivered', icon: 'confirmed' },
  idle: { colour: 'var(--color-tertiary)', label: 'Not moving yet', icon: 'waiting' },
}
const RISK_ORDER: Risk[] = ['idle', 'done', 'moving', 'warn', 'critical']

// Who acted. Categorical, validated against the night surface (all six checks pass).
const ACTORS: { key: OpsEvent['actor']; label: string; colour: string }[] = [
  { key: 'operator', label: 'Operators', colour: '#3987e5' },
  { key: 'driver', label: 'Drivers', colour: '#c98500' },
  { key: 'agent', label: 'BahnBot', colour: '#9085e9' },
  { key: 'other', label: 'System & others', colour: '#d55181' },
]
const ACTOR_COLOUR = Object.fromEntries(ACTORS.map((a) => [a.key, a.colour]))

const LANES = ['intake', 'ready', 'market', 'booked', 'moving', 'delivered', 'cancelled']

const PANEL = 'rounded-[10px] border border-hair bg-card'
const CAPTION =
  'flex items-center gap-[6px] font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-tertiary'

const BIN_H = 6
const HOUR = 3_600_000

/* ---------------------------------------------------------------- format */

function stamp(t: number): string {
  return new Date(t).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

function hours(h: number): string {
  const a = Math.abs(h)
  const s = a < 1 ? `${Math.round(a * 60)} min` : a < 48 ? `${Math.floor(a)} h` : `${Math.floor(a / 24)} d ${Math.round(a % 24)} h`
  return h < 0 ? `${s} ago` : `in ${s}`
}

/* ---------------------------------------------------------------- map geometry */

// CARTO's dark basemap without place names: the lanes carry the labels that
// matter, and the streets underneath only need to say where things are.
const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'

// Close enough to Helsinki that a label would sit on top of it until zoomed in.
const QUIET_LABEL = new Set(['Espoo', 'Vantaa'])

// Two decimals is finer than a pixel and keeps re-renders cheap to diff.
const r2 = (n: number) => Math.round(n * 100) / 100

// The overlay is drawn once in Web Mercator "world" units (the map's pixel
// space at zoom 6) and the camera is applied as a transform. With no rotation
// or pitch, MapLibre's camera is exactly a scale plus a shift of these units.
const WORLD = 512 * 2 ** 6

function toWorld([lon, lat]: [number, number]): [number, number] {
  const s = Math.sin((lat * Math.PI) / 180)
  return [
    r2(((lon + 180) / 360) * WORLD),
    r2((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD),
  ]
}

/** The box around a set of [lon, lat] points. */
function boundsOf(points: [number, number][]): LngLatBoundsLike | null {
  if (!points.length) return null
  const lons = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ]
}

type Arc = { d: string; at: (t: number) => [number, number] }

/** A gentle bow between two cities, so lanes sharing a corridor stay apart. */
function arc(a: [number, number], b: [number, number], bend: number): Arc {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const cx = r2(mx - dy * bend)
  const cy = r2(my + dx * bend)
  return {
    d: `M${a[0]},${a[1]} Q${cx},${cy} ${b[0]},${b[1]}`,
    at: (t) => [
      r2((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * cx + t * t * b[0]),
      r2((1 - t) ** 2 * a[1] + 2 * (1 - t) * t * cy + t * t * b[1]),
    ],
  }
}

/* ---------------------------------------------------------------- state */

type Selection = { kind: 'order'; id: string } | { kind: 'city'; name: string } | null

// Which transfers the map is about: across a border, or inside one country.
type Scope = 'ALL' | 'INTL' | 'FI' | 'DK' | 'DE'
const SCOPES: { key: Scope; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'INTL', label: 'International' },
  { key: 'FI', label: 'Finland' },
  { key: 'DK', label: 'Denmark' },
  { key: 'DE', label: 'Germany' },
]

function inScope(o: OpsOrder, scope: Scope): boolean {
  if (scope === 'ALL') return true
  if (scope === 'INTL') return o.fromCountry !== o.toCountry
  return o.fromCountry === scope && o.toCountry === scope
}

type Filters = {
  q: string
  lanes: Set<string>
  scope: Scope
  cases: boolean
  alerts: boolean
  ferry: boolean
}

const NO_FILTERS: Filters = {
  q: '',
  lanes: new Set(),
  scope: 'ALL',
  cases: false,
  alerts: false,
  ferry: false,
}

function matches(o: OpsOrder, f: Filters): boolean {
  if (f.lanes.size && !f.lanes.has(o.lane)) return false
  if (!inScope(o, f.scope)) return false
  if (f.cases && !o.caseKey) return false
  if (f.alerts && !o.alerts.length) return false
  if (f.ferry && !o.ferry) return false
  if (f.q) {
    const q = f.q.toLowerCase()
    const hay = [o.ref, o.from, o.to, o.driver, o.vehicle, o.caseTitle].join(' ').toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

/* ================================================================ console */

export default function Console({ model, watch }: { model: OpsModel; watch: Promise<Watch> }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [range, setRange] = useState<[number, number] | null>(null)
  const [selected, setSelected] = useState<Selection>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selected) setSelected(null)
      else if (range) setRange(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, range])

  const orderById = useMemo(() => new Map(model.orders.map((o) => [o.id, o])), [model])

  const visible = useMemo(
    () => model.orders.filter((o) => matches(o, filters)),
    [model, filters],
  )
  const visibleIds = useMemo(() => new Set(visible.map((o) => o.id)), [visible])
  const filtered = visible.length !== model.orders.length

  // Events for the orders in view. Unlinked events only count when nothing is filtered.
  const events = useMemo(
    () => model.events.filter((e) => (e.orderId ? visibleIds.has(e.orderId) : !filtered)),
    [model, visibleIds, filtered],
  )

  // Orders touched inside the brushed window. Null means no window, so all count.
  const touched = useMemo(() => {
    if (!range) return null
    const s = new Set<string>()
    for (const e of events) if (e.orderId && e.t >= range[0] && e.t < range[1]) s.add(e.orderId)
    return s
  }, [events, range])

  const selOrder = selected?.kind === 'order' ? (orderById.get(selected.id) ?? null) : null

  const toggleLane = (lane: string) =>
    setFilters((f) => {
      const lanes = new Set(f.lanes)
      if (lanes.has(lane)) lanes.delete(lane)
      else lanes.add(lane)
      return { ...f, lanes }
    })

  const pick = (id: string) =>
    setSelected((s) => (s?.kind === 'order' && s.id === id ? null : { kind: 'order', id }))

  const anyFilter =
    filters.q || filters.lanes.size || filters.scope !== 'ALL' || filters.cases || filters.alerts || filters.ferry

  return (
    <div className="text-body">
      {/* Same title block as every other view, so the heading never moves between tabs. */}
      <header className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div>
          <h1 className="font-display text-[29px] font-bold leading-[1.1] tracking-[-0.025em] text-label">
            Ops map
          </h1>
          <p className="mt-[7px] text-[14px] leading-[1.5] text-secondary">
            {model.orders.length} orders, as of the snapshot
          </p>
        </div>
        <Clocks
          watch={watch}
          scope={filters.scope}
          setScope={(scope) => setFilters((f) => ({ ...f, scope }))}
        />
        <Kpis
          orders={touched ? visible.filter((o) => touched.has(o.id)) : visible}
          filters={filters}
          setFilters={setFilters}
        />
      </header>

      <FilterBar
        model={model}
        filters={filters}
        setFilters={setFilters}
        toggleLane={toggleLane}
        anyFilter={Boolean(anyFilter)}
      />

      <div className="mt-3 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
        <OrderList
          orders={visible}
          touched={touched}
          selectedId={selOrder?.id ?? null}
          pick={pick}
        />
        <MapPanel
          model={model}
          orders={visible}
          scope={filters.scope}
          setScope={(scope) => setFilters((f) => ({ ...f, scope }))}
          touched={touched}
          selected={selected}
          setSelected={setSelected}
          pick={pick}
        />
        <Inspector
          model={model}
          orders={visible}
          selected={selected}
          selOrder={selOrder}
          setSelected={setSelected}
          pick={pick}
          toggleLane={toggleLane}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Timeline
          events={events}
          snapshot={model.snapshot}
          range={range}
          setRange={setRange}
          marks={selOrder ? model.events.filter((e) => e.orderId === selOrder.id) : []}
        />
        <Feed
          events={events}
          range={range}
          selOrder={selOrder}
          orderById={orderById}
          pick={pick}
        />
      </div>

      <Suspense fallback={<WatchSkeleton />}>
        <WatchPanel
          watch={watch}
          orders={model.orders}
          snapshot={model.snapshot}
          scope={filters.scope}
          setScope={(scope) => setFilters((f) => ({ ...f, scope }))}
        />
      </Suspense>

      <p className="mt-4 font-mono text-[10.5px] leading-[1.6] text-tertiary">
        Lanes join pickup and delivery city centres. A moving car sits at its last
        reported progress along its lane, not at a known position. Esc clears the
        selection, then the time window.
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- KPIs */

function Kpis({
  orders,
  filters,
  setFilters,
}: {
  orders: OpsOrder[]
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
}) {
  const moving = orders.filter((o) => o.status === 'IN_TRANSIT')
  const cases = new Set(orders.map((o) => o.caseKey).filter(Boolean)).size
  const alerts = orders.reduce((n, o) => n + o.alerts.length, 0)
  const due = orders.filter((o) => o.hoursToNext !== null && o.hoursToNext > 0 && o.hoursToNext < 24).length
  const km = moving.reduce((n, o) => n + (o.remainingKm ?? 0), 0)

  const cells: {
    label: string
    value: string
    tone?: string
    on?: boolean
    toggle?: () => void
  }[] = [
    { label: 'Orders', value: String(orders.length) },
    { label: 'Moving', value: String(moving.length), tone: 'text-teal' },
    {
      label: 'Cases',
      value: String(cases),
      tone: cases ? 'text-red' : undefined,
      on: filters.cases,
      toggle: () => setFilters((f) => ({ ...f, cases: !f.cases })),
    },
    {
      label: 'Alerts',
      value: String(alerts),
      tone: alerts ? 'text-orange' : undefined,
      on: filters.alerts,
      toggle: () => setFilters((f) => ({ ...f, alerts: !f.alerts })),
    },
    { label: 'Due 24 h', value: String(due), tone: due ? 'text-orange' : undefined },
    { label: 'Km left', value: km.toLocaleString('en-GB') },
  ]

  return (
    <dl className="ml-auto grid grid-cols-3 overflow-hidden rounded-[10px] border border-hair bg-hair sm:grid-cols-6" style={{ gap: 1 }}>
      {cells.map((c) => {
        const body = (
          <>
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-tertiary">{c.label}</dt>
            <dd className={`mt-[3px] font-mono text-[19px] font-semibold tabular-nums leading-none ${c.tone ?? 'text-label'}`}>
              {c.value}
            </dd>
          </>
        )
        return c.toggle ? (
          <button
            key={c.label}
            type="button"
            onClick={c.toggle}
            aria-pressed={c.on}
            title={c.on ? 'Showing only these. Click to show all.' : 'Click to show only these'}
            className={`min-w-[76px] px-[11px] py-[8px] text-left transition-colors ${c.on ? 'bg-birch shadow-[inset_0_-2px_0_var(--color-label)]' : 'bg-card hover:bg-birch'}`}
          >
            {body}
          </button>
        ) : (
          <div key={c.label} className="min-w-[76px] bg-card px-[11px] py-[8px]">
            {body}
          </div>
        )
      })}
    </dl>
  )
}

/* ---------------------------------------------------------------- filters */

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        'inline-flex items-center gap-[5px] rounded-[6px] border px-[8px] py-[3px] font-mono text-[11px] transition-colors ' +
        (on
          ? 'border-label bg-label text-canvas'
          : 'border-hair bg-card text-secondary hover:border-sand hover:text-label')
      }
    >
      {children}
    </button>
  )
}

function FilterBar({
  model,
  filters,
  setFilters,
  toggleLane,
  anyFilter,
}: {
  model: OpsModel
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
  toggleLane: (lane: string) => void
  anyFilter: boolean
}) {
  const laneCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of model.orders) m.set(o.lane, (m.get(o.lane) ?? 0) + 1)
    return m
  }, [model])

  return (
    <div className="mt-4 flex flex-wrap items-center gap-[6px]">
      <label className="relative mr-1">
        <Icon name="search" size={13} className="pointer-events-none absolute left-[8px] top-1/2 -translate-y-1/2 text-tertiary" />
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder="Reference, city, driver, car"
          aria-label="Search orders"
          className="w-[230px] rounded-[6px] border border-hair bg-card py-[4px] pl-[27px] pr-[8px] font-mono text-[11.5px] text-label outline-none placeholder:text-tertiary focus:border-sand"
        />
      </label>
      <span className={`${CAPTION} mx-1`}>Lane</span>
      {LANES.filter((l) => laneCount.get(l)).map((l) => (
        <Chip key={l} on={filters.lanes.has(l)} onClick={() => toggleLane(l)}>
          {l}
          <span className="tabular-nums opacity-60">{laneCount.get(l)}</span>
        </Chip>
      ))}
      <Chip on={filters.ferry} onClick={() => setFilters((f) => ({ ...f, ferry: !f.ferry }))}>
        <Icon name="ferry" size={12} />
        ferry
      </Chip>
      {anyFilter ? (
        <button
          type="button"
          onClick={() => setFilters(NO_FILTERS)}
          className="ml-1 inline-flex items-center gap-[4px] font-mono text-[11px] text-teal hover:underline"
        >
          <Icon name="close" size={11} />
          clear
        </button>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------- list */

const RANK: Record<Risk, number> = { critical: 0, warn: 1, moving: 2, idle: 3, done: 4 }

function OrderList({
  orders,
  touched,
  selectedId,
  pick,
}: {
  orders: OpsOrder[]
  touched: Set<string> | null
  selectedId: string | null
  pick: (id: string) => void
}) {
  const sorted = useMemo(
    () =>
      [...orders].sort(
        (a, b) =>
          RANK[a.risk] - RANK[b.risk] ||
          (b.caseScore ?? 0) - (a.caseScore ?? 0) ||
          (a.hoursToNext ?? 1e9) - (b.hoursToNext ?? 1e9),
      ),
    [orders],
  )

  // Keep the selected row in sight when the selection comes from the map.
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (!selectedId) return
    listRef.current
      ?.querySelector(`[data-id="${selectedId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  return (
    <section className={`${PANEL} flex h-[300px] flex-col lg:h-[640px]`}>
      <p className={`${CAPTION} border-b border-hair px-[12px] py-[9px]`}>
        <Icon name="menu" size={12} />
        Orders
        <span className="ml-auto tabular-nums">{orders.length}</span>
      </p>
      <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {sorted.map((o) => {
          const on = o.id === selectedId
          const dim = !on && touched && !touched.has(o.id)
          return (
            <li key={o.id} data-id={o.id}>
              <button
                type="button"
                onClick={() => pick(o.id)}
                className={
                  'flex w-full items-center gap-[8px] border-b border-hair/60 px-[12px] py-[7px] text-left transition-colors ' +
                  (on ? 'bg-birch shadow-[inset_2px_0_0_var(--color-label)]' : 'hover:bg-birch/60') +
                  (dim ? ' opacity-35' : '')
                }
              >
                <span
                  className="size-[7px] shrink-0 rounded-full"
                  style={{ background: RISK[o.risk].colour }}
                  title={RISK[o.risk].label}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-[6px]">
                    <span className="font-mono text-[11.5px] text-label">{o.ref}</span>
                    {o.ferry ? <Icon name="ferry" size={11} className="self-center text-tertiary" /> : null}
                    <span className="ml-auto font-mono text-[10px] uppercase text-tertiary">{o.lane}</span>
                  </span>
                  <span className="block truncate text-[11.5px] text-secondary">
                    {o.from} → {o.to}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {!orders.length ? (
          <li className="px-[12px] py-[14px] text-[12px] text-secondary">No order matches these filters.</li>
        ) : null}
      </ul>
    </section>
  )
}

/* ---------------------------------------------------------------- map */

type Tip = { x: number; y: number; body: React.ReactNode } | null

function MapPanel({
  model,
  orders,
  scope,
  setScope,
  touched,
  selected,
  setSelected,
  pick,
}: {
  model: OpsModel
  orders: OpsOrder[]
  scope: Scope
  setScope: (s: Scope) => void
  touched: Set<string> | null
  selected: Selection
  setSelected: (s: Selection) => void
  pick: (id: string) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Basemap | null>(null)
  const [tip, setTip] = useState<Tip>(null)
  const [ready, setReady] = useState(false)
  // Only the label rule depends on zoom, so only crossing that line re-renders.
  const [close, setClose] = useState(false)
  const [offline, setOffline] = useState(false)
  const lanesRef = useRef<SVGGElement>(null)
  const markersRef = useRef<SVGGElement>(null)

  // Moves the overlay to the camera. Runs inside MapLibre's own render, so the
  // lanes and the basemap are painted in the same frame; React is not involved.
  // Lanes take one transform; markers each take a translate so they keep their size.
  const sync = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const c = map.getCenter()
    const k = (512 * 2 ** map.getZoom()) / WORLD
    const [wx, wy] = toWorld([c.lng, c.lat])
    const p = map.project(c)
    const tx = p.x - k * wx
    const ty = p.y - k * wy
    lanesRef.current?.setAttribute('transform', `matrix(${k} 0 0 ${k} ${tx} ${ty})`)
    markersRef.current?.querySelectorAll<SVGGElement>('[data-wx]').forEach((el) => {
      el.setAttribute(
        'transform',
        `translate(${k * Number(el.dataset.wx) + tx} ${k * Number(el.dataset.wy) + ty})`,
      )
    })
  }, [])

  // New markers mount without a position; place them before the browser paints.
  useLayoutEffect(sync)

  const place = (e: React.MouseEvent, body: React.ReactNode) => {
    const r = wrap.current?.getBoundingClientRect()
    if (!r) return
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, body })
  }

  const scopeCount = useMemo(
    () => Object.fromEntries(SCOPES.map((s) => [s.key, model.orders.filter((o) => inScope(o, s.key)).length])),
    [model],
  )

  // The camera follows the scope, not the other filters: narrowing to "alerts"
  // should not fly the map away from what you were looking at.
  const scopeBounds = useMemo(() => {
    const pts: [number, number][] = []
    for (const o of model.orders) {
      if (!inScope(o, scope)) continue
      if (model.cities[o.from]) pts.push(model.cities[o.from])
      if (model.cities[o.to]) pts.push(model.cities[o.to])
    }
    return boundsOf(pts)
  }, [model, scope])

  const fit = (animate = true) => {
    const map = mapRef.current
    if (!map || !scopeBounds) return
    map.fitBounds(scopeBounds, {
      padding: { top: 76, bottom: 64, left: 50, right: 60 },
      maxZoom: 9,
      duration: animate ? 1100 : 0,
    })
  }

  // The map is browser-only, so it is created after hydration and loaded on demand.
  useEffect(() => {
    let map: Basemap | null = null
    let dead = false
    import('maplibre-gl').then(({ Map, NavigationControl, setWorkerUrl }) => {
      if (dead || !box.current) return
      setWorkerUrl('/vendor/maplibre-gl-worker.mjs')
      map = new Map({
        container: box.current,
        style: BASEMAP,
        bounds: scopeBounds ?? undefined,
        fitBoundsOptions: { padding: 50 },
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        renderWorldCopies: false,
        maxZoom: 13,
      })
      map.touchZoomRotate.disableRotation()
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
      map.on('render', sync)
      map.on('zoom', () => setClose(map!.getZoom() >= 6.5))
      // A click on the map itself, not on a lane or a city, clears the selection.
      map.on('click', () => setSelected(null))
      map.on('error', () => {
        if (map && !map.isStyleLoaded()) setOffline(true)
      })
      mapRef.current = map
      setClose(map.getZoom() >= 6.5)
      setReady(true)
    })
    return () => {
      dead = true
      map?.remove()
      mapRef.current = null
    }
    // Created once; scope changes fly the existing camera below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeBounds])

  const selOrder = selected?.kind === 'order' ? orders.find((o) => o.id === selected.id) : null
  const selCity = selected?.kind === 'city' ? selected.name : null

  // Bring a selection made elsewhere into view if the camera cannot see it.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const pts: [number, number][] = selOrder
      ? [model.cities[selOrder.from], model.cities[selOrder.to]].filter(Boolean)
      : selCity && model.cities[selCity]
        ? [model.cities[selCity]]
        : []
    if (!pts.length) return
    const view = map.getBounds()
    if (pts.every((p) => view.contains(p))) return
    if (pts.length === 1) map.easeTo({ center: pts[0], duration: 800 })
    else map.fitBounds(boundsOf(pts)!, { padding: 90, maxZoom: 8, duration: 900 })
  }, [selOrder, selCity, model])

  const map = ready ? mapRef.current : null

  // Lanes that share a city pair fan out instead of drawing over each other.
  const lanes = useMemo(() => {
    const seen = new Map<string, number>()
    return orders
      .filter((o) => model.cities[o.from] && model.cities[o.to])
      .sort((a, b) => RISK_ORDER.indexOf(a.risk) - RISK_ORDER.indexOf(b.risk))
      .map((o) => {
        const key = `${o.from}|${o.to}`
        const n = seen.get(key) ?? 0
        seen.set(key, n + 1)
        return { o, arc: arc(toWorld(model.cities[o.from]), toWorld(model.cities[o.to]), 0.14 + n * 0.07) }
      })
  }, [orders, model])

  const cityStats = useMemo(() => {
    const m = new Map<string, { out: number; in: number; hot: number }>()
    for (const o of orders) {
      const f = m.get(o.from) ?? { out: 0, in: 0, hot: 0 }
      f.out++
      if (o.risk === 'critical' || o.risk === 'warn') f.hot++
      m.set(o.from, f)
      const t = m.get(o.to) ?? { out: 0, in: 0, hot: 0 }
      t.in++
      if (o.risk === 'critical' || o.risk === 'warn') t.hot++
      m.set(o.to, t)
    }
    return m
  }, [orders])

  const focus = (o: OpsOrder) =>
    selOrder ? o.id === selOrder.id : selCity ? o.from === selCity || o.to === selCity : true

  return (
    <section
      className={`${PANEL} relative h-[460px] overflow-hidden lg:h-[640px]`}
      ref={wrap}
      onMouseLeave={() => setTip(null)}
    >
      {/* MapLibre makes its container position: relative, so it gets a wrapper to fill. */}
      <div className="absolute inset-0 bg-canvas">
        <div ref={box} className="h-full w-full" />
      </div>

      {map ? (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-label={`${orders.length} delivery lanes`}
          role="img"
          // A scroll over a lane or a city still zooms the map underneath.
          onWheel={(e) => map.getCanvas().dispatchEvent(new WheelEvent('wheel', e.nativeEvent))}
        >
          {/* lanes, in world units; strokes stay screen-sized */}
          <g ref={lanesRef}>
          {lanes.map(({ o, arc: a }) => {
            const isSel = selOrder?.id === o.id
            const dim = !isSel && ((touched && !touched.has(o.id)) || !focus(o))
            const colour = RISK[o.risk].colour
            const quiet = o.risk === 'idle' || o.risk === 'done'
            return (
              <g key={o.id} opacity={dim ? 0.12 : 1}>
                {isSel ? (
                  <path d={a.d} fill="none" stroke={colour} strokeWidth={8} strokeOpacity={0.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                ) : null}
                <path
                  d={a.d}
                  fill="none"
                  stroke={colour}
                  strokeWidth={isSel ? 2.6 : quiet ? 1.1 : 1.7}
                  strokeOpacity={quiet ? 0.6 : 0.95}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray={o.status === 'IN_TRANSIT' ? '5 3' : undefined}
                  className={o.status === 'IN_TRANSIT' && !dim ? 'ops-flow' : undefined}
                />
                {/* wide invisible hit target */}
                <path
                  d={a.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={10}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="stroke"
                  className="cursor-pointer"
                  onMouseMove={(e) =>
                    place(e, (
                      <>
                        <p className="font-mono text-[11.5px] text-label">{o.ref}</p>
                        <p className="text-secondary">
                          {o.from} → {o.to}
                          {o.distanceKm ? ` · ${o.distanceKm.toLocaleString('en-GB')} km` : ''}
                        </p>
                        <p style={{ color: colour }}>{o.caseBadge ?? RISK[o.risk].label}</p>
                      </>
                    ))
                  }
                  onMouseLeave={() => setTip(null)}
                  onClick={() => pick(o.id)}
                />
              </g>
            )
          })}
          </g>

          <g ref={markersRef}>
          {/* cars on the road, at their last reported progress */}
          {lanes
            .filter(({ o }) => o.progress !== null)
            .map(({ o, arc: a }) => {
              const [x, y] = a.at(Math.min(1, Math.max(0, o.progress!)))
              const dim = selOrder?.id !== o.id && ((touched && !touched.has(o.id)) || !focus(o))
              const colour = RISK[o.risk].colour
              return (
                <g key={`car-${o.id}`} data-wx={x} data-wy={y} opacity={dim ? 0.15 : 1}>
                  {!dim ? <circle r={4} fill="none" stroke={colour} className="ops-pulse" /> : null}
                  <circle r={3.6} fill={colour} stroke="var(--color-canvas)" strokeWidth={1.5} />
                </g>
              )
            })}

          {/* cities */}
          {[...cityStats.entries()].map(([name, s]) => {
            if (!model.cities[name]) return null
            const [x, y] = toWorld(model.cities[name])
            const n = s.in + s.out
            const r = r2(2.6 + Math.sqrt(n) * 1.5)
            const isSel = selCity === name
            const isEnd = selOrder && (selOrder.from === name || selOrder.to === name)
            const label = isSel || isEnd || close || (n >= 4 && !QUIET_LABEL.has(name))
            return (
              <g
                key={name}
                data-wx={x}
                data-wy={y}
                className="pointer-events-auto cursor-pointer"
                onMouseMove={(e) =>
                  place(e, (
                    <>
                      <p className="text-label">{name}</p>
                      <p className="font-mono text-secondary">
                        {s.out} out · {s.in} in
                      </p>
                      {s.hot ? <p className="text-orange">{s.hot} need attention</p> : null}
                    </>
                  ))
                }
                onMouseLeave={() => setTip(null)}
                onClick={() => setSelected(isSel ? null : { kind: 'city', name })}
              >
                <circle r={r + 8} fill="transparent" />
                {isSel || isEnd ? (
                  <circle r={r + 5} fill="none" stroke="var(--color-label)" strokeWidth={1} strokeDasharray="2 2" />
                ) : null}
                <circle
                  r={r}
                  fill="var(--color-card)"
                  stroke={s.hot ? 'var(--color-orange)' : 'var(--color-secondary)'}
                  strokeWidth={1.4}
                />
                <circle r={1.6} fill="var(--color-label)" />
                {label ? (
                  <text
                    x={r + 5}
                    y={3.5}
                    className="pointer-events-none select-none font-mono"
                    fontSize={10.5}
                    fill={isSel || isEnd ? 'var(--color-label)' : 'var(--color-secondary)'}
                    paintOrder="stroke"
                    stroke="var(--color-canvas)"
                    strokeWidth={3}
                  >
                    {name}
                  </text>
                ) : null}
              </g>
            )
          })}
          </g>
        </svg>
      ) : null}

      {/* scope: which transfers the map is about */}
      <div className="absolute left-[10px] top-[10px] z-[1] flex flex-wrap items-center gap-[8px]">
        <div
          role="radiogroup"
          aria-label="Transfers"
          className="flex overflow-hidden rounded-[8px] border border-hair bg-card/90 p-[2px] shadow-[0_4px_16px_rgba(0,0,0,0.35)] backdrop-blur"
        >
          {SCOPES.map((s) => {
            const on = s.key === scope
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setScope(s.key)}
                className={
                  'inline-flex items-center gap-[5px] rounded-[6px] px-[9px] py-[4px] text-[12px] transition-colors ' +
                  (on ? 'bg-label font-semibold text-canvas' : 'text-secondary hover:text-label')
                }
              >
                {s.key === 'ALL' || s.key === 'INTL' ? (
                  <Icon name={s.key === 'INTL' ? 'globe' : 'route'} size={12} />
                ) : (
                  <span className="font-mono text-[10px] opacity-70">{s.key}</span>
                )}
                {s.label}
                <span className="font-mono text-[10.5px] tabular-nums opacity-60">{scopeCount[s.key]}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => fit()}
          title="Fit the map to these transfers"
          className="inline-flex items-center gap-[5px] rounded-[8px] border border-hair bg-card/90 px-[9px] py-[5px] text-[12px] text-secondary backdrop-blur hover:text-label"
        >
          <Icon name="locate" size={12} />
          Reset view
        </button>
        {offline ? (
          <span className="rounded-[6px] bg-card/90 px-[8px] py-[4px] font-mono text-[10.5px] text-orange">
            basemap offline · lanes still drawn
          </span>
        ) : null}
      </div>

      <Legend />

      {tip ? (
        <div
          className="pointer-events-none absolute z-[2] max-w-[240px] rounded-[7px] border border-sand bg-birch px-[9px] py-[6px] text-[11.5px] leading-[1.45] shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
          style={{ left: tip.x + 14, top: tip.y + 12 }}
        >
          {tip.body}
        </div>
      ) : null}
    </section>
  )
}

function Legend() {
  return (
    <ul className="pointer-events-none absolute bottom-[10px] left-[10px] z-[1] flex max-w-[calc(100%-300px)] flex-wrap gap-x-[12px] gap-y-[4px] rounded-[7px] bg-card/80 px-[9px] py-[5px] backdrop-blur">
      {[...RISK_ORDER].reverse().map((r) => (
        <li key={r} className="inline-flex items-center gap-[5px] text-[10.5px] text-secondary">
          <span className="h-[2px] w-[14px] rounded-full" style={{ background: RISK[r].colour }} />
          {RISK[r].label}
        </li>
      ))}
      <li className="inline-flex items-center gap-[5px] text-[10.5px] text-secondary">
        <span className="h-0 w-[14px] border-t-2 border-dashed border-teal" />
        dashed = in transit
      </li>
    </ul>
  )
}

/* ---------------------------------------------------------------- inspector */

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-hair/60 py-[6px] last:border-b-0">
      <dt className="w-[86px] shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-tertiary">{k}</dt>
      <dd className="min-w-0 flex-1 text-[12.5px] text-label">{children}</dd>
    </div>
  )
}

function Bar({ value, max, colour }: { value: number; max: number; colour: string }) {
  return (
    <span className="relative block h-[6px] flex-1 overflow-hidden rounded-full bg-fill">
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${Math.max(2, (value / Math.max(max, 1)) * 100)}%`, background: colour }}
      />
    </span>
  )
}

function Inspector({
  model,
  orders,
  selected,
  selOrder,
  setSelected,
  pick,
  toggleLane,
}: {
  model: OpsModel
  orders: OpsOrder[]
  selected: Selection
  selOrder: OpsOrder | null
  setSelected: (s: Selection) => void
  pick: (id: string) => void
  toggleLane: (lane: string) => void
}) {
  return (
    <section className={`${PANEL} flex max-h-[640px] flex-col lg:h-[640px]`}>
      <div className="flex items-center border-b border-hair px-[12px] py-[9px]">
        <p className={CAPTION}>
          <Icon name="view" size={12} />
          {selOrder ? 'Order' : selected?.kind === 'city' ? 'City' : 'Overview'}
        </p>
        {selected ? (
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="ml-auto text-tertiary hover:text-label"
            aria-label="Close inspector"
          >
            <Icon name="close" size={13} />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-[14px] py-[12px]">
        {selOrder ? (
          <OrderDetail o={selOrder} model={model} />
        ) : selected?.kind === 'city' ? (
          <CityDetail name={selected.name} orders={orders} pick={pick} />
        ) : (
          <Overview orders={orders} pick={pick} toggleLane={toggleLane} setSelected={setSelected} />
        )}
      </div>
    </section>
  )
}

function OrderDetail({ o, model }: { o: OpsOrder; model: OpsModel }) {
  const r = RISK[o.risk]
  const stale = o.status === 'IN_TRANSIT' && o.feedAgeH !== null && o.feedAgeH > 6
  const history = model.events.filter((e) => e.orderId === o.id).slice(-6).reverse()
  return (
    <div>
      <div className="flex items-center gap-[8px]">
        <span className="font-mono text-[17px] font-semibold text-label">{o.ref}</span>
        <span className="rounded-[5px] bg-fill px-[6px] py-[1px] font-mono text-[10px] uppercase text-secondary">
          {o.lane}
        </span>
      </div>
      <p className="mt-[5px] inline-flex items-center gap-[5px] text-[12.5px]" style={{ color: r.colour }}>
        <Icon name={r.icon} size={13} />
        {o.caseBadge ?? r.label}
      </p>

      <div className="mt-[12px] rounded-[8px] border border-hair bg-birch px-[11px] py-[9px]">
        <p className="flex items-center gap-[7px] text-[13px] text-label">
          {o.from}
          <span className="font-mono text-[10px] text-tertiary">{o.fromCountry}</span>
          <Icon name={o.ferry ? 'ferry' : 'arrow-right'} size={13} className="text-tertiary" />
          {o.to}
          <span className="font-mono text-[10px] text-tertiary">{o.toCountry}</span>
        </p>
        {o.progress !== null ? (
          <div className="mt-[8px] flex items-center gap-[8px]">
            <Bar value={o.progress} max={1} colour={r.colour} />
            <span className="font-mono text-[11px] tabular-nums text-secondary">
              {Math.round(o.progress * 100)}%
            </span>
          </div>
        ) : null}
      </div>

      <dl className="mt-[10px]">
        <Row k="Route">
          {o.routeKind.toLowerCase()}
          {o.distanceKm ? ` · ${o.distanceKm.toLocaleString('en-GB')} km` : ''}
          {o.ferry ? ' · ferry' : ''}
        </Row>
        {o.remainingKm !== null ? <Row k="To go">{o.remainingKm.toLocaleString('en-GB')} km</Row> : null}
        {o.eta ? <Row k="Driver ETA">{stamp(new Date(o.eta).getTime())} UTC</Row> : null}
        {o.feedAgeH !== null && o.status === 'IN_TRANSIT' ? (
          <Row k="Last fix">
            <span className={stale ? 'text-orange' : undefined}>
              {hours(-o.feedAgeH)}
              {stale ? ' · stale' : ''}
            </span>
          </Row>
        ) : null}
        {o.nextLabel && o.hoursToNext !== null ? (
          <Row k="Next">
            {o.nextLabel}{' '}
            <span className={o.hoursToNext < 8 ? 'font-semibold text-red' : 'text-secondary'}>
              {hours(o.hoursToNext)}
            </span>
          </Row>
        ) : null}
        <Row k="Driver">{o.driver ?? <span className="text-tertiary">none assigned</span>}</Row>
        <Row k="Car">{o.vehicle ?? <span className="text-tertiary">not recorded</span>}</Row>
      </dl>

      {o.caseTitle ? (
        <div className="mt-[12px] rounded-[8px] border border-red/40 bg-red/[0.06] px-[11px] py-[9px]">
          <p className={CAPTION}>
            <Icon name="warning" size={11} className="text-red" />
            Case · score {o.caseScore}
          </p>
          <p className="mt-[4px] text-[12.5px] text-label">{o.caseTitle}</p>
        </div>
      ) : null}

      {o.alerts.length ? (
        <div className="mt-[12px]">
          <p className={CAPTION}>
            <Icon name="alert" size={11} />
            Alerts
          </p>
          <ul className="mt-[5px] space-y-[5px]">
            {o.alerts.map((a) => (
              <li key={a.signal} className="rounded-[7px] border border-hair px-[9px] py-[6px]">
                <p className="flex items-center gap-[6px] text-[12px] text-label">
                  <span
                    className={`font-mono text-[10px] uppercase ${a.severity === 'critical' || a.severity === 'high' ? 'text-red' : 'text-orange'}`}
                  >
                    {a.severity}
                  </span>
                  {codeName(a.signal)}
                </p>
                <p className="mt-[2px] text-[11.5px] leading-[1.4] text-secondary">{a.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-[12px]">
        <p className={CAPTION}>
          <Icon name="history" size={11} />
          Latest activity
        </p>
        <ul className="mt-[5px]">
          {history.map((e, i) => (
            <li key={i} className="flex items-baseline gap-[7px] py-[3px] text-[11.5px]">
              <span className="size-[6px] shrink-0 self-center rounded-[2px]" style={{ background: ACTOR_COLOUR[e.actor] }} />
              <span className="min-w-0 flex-1 truncate text-body">{commandName(e.cmd)}</span>
              <span className="font-mono text-[10.5px] tabular-nums text-tertiary">{stamp(e.t)}</span>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href={o.caseKey ? `/case/${o.caseKey.replace(':', '/')}` : `/case/order/${o.id}`}
        className="mt-[14px] inline-flex w-full items-center justify-center gap-[6px] rounded-[7px] bg-ink px-[12px] py-[7px] text-[12.5px] font-semibold text-canvas transition-opacity hover:opacity-90"
      >
        {o.caseKey ? 'Open the case' : 'Open the record'}
        <Icon name="arrow-right" size={13} />
      </Link>
    </div>
  )
}

function CityDetail({
  name,
  orders,
  pick,
}: {
  name: string
  orders: OpsOrder[]
  pick: (id: string) => void
}) {
  const out = orders.filter((o) => o.from === name)
  const inc = orders.filter((o) => o.to === name)
  const group = (label: string, list: OpsOrder[], other: (o: OpsOrder) => string) => (
    <div className="mt-[14px]">
      <p className={CAPTION}>
        {label} <span className="ml-auto tabular-nums">{list.length}</span>
      </p>
      <ul className="mt-[4px]">
        {list.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => pick(o.id)}
              className="flex w-full items-center gap-[8px] rounded-[5px] px-[4px] py-[4px] text-left hover:bg-birch"
            >
              <span className="size-[7px] rounded-full" style={{ background: RISK[o.risk].colour }} />
              <span className="font-mono text-[11.5px] text-label">{o.ref}</span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-secondary">{other(o)}</span>
              <span className="font-mono text-[10px] uppercase text-tertiary">{o.lane}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <div>
      <p className="font-display text-[19px] font-semibold tracking-[-0.02em] text-label">{name}</p>
      <p className="mt-[2px] font-mono text-[11px] text-secondary">
        {out.length} outbound · {inc.length} inbound
      </p>
      {out.length ? group('Leaving', out, (o) => `→ ${o.to}`) : null}
      {inc.length ? group('Arriving', inc, (o) => `from ${o.from}`) : null}
    </div>
  )
}

function Overview({
  orders,
  pick,
  toggleLane,
  setSelected,
}: {
  orders: OpsOrder[]
  pick: (id: string) => void
  toggleLane: (lane: string) => void
  setSelected: (s: Selection) => void
}) {
  const byLane = LANES.map((l) => ({ l, n: orders.filter((o) => o.lane === l).length })).filter((x) => x.n)
  const maxLane = Math.max(...byLane.map((x) => x.n), 1)

  const corridors = useMemo(() => {
    const m = new Map<string, { from: string; to: string; n: number; hot: number }>()
    for (const o of orders) {
      const k = `${o.fromCountry}→${o.toCountry}`
      const c = m.get(k) ?? { from: o.fromCountry, to: o.toCountry, n: 0, hot: 0 }
      c.n++
      if (o.risk === 'critical' || o.risk === 'warn') c.hot++
      m.set(k, c)
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 6)
  }, [orders])
  const maxCorr = Math.max(...corridors.map((c) => c.n), 1)

  const hubs = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of orders) {
      m.set(o.from, (m.get(o.from) ?? 0) + 1)
      m.set(o.to, (m.get(o.to) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [orders])

  const soonest = orders
    .filter((o) => o.hoursToNext !== null && o.hoursToNext > 0 && o.status !== 'DELIVERED')
    .sort((a, b) => a.hoursToNext! - b.hoursToNext!)
    .slice(0, 4)

  return (
    <div className="space-y-[18px]">
      <div>
        <p className={CAPTION}>Pipeline</p>
        <ul className="mt-[6px] space-y-[3px]">
          {byLane.map(({ l, n }) => (
            <li key={l}>
              <button
                type="button"
                onClick={() => toggleLane(l)}
                className="flex w-full items-center gap-[8px] rounded-[5px] px-[3px] py-[2px] text-left hover:bg-birch"
              >
                <span className="w-[64px] font-mono text-[11px] text-secondary">{l}</span>
                <Bar value={n} max={maxLane} colour="var(--color-secondary)" />
                <span className="w-[22px] text-right font-mono text-[11px] tabular-nums text-label">{n}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className={CAPTION}>Corridors</p>
        <ul className="mt-[6px] space-y-[3px]">
          {corridors.map((c) => (
            <li key={`${c.from}${c.to}`} className="flex items-center gap-[8px] px-[3px] py-[2px]">
              <span className="w-[64px] font-mono text-[11px] text-secondary">
                {c.from} → {c.to}
              </span>
              <Bar value={c.n} max={maxCorr} colour="var(--color-teal)" />
              <span className="w-[22px] text-right font-mono text-[11px] tabular-nums text-label">{c.n}</span>
              <span className="w-[38px] text-right font-mono text-[10.5px] tabular-nums text-orange">
                {c.hot ? `${c.hot} hot` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className={CAPTION}>Busiest cities</p>
        <div className="mt-[6px] flex flex-wrap gap-[5px]">
          {hubs.map(([city, n]) => (
            <button
              key={city}
              type="button"
              onClick={() => setSelected({ kind: 'city', name: city })}
              className="rounded-[6px] border border-hair px-[7px] py-[2px] font-mono text-[11px] text-secondary hover:border-sand hover:text-label"
            >
              {city} <span className="text-tertiary">{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className={CAPTION}>
          <Icon name="clock" size={11} />
          Next deadlines
        </p>
        <ul className="mt-[5px]">
          {soonest.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => pick(o.id)}
                className="flex w-full items-baseline gap-[8px] rounded-[5px] px-[3px] py-[4px] text-left hover:bg-birch"
              >
                <span className="font-mono text-[11.5px] text-label">{o.ref}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-secondary">{o.nextLabel}</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${o.hoursToNext! < 8 ? 'font-semibold text-red' : 'text-secondary'}`}
                >
                  {hours(o.hoursToNext!)}
                </span>
              </button>
            </li>
          ))}
          {!soonest.length ? <li className="text-[12px] text-secondary">Nothing due.</li> : null}
        </ul>
      </div>

      <p className="text-[11.5px] leading-[1.5] text-tertiary">
        Click a lane, a city or a row to inspect it. Drag across the timeline to
        see only what moved in that window.
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- timeline */

const TW = 1000
const TH = 150
const TPAD = { l: 34, r: 10, t: 10, b: 22 }

function Timeline({
  events,
  snapshot,
  range,
  setRange,
  marks,
}: {
  events: OpsEvent[]
  snapshot: number
  range: [number, number] | null
  setRange: (r: [number, number] | null) => void
  marks: OpsEvent[]
}) {
  const binMs = BIN_H * HOUR
  // Fixed span: the whole log, ending at the snapshot. Filters change the bars, not the axis.
  const [start, end] = useMemo(() => {
    const first = events.length ? events[0].t : snapshot - 7 * 24 * HOUR
    const s = Math.floor(first / (24 * HOUR)) * 24 * HOUR
    return [s, Math.ceil(snapshot / binMs) * binMs]
  }, [events, snapshot, binMs])

  const bins = useMemo(() => {
    const n = Math.max(1, Math.round((end - start) / binMs))
    const out = Array.from({ length: n }, (_, i) => ({
      t: start + i * binMs,
      operator: 0,
      driver: 0,
      agent: 0,
      other: 0,
      total: 0,
    }))
    for (const e of events) {
      const i = Math.floor((e.t - start) / binMs)
      if (i < 0 || i >= n) continue
      out[i][e.actor]++
      out[i].total++
    }
    return out
  }, [events, start, end, binMs])

  const max = Math.max(...bins.map((b) => b.total), 1)
  const iw = TW - TPAD.l - TPAD.r
  const ih = TH - TPAD.t - TPAD.b
  const x = (t: number) => TPAD.l + ((t - start) / (end - start)) * iw
  const bw = iw / bins.length
  const y = (v: number) => TPAD.t + ih - (v / max) * ih
  const ticks = [0, Math.round(max / 2), max]

  const svg = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<[number, number] | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const tAt = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect()
    const vx = ((clientX - r.left) / r.width) * TW
    const t = start + ((vx - TPAD.l) / iw) * (end - start)
    return Math.min(end, Math.max(start, t))
  }
  const snap = (t: number) => Math.floor((t - start) / binMs) * binMs + start

  const onDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const t = tAt(e.clientX)
    setDrag([t, t])
  }
  const onMove = (e: React.PointerEvent) => {
    const t = tAt(e.clientX)
    const i = Math.floor((t - start) / binMs)
    setHover(i >= 0 && i < bins.length ? i : null)
    if (drag) setDrag([drag[0], t])
  }
  const onUp = () => {
    if (!drag) return
    const [a, b] = [Math.min(...drag), Math.max(...drag)]
    // A click without a drag picks the bin under the pointer.
    if (b - a < binMs / 3) {
      const s = snap(a)
      setRange(range && range[0] === s && range[1] === s + binMs ? null : [s, s + binMs])
    } else {
      setRange([snap(a), snap(b) + binMs])
    }
    setDrag(null)
  }

  const shown = drag ? ([Math.min(...drag), Math.max(...drag)] as [number, number]) : range
  const hb = hover !== null ? bins[hover] : null

  const days: number[] = []
  for (let t = start; t <= end; t += 24 * HOUR) days.push(t)
  const dayStep = Math.ceil(days.length / 12)

  return (
    <section className={`${PANEL} px-[12px] py-[9px]`}>
      <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[4px]">
        <p className={CAPTION}>
          <Icon name="history" size={12} />
          Activity · events per {BIN_H} h
        </p>
        <ul className="flex flex-wrap gap-x-[12px]">
          {ACTORS.map((a) => (
            <li key={a.key} className="inline-flex items-center gap-[5px] text-[11px] text-secondary">
              <span className="size-[8px] rounded-[2px]" style={{ background: a.colour }} />
              {a.label}
              <span className="font-mono tabular-nums text-tertiary">
                {events.filter((e) => e.actor === a.key).length}
              </span>
            </li>
          ))}
        </ul>
        {range ? (
          <button
            type="button"
            onClick={() => setRange(null)}
            className="ml-auto inline-flex items-center gap-[5px] rounded-[6px] border border-sand px-[7px] py-[2px] font-mono text-[11px] text-label hover:bg-birch"
          >
            {stamp(range[0])} – {stamp(range[1])}
            <Icon name="close" size={10} />
          </button>
        ) : (
          <span className="ml-auto font-mono text-[10.5px] text-tertiary">drag to select a window</span>
        )}
      </div>

      <div className="relative mt-[6px]">
        <svg
          ref={svg}
          viewBox={`0 0 ${TW} ${TH}`}
          preserveAspectRatio="none"
          className="block h-[150px] w-full cursor-crosshair touch-none select-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label="Events over time, stacked by who acted"
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={TPAD.l} x2={TW - TPAD.r} y1={y(v)} y2={y(v)} stroke="var(--color-hair)" strokeWidth={v ? 0.6 : 1} vectorEffect="non-scaling-stroke" />
              <text x={TPAD.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} className="font-mono" fill="var(--color-tertiary)">
                {v}
              </text>
            </g>
          ))}

          {bins.map((b, i) => {
            let acc = 0
            const x0 = TPAD.l + i * bw + 0.6
            const w = Math.max(1, bw - 1.2)
            const inRange = !shown || (b.t >= shown[0] && b.t < shown[1])
            return (
              <g key={b.t} opacity={inRange ? 1 : 0.25}>
                {hover === i ? <rect x={TPAD.l + i * bw} y={TPAD.t} width={bw} height={ih} fill="var(--color-birch)" /> : null}
                {ACTORS.map((a) => {
                  const v = b[a.key]
                  if (!v) return null
                  const y1 = y(acc + v)
                  const h = y(acc) - y1
                  acc += v
                  return (
                    <rect key={a.key} x={x0} y={y1} width={w} height={Math.max(0.5, h - 0.8)} fill={a.colour} rx={0.8} />
                  )
                })}
              </g>
            )
          })}

          {shown ? (
            <rect
              x={x(shown[0])}
              y={TPAD.t}
              width={Math.max(1, x(shown[1]) - x(shown[0]))}
              height={ih}
              fill="var(--color-label)"
              fillOpacity={0.06}
              stroke="var(--color-label)"
              strokeOpacity={0.5}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {/* the selected order's own events */}
          {marks.map((m, i) => (
            <line
              key={i}
              x1={x(m.t)}
              x2={x(m.t)}
              y1={TPAD.t}
              y2={TPAD.t + ih}
              stroke="var(--color-label)"
              strokeWidth={1}
              strokeOpacity={0.6}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <line x1={x(snapshot)} x2={x(snapshot)} y1={TPAD.t - 4} y2={TPAD.t + ih} stroke="var(--color-teal)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

          {days.map((d, i) =>
            i % dayStep === 0 ? (
              <text key={d} x={x(d)} y={TH - 6} fontSize={10} className="font-mono" fill="var(--color-tertiary)">
                {new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
              </text>
            ) : null,
          )}
        </svg>

        {hb && !drag ? (
          <div
            className="pointer-events-none absolute top-0 z-[2] w-[170px] rounded-[7px] border border-sand bg-birch px-[9px] py-[6px] text-[11px] shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
            style={{
              left: `clamp(0px, calc(${(x(hb.t + binMs / 2) / TW) * 100}% - 85px), calc(100% - 170px))`,
            }}
          >
            <p className="font-mono text-label">
              {stamp(hb.t)} <span className="text-tertiary">+{BIN_H} h</span>
            </p>
            {ACTORS.map((a) => (
              <p key={a.key} className="flex items-center gap-[6px] text-secondary">
                <span className="size-[7px] rounded-[2px]" style={{ background: a.colour }} />
                {a.label}
                <span className="ml-auto font-mono tabular-nums text-label">{hb[a.key]}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- feed */

function Feed({
  events,
  range,
  selOrder,
  orderById,
  pick,
}: {
  events: OpsEvent[]
  range: [number, number] | null
  selOrder: OpsOrder | null
  orderById: Map<string, OpsOrder>
  pick: (id: string) => void
}) {
  const rows = useMemo(() => {
    let list = events
    if (range) list = list.filter((e) => e.t >= range[0] && e.t < range[1])
    if (selOrder) list = list.filter((e) => e.orderId === selOrder.id)
    return list.slice(-150).reverse()
  }, [events, range, selOrder])

  return (
    <section className={`${PANEL} flex h-[204px] flex-col`}>
      <p className={`${CAPTION} border-b border-hair px-[12px] py-[9px]`}>
        <Icon name="message" size={12} />
        Event log
        {selOrder ? <span className="normal-case tracking-normal text-secondary">· {selOrder.ref}</span> : null}
        <span className="ml-auto tabular-nums">{rows.length}</span>
      </p>
      <ul className="min-h-0 flex-1 overflow-y-auto font-mono text-[11px]">
        {rows.map((e, i) => {
          const o = e.orderId ? orderById.get(e.orderId) : null
          return (
            <li key={i} className="flex items-center gap-[8px] border-b border-hair/50 px-[12px] py-[4px]">
              <span className="shrink-0 tabular-nums text-tertiary">{stamp(e.t)}</span>
              <span className="size-[6px] shrink-0 rounded-[2px]" style={{ background: ACTOR_COLOUR[e.actor] }} />
              <span className="min-w-0 flex-1 truncate font-sans text-[11.5px] text-body">
                {commandName(e.cmd)}
                {e.toState ? <span className="text-tertiary"> → {e.toState.toLowerCase()}</span> : null}
              </span>
              {o ? (
                <button type="button" onClick={() => pick(o.id)} className="shrink-0 text-secondary hover:text-label hover:underline">
                  {o.ref}
                </button>
              ) : null}
            </li>
          )
        })}
        {!rows.length ? <li className="px-[12px] py-[10px] font-sans text-[12px] text-secondary">No events in this window.</li> : null}
      </ul>
    </section>
  )
}

/* ---------------------------------------------------------------- market clocks */

// Office hours are a rule of thumb for "will a desk pick up": weekdays 08–18.
const OPENS = 8
const CLOSES = 18

function useNow(): number | null {
  // Null on the server and the first paint, so the markup never disagrees with the browser.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function clockAt(t: number, tz: string) {
  const time = new Date(t).toLocaleTimeString('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const offset =
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(t)
      .find((p) => p.type === 'timeZoneName')
      ?.value.replace('GMT', 'UTC') ?? ''
  const day = new Date(t).toLocaleDateString('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const hour = Number(
    new Date(t).toLocaleString('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }),
  )
  const weekend = day.startsWith('Sat') || day.startsWith('Sun')
  return { time, offset, day, weekend, open: !weekend && hour >= OPENS && hour < CLOSES }
}

function daysUntil(date: string, from: number, tz: string): number {
  return Math.round((Date.parse(date) - Date.parse(localDay(from, tz))) / 86_400_000)
}

function Clocks(props: { watch: Promise<Watch>; scope: Scope; setScope: (s: Scope) => void }) {
  return (
    <Suspense fallback={<ClockStrip {...props} holidays={null} />}>
      <ClocksWithHolidays {...props} />
    </Suspense>
  )
}

function ClocksWithHolidays(props: { watch: Promise<Watch>; scope: Scope; setScope: (s: Scope) => void }) {
  const { holidays } = use(props.watch)
  return <ClockStrip {...props} holidays={holidays} />
}

function ClockStrip({
  scope,
  setScope,
  holidays,
}: {
  scope: Scope
  setScope: (s: Scope) => void
  holidays: Watch['holidays'] | null
}) {
  const now = useNow()
  return (
    <div
      role="group"
      aria-label="Local time in each market"
      className="grid grid-cols-3 overflow-hidden rounded-[10px] border border-hair bg-hair"
      style={{ gap: 1 }}
    >
      {MARKETS.map((m) => {
        const on = scope === m.code
        const c = now ? clockAt(now, m.tz) : null
        const next = now
          ? holidays?.find((h) => h.market === m.code && daysUntil(h.date, now, m.tz) >= 0)
          : null
        const inDays = next && now ? daysUntil(next.date, now, m.tz) : null
        const today = inDays === 0 && !next?.regions
        const open = c?.open && !today
        return (
          <button
            key={m.code}
            type="button"
            onClick={() => setScope(on ? 'ALL' : m.code)}
            aria-pressed={on}
            title={on ? 'Showing this market. Click to show all.' : `Show ${m.name} only`}
            className={`min-w-[150px] px-[11px] py-[7px] text-left transition-colors ${on ? 'bg-birch shadow-[inset_0_-2px_0_var(--color-label)]' : 'bg-card hover:bg-birch'}`}
          >
            <p className="flex items-center gap-[6px] font-mono text-[10px] uppercase tracking-[0.08em] text-tertiary">
              <span className="text-secondary">{m.code}</span>
              {m.city}
              {c ? (
                <span className="ml-auto inline-flex items-center gap-[4px] normal-case tracking-normal">
                  <span className={`size-[6px] rounded-full ${open ? 'bg-green' : 'bg-tertiary'}`} />
                  {today ? 'holiday' : open ? 'office hours' : c.weekend ? 'weekend' : 'after hours'}
                </span>
              ) : null}
            </p>
            <p className="mt-[4px] flex items-baseline gap-[6px]">
              <span className="font-mono text-[19px] font-semibold tabular-nums leading-none text-label">
                {c?.time ?? '--:--:--'}
              </span>
              <span className="font-mono text-[10px] text-tertiary">{c?.offset}</span>
            </p>
            <p className="mt-[4px] truncate text-[10.5px] text-secondary">
              {c?.day ?? ' '}
              {next && inDays !== null && inDays <= 14 ? (
                <span className={inDays <= 7 ? 'text-orange' : undefined}>
                  {' · '}
                  {next.localName}
                  {next.regions ? '*' : ''} {inDays === 0 ? 'today' : `in ${inDays} d`}
                </span>
              ) : null}
            </p>
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- disruption watch */

const KIND: Record<NewsKind, { label: string; icon: IconName }> = {
  strike: { label: 'Strike', icon: 'blocked' },
  ferry: { label: 'Ferry & port', icon: 'ferry' },
  weather: { label: 'Weather', icon: 'alert' },
  traffic: { label: 'Traffic', icon: 'car' },
  holiday: { label: 'Holiday', icon: 'calendar' },
}

// Which German state each city we drive to sits in, for holidays only some states keep.
const DE_STATE: Record<string, string> = {
  Hamburg: 'HH',
  Berlin: 'BE',
  Leipzig: 'SN',
  Cologne: 'NW',
  Düsseldorf: 'NW',
  Frankfurt: 'HE',
  Stuttgart: 'BW',
  Munich: 'BY',
}

function ago(t: number, now: number): string {
  const m = Math.max(0, (now - t) / 60_000)
  if (m < 60) return `${Math.round(m)} min ago`
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`
  return `${Math.round(m / 1440)} d ago`
}

function WatchFrame({ right, children }: { right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`${PANEL} mt-3`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hair px-[12px] py-[9px]">
        <p className={CAPTION}>
          <Icon name="globe" size={12} />
          Disruption watch
          <span className="inline-flex items-center gap-[4px] normal-case tracking-normal text-teal">
            <span className="size-[6px] rounded-full bg-teal" />
            live
          </span>
        </p>
        {right}
      </div>
      {children}
    </section>
  )
}

function WatchSkeleton() {
  return (
    <WatchFrame>
      <p className="px-[12px] py-[18px] text-[12px] text-secondary">
        Checking public holidays and headlines in Finland, Denmark and Germany…
      </p>
    </WatchFrame>
  )
}

function WatchPanel({
  watch,
  orders,
  snapshot,
  scope,
  setScope,
}: {
  watch: Promise<Watch>
  orders: OpsOrder[]
  snapshot: number
  scope: Scope
  setScope: (s: Scope) => void
}) {
  const w = use(watch)
  const [kind, setKind] = useState<NewsKind | 'ALL'>('ALL')
  const market: MarketCode | null = scope === 'FI' || scope === 'DK' || scope === 'DE' ? scope : null

  const open = useMemo(
    () => orders.filter((o) => o.status !== 'DELIVERED' && o.lane !== 'cancelled'),
    [orders],
  )

  const inMarket = market ? w.news.filter((n) => n.market === market || n.market === 'INTL') : w.news
  const news = kind === 'ALL' ? inMarket : inMarket.filter((n) => n.kind === kind)
  const kinds = (Object.keys(KIND) as NewsKind[]).filter((k) => inMarket.some((n) => n.kind === k))

  const holidays = w.holidays
    .filter((h) => !market || h.market === market)
    .map((h) => {
      const tz = MARKETS.find((m) => m.code === h.market)!.tz
      const states = h.regions?.map((r) => r.replace(/^[A-Z]+-/, '')) ?? null
      // A regional German holiday only touches lanes through cities in those states.
      const touches = (city: string, country: string) =>
        country === h.market && (!states || states.includes(DE_STATE[city] ?? ''))
      const lanes = open.filter((o) => touches(o.from, o.fromCountry) || touches(o.to, o.toCountry))
      const due = lanes.filter(
        (o) => o.hoursToNext !== null && localDay(snapshot + o.hoursToNext * HOUR, tz) === h.date,
      )
      const cities = states
        ? [...new Set(lanes.flatMap((o) => [o.from, o.to]).filter((c) => states.includes(DE_STATE[c] ?? '')))]
        : []
      return { h, tz, states, lanes: lanes.length, due: due.length, cities, inDays: daysUntil(h.date, w.fetchedAt, tz) }
    })

  return (
    <WatchFrame
      right={
        <>
          <span className="font-mono text-[10.5px] text-tertiary">
            fetched {stamp(w.fetchedAt)} UTC
            {market ? ` · ${MARKETS.find((m) => m.code === market)!.name} and cross-border` : ' · all markets'}
          </span>
          {w.failed.length ? (
            <span className="inline-flex items-center gap-[4px] font-mono text-[10.5px] text-orange">
              <Icon name="warning" size={11} />
              unreachable: {w.failed.join(', ')}
            </span>
          ) : null}
        </>
      }
    >
      <div className="grid lg:grid-cols-[400px_minmax(0,1fr)]">
        {/* holidays */}
        <div className="border-b border-hair lg:border-b-0 lg:border-r">
          <p className={`${CAPTION} px-[12px] pt-[10px]`}>
            <Icon name="calendar" size={11} />
            Public holidays · next 30 days
          </p>
          <ul className="max-h-[300px] overflow-y-auto px-[12px] py-[6px]">
            {holidays.map(({ h, states, lanes, due, cities, inDays }) => (
              <li key={`${h.market}${h.date}${h.name}`} className="border-b border-hair/60 py-[8px] last:border-b-0">
                <div className="flex items-baseline gap-[8px]">
                  <button
                    type="button"
                    onClick={() => setScope(h.market)}
                    className="rounded-[4px] bg-fill px-[5px] font-mono text-[10px] text-secondary hover:text-label"
                    title={`Show ${h.market} only`}
                  >
                    {h.market}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-label">
                    {h.localName}
                    <span className="text-secondary"> · {h.name}</span>
                  </span>
                  <span
                    className={`shrink-0 font-mono text-[11px] tabular-nums ${inDays >= 0 && inDays <= 7 ? 'text-orange' : 'text-secondary'}`}
                  >
                    {new Date(h.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                  </span>
                </div>
                <p className="mt-[3px] pl-[30px] text-[11.5px] leading-[1.45] text-secondary">
                  {states ? `Regional: ${states.join(', ')}. ` : 'Nationwide. '}
                  {lanes ? (
                    <>
                      {lanes} open lane{lanes === 1 ? '' : 's'}
                      {cities.length ? ` via ${cities.join(', ')}` : ''}
                      {due ? <span className="text-red">, {due} with a deadline that day</span> : null}.
                    </>
                  ) : (
                    'No open lane touches it.'
                  )}
                  {inDays < 0 ? <span className="text-tertiary"> Already passed.</span> : null}
                </p>
              </li>
            ))}
            {!holidays.length ? (
              <li className="py-[8px] text-[12px] text-secondary">No public holiday in the window.</li>
            ) : null}
          </ul>
        </div>

        {/* news */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[6px] px-[12px] pt-[8px]">
            <p className={`${CAPTION} mr-1`}>
              <Icon name="document" size={11} />
              Headlines · last 7 days
            </p>
            <Chip on={kind === 'ALL'} onClick={() => setKind('ALL')}>
              all <span className="tabular-nums opacity-60">{inMarket.length}</span>
            </Chip>
            {kinds.map((k) => (
              <Chip key={k} on={kind === k} onClick={() => setKind(kind === k ? 'ALL' : k)}>
                <Icon name={KIND[k].icon} size={11} />
                {KIND[k].label.toLowerCase()}
                <span className="tabular-nums opacity-60">{inMarket.filter((n) => n.kind === k).length}</span>
              </Chip>
            ))}
          </div>
          <ul className="mt-[4px] max-h-[300px] overflow-y-auto">
            {news.map((n) => (
              <li key={n.url}>
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-[10px] border-b border-hair/50 px-[12px] py-[7px] hover:bg-birch"
                >
                  <Icon
                    name={KIND[n.kind].icon}
                    size={13}
                    className={`mt-[2px] shrink-0 ${n.kind === 'strike' ? 'text-orange' : 'text-secondary'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] leading-[1.35] text-label group-hover:underline">{n.title}</span>
                    <span className="mt-[2px] block font-mono text-[10.5px] text-tertiary">
                      {KIND[n.kind].label} · {n.market === 'INTL' ? 'cross-border' : n.market}
                      {n.source ? ` · ${n.source}` : ''} · {ago(n.published, w.fetchedAt)}
                    </span>
                  </span>
                  <Icon name="external" size={11} className="mt-[3px] shrink-0 text-tertiary" />
                </a>
              </li>
            ))}
            {!news.length ? (
              <li className="px-[12px] py-[10px] text-[12px] text-secondary">No matching headlines.</li>
            ) : null}
          </ul>
        </div>
      </div>
      <p className="border-t border-hair px-[12px] py-[7px] text-[11px] leading-[1.5] text-tertiary">
        Live, unlike the records above. Holidays from Nager.Date. Headlines from
        Google News, sorted by keyword, so read the article before acting on one.
        * observed in some regions only.
      </p>
    </WatchFrame>
  )
}
