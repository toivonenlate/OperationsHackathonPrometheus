// The live layer over HTTP: GET streams the world as server-sent events, one
// frame a second; POST is every decision and control, from any tab.
import { type Action, act, snapshotJson, subscribe } from '../../../lib/live'

export async function GET(request: Request) {
  const enc = new TextEncoder()
  let off = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const send = (json: string) => {
        try {
          ctrl.enqueue(enc.encode(`data: ${json}\n\n`))
        } catch {
          off()
        }
      }
      send(snapshotJson())
      off = subscribe(send)
      request.signal.addEventListener('abort', () => {
        off()
        try {
          ctrl.close()
        } catch {}
      })
    },
    cancel() {
      off()
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}

export async function POST(request: Request) {
  const action = (await request.json()) as Action
  const result = act(action)
  return Response.json(result, { status: result.ok ? 200 : 409 })
}
