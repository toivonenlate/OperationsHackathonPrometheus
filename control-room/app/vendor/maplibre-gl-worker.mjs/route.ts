// MapLibre parses tiles in a web worker it finds next to its own bundle. The
// bundler renames and moves that bundle, so the worker is served from here,
// read straight out of the installed package so the two never drift apart.
import fs from 'node:fs/promises'
import path from 'node:path'

export async function GET() {
  const file = path.join(process.cwd(), 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs')
  return new Response(await fs.readFile(file), {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  })
}
