// The markets Bahn runs desks in. Shared by the server (which fetches their
// news and holidays) and the browser (which keeps their clocks).

export type MarketCode = 'FI' | 'DK' | 'DE'

export const MARKETS: { code: MarketCode; name: string; city: string; tz: string }[] = [
  { code: 'FI', name: 'Finland', city: 'Helsinki', tz: 'Europe/Helsinki' },
  { code: 'DK', name: 'Denmark', city: 'Copenhagen', tz: 'Europe/Copenhagen' },
  { code: 'DE', name: 'Germany', city: 'Berlin', tz: 'Europe/Berlin' },
]

export type NewsKind = 'strike' | 'ferry' | 'weather' | 'traffic' | 'holiday'

export type NewsItem = {
  /** A market, or INTL for cross-border reporting in English. */
  market: MarketCode | 'INTL'
  kind: NewsKind
  title: string
  source: string | null
  url: string
  published: number
}

export type Holiday = {
  market: MarketCode
  /** YYYY-MM-DD, the local calendar day. */
  date: string
  name: string
  localName: string
  /** Region codes when the day is not observed nationwide (DE-BY …). */
  regions: string[] | null
}

export type Watch = {
  fetchedAt: number
  holidays: Holiday[]
  news: NewsItem[]
  /** Feeds that could not be reached; the panel says so rather than look quiet. */
  failed: string[]
}

/** YYYY-MM-DD for an instant, on a market's own calendar. */
export function localDay(t: number, tz: string): string {
  return new Date(t).toLocaleDateString('en-CA', { timeZone: tz })
}
