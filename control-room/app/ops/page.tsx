// The ops map is the front door now; old links land there.
import { permanentRedirect } from 'next/navigation'

export default function OpsRedirect() {
  permanentRedirect('/')
}
