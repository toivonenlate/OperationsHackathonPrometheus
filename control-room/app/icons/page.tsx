// The icon set on one page: every glyph at the three sizes the app uses, and
// once in each tone. Not in the nav; it is for whoever is adding a view.
import { Icon, ICON_NAMES } from '../components/icons'

const TONES = [
  ['text-label', 'asphalt'],
  ['text-red', 'danger'],
  ['text-orange', 'risk'],
  ['text-teal', 'agent'],
  ['text-green', 'confirmed'],
] as const

export const metadata = { title: 'Icons · BahnOS' }

export default function IconsPage() {
  return (
    <main className="min-h-screen bg-canvas px-5 py-10">
      <div className="mx-auto max-w-[1020px]">
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-label">
          Icons
        </h1>
        <p className="mt-1 max-w-[560px] text-[14px] text-secondary">
          {ICON_NAMES.length} glyphs on a 24 grid, 1.75 stroke, square caps,
          sharp corners — the way bahnexpress.fi draws. Colour comes from the
          surrounding text.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-hair bg-hair sm:grid-cols-4 lg:grid-cols-6">
          {ICON_NAMES.map((name) => (
            <div key={name} className="flex flex-col items-center gap-3 bg-card px-3 pt-6 pb-4">
              <div className="flex items-end gap-4 text-label">
                <Icon name={name} size={40} />
                <Icon name={name} size={24} />
                <Icon name={name} size={16} />
              </div>
              <code className="font-mono text-[11.5px] text-secondary">{name}</code>
            </div>
          ))}
        </div>

        <h2 className="mt-12 text-[15px] font-semibold text-label">In tone</h2>
        <div className="mt-3 flex flex-col gap-2">
          {TONES.map(([cls, label]) => (
            <div key={cls} className={`flex flex-wrap items-center gap-[10px] ${cls}`}>
              <span className="w-[80px] font-mono text-[11px] text-tertiary">{label}</span>
              {ICON_NAMES.map((name) => (
                <Icon key={name} name={name} size={16} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
