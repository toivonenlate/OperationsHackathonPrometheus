// Small shared pieces: code chips and the date format used across views.
export function Code({ children }: { children: string }) {
  return (
    <code className="rounded-[5px] bg-fill px-[5px] py-[1.5px] font-mono text-[12px] text-label">
      {children}
    </code>
  )
}

export function Chevron() {
  return (
    <svg className="size-[11px]" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M4.2 2.4 8.1 6l-3.9 3.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
