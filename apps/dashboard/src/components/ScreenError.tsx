import { Component, Suspense, type ComponentType, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useLang } from '../i18n'
import { Button, Notice } from './ui'

// Screens are separate files, loaded when first opened. Loading one can fail: the connection drops, or a new version was
// deployed and the old file names are gone (the page still runs the previous build). Without help React draws nothing.
//
// loadScreen retries once; if it still fails while the device is online, the page reloads once to fetch the new build
// (remembered for a minute, so a broken server never loops). Offline, or after that one reload, the error reaches
// ScreenBoundary, which shows a message and a Reload button instead of a blank page.
const reloadKey = 'uddokta:reloaded-for-update'
function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(reloadKey) ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(reloadKey, String(Date.now()))
  } catch { return false }
  window.location.reload()
  return true
}

export async function loadScreen<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch {
    await new Promise((done) => setTimeout(done, 800))
    try {
      return await load()
    } catch (err) {
      // The reload replaces this page; wait for it rather than flashing an error.
      if (navigator.onLine && reloadOnce()) return new Promise<T>(() => {})
      throw err
    }
  }
}

// Vite reports a failed preload (a screen's shared code or styles) here; same remedy.
if (typeof window !== 'undefined') window.addEventListener('vite:preloadError', (e) => { if (navigator.onLine && reloadOnce()) e.preventDefault() })

// resetKey: a new value (another page) clears the error without remounting the screen, so navigation keeps its usual
// behaviour (the current screen stays until the next one has loaded).
class Boundary extends Component<{ children: ReactNode; fallback: ComponentType<{ error: Error }>; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidUpdate(previous: { resetKey?: string }) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null })
  }
  render() {
    const Fallback = this.props.fallback
    return this.state.error ? <Fallback error={this.state.error} /> : this.props.children
  }
}

const isLoadError = (error: Error) => /dynamically imported module|Importing a module script failed|error loading dynamically|Loading chunk|preload/i.test(error.message)

function ScreenFailed({ error }: { error: Error }) {
  const { lang } = useLang()
  const L = (bn: string, en: string) => (lang === 'bn' ? bn : en)
  const offline = !navigator.onLine
  const loading = offline || isLoadError(error)
  return (
    <div className="page">
      <Notice role="alert"
        title={loading ? L('পেজটি লোড হয়নি', 'This page did not load') : L('কিছু একটা ভুল হয়েছে', 'Something went wrong')}
        body={offline ? L('ইন্টারনেট সংযোগ নেই। সংযোগ ফিরলে আবার লোড করুন।', 'You are offline. Reload once the connection is back.')
          : loading ? L('ইন্টারনেট সংযোগ দুর্বল, অথবা উদ্যোক্তার নতুন সংস্করণ এসেছে। আবার লোড করলেই ঠিক হয়ে যাবে।', 'The connection dropped, or a new version of Uddokta is out. Reloading fixes it.')
          : L('পেজটি আবার লোড করে দেখুন। বারবার হলে সাপোর্টে জানান।', 'Reload the page. If it keeps happening, tell support.')}
        action={<Button variant="primary" onClick={() => window.location.reload()}>{L('আবার লোড করুন', 'Reload')}</Button>} />
    </div>
  )
}

// Around each screen (the area beside the sidebar): a failed or crashed screen shows ScreenFailed, the shell stays, and
// opening another page clears it.
export function ScreenBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <Boundary resetKey={pathname} fallback={ScreenFailed}><Suspense fallback={null}>{children}</Suspense></Boundary>
}

// Around the whole app, for anything outside a screen (the shell itself).
export function AppBoundary({ children }: { children: ReactNode }) {
  return <Boundary fallback={ScreenFailed}>{children}</Boundary>
}
