// Small shared pieces: code chips and the date format used across views.
import { Icon } from './icons'

export function Code({ children }: { children: string }) {
  return (
    <code className="rounded-[5px] bg-fill px-[5px] py-[1.5px] font-mono text-[12px] text-label">
      {children}
    </code>
  )
}

export function Chevron({ className }: { className?: string }) {
  return <Icon name="chevron-right" size={11} className={className} />
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
