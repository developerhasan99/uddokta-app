import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleCheck, X } from 'lucide-react'
import { useLang } from '../i18n'

// Row selection for a data table. Only ids still in the list count, so reloading or filtering never acts on hidden rows.
export function useSelection(ids: string[]) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ done: number; failed: number } | null>(null)
  const selected = ids.filter((id) => picked.has(id))
  const all = ids.length > 0 && selected.length === ids.length
  return {
    selected, all, busy, result,
    some: selected.length > 0 && !all,
    has: (id: string) => picked.has(id),
    toggle: (id: string) => setPicked((prev) => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next }),
    toggleAll: () => setPicked(all ? new Set() : new Set(ids)),
    clear: () => setPicked(new Set()),
    dismiss: () => setResult(null),
    // ponytail: one existing per-item request each, in parallel; add a bulk endpoint if sellers act on hundreds at once.
    run: async (action: (id: string) => Promise<unknown>) => {
      const ids = selected
      setBusy(true)
      setResult(null)
      const outcomes = await Promise.allSettled(ids.map(action))
      const failed = ids.filter((_, i) => outcomes[i].status === 'rejected')
      setPicked(new Set(failed))
      setBusy(false)
      setResult({ done: ids.length - failed.length, failed: failed.length })
    },
  }
}
export type Selection = ReturnType<typeof useSelection>

export function Check({ checked, mixed, label, disabled, onChange }: { checked: boolean; mixed?: boolean; label: string; disabled?: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!mixed }, [mixed])
  return <input ref={ref} type="checkbox" className="check" checked={checked} disabled={disabled} aria-label={label} onChange={onChange} onClick={(e) => e.stopPropagation()} />
}

export function SelectAllCell({ selection }: { selection: Selection }) {
  const { t } = useLang()
  return <th scope="col" className="data-table__check"><Check checked={selection.all} mixed={selection.some} disabled={selection.busy} label={t('bulkSelectAll')} onChange={selection.toggleAll} /></th>
}

export function SelectCell({ selection, id, name }: { selection: Selection; id: string; name: string }) {
  const { t } = useLang()
  return <td className="data-table__check" onClick={(e) => { e.stopPropagation(); if (!selection.busy) selection.toggle(id) }}>
    <Check checked={selection.has(id)} disabled={selection.busy} label={t('bulkSelectRow', { name })} onChange={() => selection.toggle(id)} />
  </td>
}

// Shown in place of the filter bar while rows are selected; the outcome of the last action shows as a toast.
export function BulkBar({ selection, failedText, children }: { selection: Selection; failedText?: string; children: ReactNode }) {
  const { t, num } = useLang()
  const { result, dismiss } = selection
  useEffect(() => {
    if (!result || result.failed) return
    const timer = setTimeout(dismiss, 3000)
    return () => clearTimeout(timer)
  }, [result]) // eslint-disable-line react-hooks/exhaustive-deps -- dismiss only clears state
  return <>
    {selection.selected.length > 0 && <div className="filter-bar data-list__bulk" role="group" aria-label={t('bulkSelected', { n: num(selection.selected.length) })}>
      <Check checked={selection.all} mixed={selection.some} disabled={selection.busy} label={t('bulkSelectAll')} onChange={selection.toggleAll} />
      <strong>{t('bulkSelected', { n: num(selection.selected.length) })}</strong>
      <div className="data-list__bulk-actions">{children}</div>
      <button type="button" className="btn btn--icon data-list__bulk-clear" aria-label={t('bulkClear')} disabled={selection.busy} onClick={selection.clear}><X size={16} aria-hidden="true" /></button>
    </div>}
    {createPortal(<div className="bulk-toast" role="status">
      {result && <p className="toast">
        {result.failed === 0 && <CircleCheck size={18} aria-hidden="true" />}
        <span>{result.done > 0 && t('bulkDone', { n: num(result.done) })}{result.failed > 0 && ` ${failedText ?? t('bulkFailed', { n: num(result.failed) })}`}</span>
        <button type="button" className="toast__close" aria-label={t('mediaClose')} onClick={dismiss}><X size={14} aria-hidden="true" /></button>
      </p>}
    </div>, document.body)}
  </>
}

// Delete with a second click to confirm, kept inside the bulk bar so nothing jumps.
export function BulkDelete({ selection, onDelete }: { selection: Selection; onDelete: () => void }) {
  const { t, num } = useLang()
  const [confirming, setConfirming] = useState(false)
  if (!confirming) return <button type="button" className="btn btn--default" disabled={selection.busy} aria-busy={selection.busy} onClick={() => setConfirming(true)}>{t(selection.busy ? 'loading' : 'bulkDelete')}</button>
  return <>
    <span>{t('bulkDeleteConfirm', { n: num(selection.selected.length) })}</span>
    <button type="button" className="btn btn--default" onClick={() => setConfirming(false)}>{t('cancel')}</button>
    <button type="button" className="btn btn--danger" onClick={() => { setConfirming(false); onDelete() }}>{t('bulkDelete')}</button>
  </>
}
