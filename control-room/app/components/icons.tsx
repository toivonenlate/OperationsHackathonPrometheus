// The BahnOS icon set, drawn the way bahnexpress.fi draws its own: a 24 grid
// used edge to edge, a 1.75 stroke, square caps and mitred corners. Boxes stay
// sharp; only things that are round in life (wheels, faces, clocks) are round.
//
// Every icon is outline-only and takes its colour from currentColor, so tone
// comes from the text class around it: text-red for danger, text-orange for a
// risk, text-teal for the agent, text-green for a confirmation.
//
//   <Icon name="ferry" />                 16px, inherits colour
//   <Icon name="warning" size={13} className="text-red" />
//   <Icon name="agent" label="BahnBot" /> announced to screen readers

type Path = string | { circle: [number, number, number] }

const ICONS = {
  /* ---------- interface ---------- */
  'arrow-left': ['M11 18L5 12L11 6M5.5 12H19'],
  'arrow-right': ['M13 18L19 12L13 6M18.5 12H5'],
  'chevron-left': ['M15 6L9 12L15 18'],
  'chevron-right': ['M9 6L15 12L9 18'],
  'chevron-down': ['M6 9L12 15L18 9'],
  plus: ['M12 4V20M20 12H4'],
  close: ['M5 5L19 19M19 5L5 19'],
  check: ['M4 12.5L9.5 18L20 6'],
  menu: ['M20 5H4M20 12H10M20 19H4'],
  filter: ['M3 5H21M6 12H18M10 19H14'],
  search: [{ circle: [10.5, 10.5, 6.5] }, 'M15.5 15.5L21 21'],
  external: ['M14 3H21V10M21 3L11 13', 'M18 14V21H3V6H10'],
  refresh: [
    'M4 12A8 8 0 0 1 18.6 7.5M19 3V8H14',
    'M20 12A8 8 0 0 1 5.4 16.5M5 21V16H10',
  ],
  more: ['M4.75 12H5.25M11.75 12H12.25M18.75 12H19.25'],
  pause: ['M4 20H10V4H4V20Z', 'M14 20H20V4H14V20Z'],
  view: [
    'M2 12C4.5 7 8 5 12 5C16 5 19.5 7 22 12C19.5 17 16 19 12 19C8 19 4.5 17 2 12Z',
    { circle: [12, 12, 3] },
  ],
  upload: ['M12 16V3.5M7 8L12 3L17 8', 'M3 14V21H21V14'],
  attachment: [
    'M20 11L12 19C10 21 7 21 5 19C3 17 3 14 5 12L13 4C14.4 2.6 16.6 2.6 18 4C19.4 5.4 19.4 7.6 18 9L10.5 16.5C9.7 17.3 8.5 17.3 7.7 16.5C6.9 15.7 6.9 14.5 7.7 13.7L14.5 7',
  ],

  /* ---------- status: pair with the tone colours ---------- */
  warning: ['M12 2.5L22 20.5H2L12 2.5Z', 'M12 9.5V14M12 17V17.5'],
  clock: [{ circle: [12, 12, 10] }, 'M12 6.5V12L15.5 14'],
  info: [{ circle: [12, 12, 10] }, 'M12 11V17M12 7V7.5'],
  confirmed: [{ circle: [12, 12, 10] }, 'M7.5 12.5L10.5 15.5L16.5 9'],
  blocked: [{ circle: [12, 12, 10] }, 'M5 5L19 19'],
  waiting: ['M5 2H19M5 22H19', 'M7 2V6L12 12L17 6V2M7 22V18L12 12L17 18V22'],
  alert: ['M6 16V10A6 6 0 0 1 18 10V16L20 18.5H4L6 16Z', 'M9.5 21.5H14.5'],
  incident: ['M5 22V3', 'M5 4H19L16.5 8.5L19 13H5'],
  lock: ['M5 11H19V22H5V11Z', 'M8 11V7A4 4 0 0 1 16 7V11', 'M12 15V18'],
  // A work item: something the records are waiting to have checked.
  'open-check': ['M16 4H20V22H4V4H8', 'M8 2H16V6H8V2Z', 'M7.5 13L10.5 16L16.5 10'],
  // BahnBot: a spark, the one that already did the work.
  agent: [
    'M11 4C11.5 9 14 11.5 19 12C14 12.5 11.5 15 11 20C10.5 15 8 12.5 3 12C8 11.5 10.5 9 11 4Z',
    'M19.5 2V6M17.5 4H21.5',
  ],

  /* ---------- the delivery ---------- */
  car: [
    'M4.5 17H2V12L5 11L8 6.5H15L18.5 11L22 12V17H19.5',
    'M8.5 17H15.5M5 11H18.5M11.5 6.5V11',
    { circle: [6.5, 17, 2] },
    { circle: [17.5, 17, 2] },
  ],
  damage: [
    'M4.5 17H2V12L5 11L8 6.5H15L18.5 11L22 12V17H19.5',
    'M8.5 17H15.5M5 11H18.5',
    'M9.5 13.5L11 12.5L12.5 14L14 12.5',
    { circle: [6.5, 17, 2] },
    { circle: [17.5, 17, 2] },
  ],
  truck: [
    'M5 17.5H2V5H14V17.5H9',
    'M14 9H18.5L22 13V17.5H19.5M14 17.5H15.5',
    { circle: [7, 17.5, 2] },
    { circle: [17.5, 17.5, 2] },
  ],
  key: [{ circle: [7.5, 15.5, 4.5] }, 'M10.7 12.3L20 3M16.5 6.5L19 9M14 9L16 11'],
  history: [
    'M3 12A9 9 0 1 0 5.64 5.64',
    'M5.64 1.64V5.64H9.64',
    'M12 7V12L15 14',
  ],
  camera: ['M2 7H7L9 4H15L17 7H22V20H2V7Z', { circle: [12, 13, 4] }],
  compare: ['M2 6H16V20H2V6Z', 'M8 6V2H22V16H16', 'M2 17L7 12L12 17'],
  handover: ['M3 8H19M15 4L19 8L15 12', 'M21 16H5M9 12L5 16L9 20'],
  'id-card': [
    'M2 4H22V20H2V4Z',
    { circle: [8, 10.5, 2] },
    'M5 16C5 14.3 6.3 13.5 8 13.5C9.7 13.5 11 14.3 11 16',
    'M14 9H19M14 13H19',
  ],
  shield: [
    'M21 11V5C16 4.5 12 2 12 2C12 2 8 4.5 3 5V11C3 18.5 12 22 12 22C12 22 21 18.5 21 11Z',
    'M8 12L11 15L16 9.5',
  ],

  /* ---------- the road ---------- */
  route: [
    { circle: [5, 19, 2] },
    'M7 19H16C18 19 19.5 17.5 19.5 15.5C19.5 13.5 18 12 16 12H8C6 12 4.5 10.5 4.5 8.5C4.5 6.5 6 5 8 5H17',
    'M17 3H21V7H17V3Z',
  ],
  pin: [
    { circle: [12, 10, 3.5] },
    'M12 2C7.6 2 4 5.6 4 10.1C4 12.6 5 14.6 7 16.4C8.4 17.6 11 20.3 12 22C13.1 20.4 15.6 17.6 17 16.4C19 14.6 20 12.6 20 10.1C20 5.6 16.4 2 12 2Z',
  ],
  locate: [
    { circle: [12, 12, 7] },
    { circle: [12, 12, 2.5] },
    'M12 2V5M12 19V22M2 12H5M19 12H22',
  ],
  ferry: [
    'M2 14H22L19.5 18.5H4.5L2 14Z',
    'M6 14V10H18V14M9 10V6H14V10',
    'M3 21.5H6M9 21.5H15M18 21.5H21',
  ],
  train: ['M5 3H19V17H5V3Z', 'M5 11H19', 'M8 21L10 17M16 21L14 17', 'M8 14V14.5M16 14V14.5'],
  parking: ['M3 3H21V21H3V3Z', 'M9 17V7H13C14.7 7 16 8.3 16 10C16 11.7 14.7 13 13 13H9'],
  globe: [
    { circle: [12, 12, 10] },
    'M2 12H22',
    'M12 2C9.5 4.7 8 8.2 8 12C8 15.8 9.5 19.3 12 22C14.5 19.3 16 15.8 16 12C16 8.2 14.5 4.7 12 2Z',
  ],
  calendar: ['M16.5 2V6M7.5 2V6', 'M21 4H3V22H21V4Z', 'M3 10H21'],

  /* ---------- money and paper ---------- */
  receipt: [
    'M4 2H20V22L17 20L14.5 22L12 20L9.5 22L7 20L4 22V2Z',
    'M8 7H16M8 11H16M8 15H12',
  ],
  document: ['M14 2H4V22H20V8L14 2Z', 'M14 2V8H20', 'M8 13H16M8 17H13'],
  euro: [
    'M18 5.5C17 4.5 15.5 4 14 4C9.6 4 7 7.6 7 12C7 16.4 9.6 20 14 20C15.5 20 17 19.5 18 18.5',
    'M4 10H13M4 14H13',
  ],

  /* ---------- people and talk ---------- */
  person: [{ circle: [12, 7, 4] }, 'M4 21C4 16.6 7.6 14 12 14C16.4 14 20 16.6 20 21'],
  receiver: [
    { circle: [9, 7, 4] },
    'M2 21C2 16.6 5 14 9 14C10.5 14 11.8 14.4 13 15',
    'M14 18.5L16.5 21L22 15',
  ],
  backup: [
    { circle: [9, 7, 4] },
    'M2 21C2 16.6 5 14 9 14C10.5 14 11.8 14.4 13 15',
    'M18 14V22M14 18H22',
  ],
  message: ['M2 3H22V17H10L5 21V17H2V3Z', 'M7 8H17M7 12H13'],
  support: [
    'M4 14V11A8 8 0 0 1 20 11V14',
    'M4 13H7V19H4V13Z',
    'M17 13H20V19H17V13Z',
    'M20 19C20 21 18 22 15 22H12',
  ],
  phone: [
    'M8 3H3C3 15 9 21 21 21V16L16.5 14L13.5 16.5C10 15 9 14 7.5 10.5L10 7.5L8 3Z',
  ],
  mail: ['M2 3.5H22V20.5H2V3.5Z', 'M6 8L12 12L18 8'],

  /* ---------- the views ---------- */
  cases: ['M2 13L5 3H19L22 13V21H2V13Z', 'M2 13H8L9.5 16H14.5L16 13H22'],
  book: [
    'M12 6C10 4 7 3.5 2 3.5V19.5C7 19.5 10 20 12 22C14 20 17 19.5 22 19.5V3.5C17 3.5 14 4 12 6Z',
    'M12 6V22',
  ],
} satisfies Record<string, Path[]>

export type IconName = keyof typeof ICONS

export const ICON_NAMES = Object.keys(ICONS) as IconName[]

export function Icon({
  name,
  size = 16,
  className,
  label,
}: {
  name: IconName
  size?: number
  className?: string
  /** Give a label only when the icon carries meaning that no nearby text says. */
  label?: string
}) {
  const parts: Path[] = ICONS[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      // Bahn's 1.75, but never thinner than 1.2px on screen: at the 13px the
      // queue uses, 1.75 would draw under a pixel and go grey.
      strokeWidth={Math.max(1.75, (1.2 * 24) / size)}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={'shrink-0 ' + (className ?? '')}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <path key={i} d={p} />
        ) : (
          <circle key={i} cx={p.circle[0]} cy={p.circle[1]} r={p.circle[2]} />
        ),
      )}
    </svg>
  )
}
