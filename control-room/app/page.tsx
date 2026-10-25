// The ops map: the whole network on one screen, and where BahnOS starts.
//
// Every other view is one click from here: a lane opens its case, the
// queue says what to do first. Each order is a lane between two cities,
// coloured by what it needs, and every panel filters every other one. Built
// from the records at the snapshot; the disruption watch beside it is live
// and streams in after the map.
import { buildOps } from '../lib/ops'
import { loadWatch } from '../lib/watch'
import Shell from './components/shell'
import Console from './ops/console'

export const metadata = { title: 'Ops map · BahnOS' }

export default function OpsPage() {
  return (
    <Shell active="ops" wide>
      <Console model={buildOps()} watch={loadWatch()} />
    </Shell>
  )
}
