import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useDialog } from '../../dashboard/src/components/dialog'
import { Button } from '../../dashboard/src/components/ui'
import { errorText } from './api'

// A modal from the shared dialog helper (animated in and out, closes on Esc and backdrop).
export function Modal({ title, sub, onClose, children, foot }: { title: string; sub?: string; onClose: () => void; children: ReactNode; foot: (close: (then?: () => void) => void) => ReactNode }) {
  const { ref, close, props } = useDialog(onClose)
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal() }, [ref])
  return (
    <dialog className="modal" aria-labelledby="console-dialog-title" {...props}>
      <header className="dialog__head">
        <div className="dialog__title">
          <h2 id="console-dialog-title">{title}</h2>
          {sub && <p className="dialog__sub">{sub}</p>}
        </div>
        <button type="button" className="dialog__close" aria-label="Close" onClick={() => close()}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="dialog__body console-form">{children}</div>
      <footer className="dialog__foot">{foot(close)}</footer>
    </dialog>
  )
}

// Every change in the console says why; the reason is kept in the audit log.
export function ReasonDialog({ title, sub, action, danger, onConfirm, onClose, onDone }: {
  title: string; sub?: string; action: string; danger?: boolean
  onConfirm: (reason: string) => Promise<unknown>; onClose: () => void; onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal title={title} sub={sub} onClose={onClose} foot={(close) => <>
      <Button onClick={() => close()}>Cancel</Button>
      <Button variant={danger ? 'danger' : 'primary'} aria-busy={busy} disabled={!reason.trim()} onClick={async () => {
        setBusy(true); setError(null)
        try { await onConfirm(reason.trim()); close(onDone) } catch (err) { setError(errorText(err)); setBusy(false) }
      }}>{action}</Button>
    </>}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="field">
        <label htmlFor="console-reason">Reason</label>
        <textarea id="console-reason" className="input console-textarea" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kept in the audit log" />
      </div>
    </Modal>
  )
}

export function Loading() {
  return <div className="console-loading" role="status" aria-label="Loading" />
}

export function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="notice"><h2>{errorText(error)}</h2><Button onClick={retry}>Try again</Button></div>
}

// Loads once and again on demand; the screens keep their own forms.
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: unknown }>({})
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    load().then((data) => { if (live) setState({ data }) }, (error) => { if (live) setState({ error }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { ...state, reload: () => setTick((n) => n + 1) }
}
