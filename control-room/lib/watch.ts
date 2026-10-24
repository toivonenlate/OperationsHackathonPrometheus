// The world outside the records: public holidays and news that could slow a
// delivery down. Unlike everything else in BahnOS this is live, not the
// snapshot, and it is never mixed into a case. It sits beside the map so an
// operator sees a strike before a driver calls about it.
//
// Holidays come from Nager.Date. News comes from Google News search feeds, one
// per market in its own language plus one in English for cross-border
// reporting, and only headlines that name a strike, a closure, weather, a
// ferry or a holiday are kept. Every feed fails soft and is named if it does.
import { SNAPSHOT_AT } from './data'
import { type Holiday, MARKETS, type MarketCode, type NewsItem, type NewsKind, type Watch } from './markets'

const DAY = 86_400_000
const TIMEOUT = 5000

const QUERIES: { market: MarketCode | 'INTL'; q: string; hl: string; gl: string; ceid: string }[] = [
  {
    market: 'FI',
    q: 'lakko OR ruuhka OR liikennehäiriö OR "tie suljettu" OR myrsky OR liukas OR satama OR Finnlines OR Tallink OR "Viking Line"',
    hl: 'fi', gl: 'FI', ceid: 'FI:fi',
  },
  {
    market: 'DK',
    // Danish and Norwegian share these words, so the query has to name Danish places.
    q: '(strejke OR kø OR motorvej OR storm OR færge OR "lukket vej" OR glatføre) (Danmark OR Jylland OR Sjælland OR Fyn OR København OR Storebælt OR Øresund OR Aarhus OR Odense)',
    hl: 'da', gl: 'DK', ceid: 'DK:da',
  },
  {
    market: 'DE',
    q: 'Streik OR Stau OR Vollsperrung OR Unwetter OR Glätte OR Fähre OR Hafen OR Autobahn',
    hl: 'de', gl: 'DE', ceid: 'DE:de',
  },
  {
    market: 'INTL',
    q: '(strike OR closure OR storm OR blockade) (ferry OR port OR motorway OR autobahn OR trucking) (Finland OR Germany OR Denmark OR Baltic)',
    hl: 'en-GB', gl: 'GB', ceid: 'GB:en',
  },
]

// First match wins, so the most disruptive reading of a headline is the one kept.
const KINDS: [NewsKind, RegExp][] = [
  ['strike', /streik|strejke|lakko|lakon|lakkoon|ulosmarssi|työtaistelu|strike|walkout|blockade|lockout|grève/],
  ['ferry', /ferry|ferries|fähre|færge|lautta|finnlines|tallink|viking line|tt-line|stena|scandlines|satama|(?<!flug)hafen|\bhavn(e|en|ene)?\b|\bport\b/],
  ['weather', /sturm|unwetter|glätte|glatteis|schnee|orkan|hochwasser|myrsky|lumi|liukas|tulva|storm|glatføre|sne|snow|flood|blizzard|ice /],
  ['traffic', /stau|sperrung|gesperrt|baustelle|unfall|autobahn|ruuhka|liikenne|suljettu|kolari|onnettomuus|kø|motorvej|lukket|trafik|traffic|jam|closure|closed|motorway/],
  ['holiday', /feiertag|ferien|pyhä|loma|helligdag|ferie|holiday/],
]

// English results drift worldwide; keep the ones that name somewhere Bahn drives.
const NEAR =
  /finland|finnish|germany|german|denmark|danish|baltic|nordic|scandinavia|sweden|helsinki|hamburg|copenhagen|berlin|rostock|travemünde|kiel|autobahn|øresund|great belt/

function kindOf(title: string): NewsKind | null {
  const t = title.toLowerCase()
  for (const [kind, re] of KINDS) if (re.test(t)) return kind
  return null
}

function decode(s: string): string {
  return s
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  return m ? decode(m[1]) : null
}

async function news(feed: (typeof QUERIES)[number]): Promise<NewsItem[]> {
  const url =
    'https://news.google.com/rss/search?' +
    new URLSearchParams({ q: `${feed.q} when:7d`, hl: feed.hl, gl: feed.gl, ceid: feed.ceid })
  const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw new Error(`news ${feed.market} ${res.status}`)
  const xml = await res.text()
  const out: NewsItem[] = []
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const source = tag(item, 'source')
    let title = tag(item, 'title') ?? ''
    // Google appends " - Source" to every headline.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3))
    const kind = kindOf(title)
    const link = tag(item, 'link')
    const published = Date.parse(tag(item, 'pubDate') ?? '')
    if (!kind || !link || Number.isNaN(published)) continue
    if (feed.market === 'INTL' && !NEAR.test(title.toLowerCase())) continue
    out.push({ market: feed.market, kind, title, source, url: link, published })
  }
  return out
}

async function holidays(market: MarketCode, year: number): Promise<Holiday[]> {
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${market}`, {
    next: { revalidate: 86_400 },
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (!res.ok) throw new Error(`holidays ${market} ${res.status}`)
  const rows = (await res.json()) as {
    date: string
    name: string
    localName: string
    global: boolean
    counties: string[] | null
  }[]
  return rows.map((r) => ({
    market,
    date: r.date,
    name: r.name,
    localName: r.localName,
    regions: r.global ? null : r.counties,
  }))
}

export async function loadWatch(): Promise<Watch> {
  const now = Date.now()
  // From the snapshot, so the records' own days are covered, to a month ahead of today.
  const from = new Date(Math.min(now, SNAPSHOT_AT.getTime())).toISOString().slice(0, 10)
  const to = new Date(now + 30 * DAY).toISOString().slice(0, 10)
  const years = [...new Set([from.slice(0, 4), to.slice(0, 4)].map(Number))]

  const failed: string[] = []
  const settle = async <T,>(label: string, p: Promise<T[]>): Promise<T[]> => {
    try {
      return await p
    } catch {
      failed.push(label)
      return []
    }
  }

  const [h, n] = await Promise.all([
    Promise.all(
      MARKETS.flatMap((m) => years.map((y) => settle(`${m.name} holidays`, holidays(m.code, y)))),
    ),
    Promise.all(QUERIES.map((q) => settle(`${q.market === 'INTL' ? 'International' : q.market} news`, news(q)))),
  ])

  const seen = new Set<string>()
  const items = n
    .flat()
    .sort((a, b) => b.published - a.published)
    .filter((i) => {
      const key = i.title.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 80)

  return {
    fetchedAt: now,
    holidays: h
      .flat()
      .filter((x) => x.date >= from && x.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date)),
    news: items,
    failed: [...new Set(failed)],
  }
}
