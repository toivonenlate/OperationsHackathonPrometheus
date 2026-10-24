import { buildCases } from '../lib/cases'

const cases = buildCases()
console.log(`${cases.length} cases\n`)
for (const [i, c] of cases.slice(0, 12).entries()) {
  console.log(`${String(i + 1).padStart(2)}. [${String(c.score).padStart(2)}] ${c.badge}  —  ${c.title} (${c.subtitle})`)
  console.log(`      ${c.brief}`)
  for (const f of c.facts) console.log(`      ${f.label.padEnd(12)} ${f.value}`)
  console.log(`      → ${c.action}${c.otherSignals ? `   (+${c.otherSignals} other signals)` : ''}`)
  console.log()
}
