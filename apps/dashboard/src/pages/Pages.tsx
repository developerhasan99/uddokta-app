import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { Copy, CopyPlus, Download, ExternalLink, LayoutTemplate, MoreHorizontal, Plus, Trash2, Upload } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { pageHref } from 'storefront/paths'
import { api, errorCode, storefrontUrl } from '../api'
import { Badge, Button, Notice, PageHeader, SearchInput, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import { DialogHead } from '../components/DialogHead'
import { useDialog } from '../components/dialog'
import { NewCampaignDialog } from './NewCampaignDialog'

export type PageRow = { id: string; title: string; handle: string; publishedHandle: string | null; isPublished: boolean; hasChanges: boolean; updatedAt: string }

export function PageStatus({ page }: { page: Pick<PageRow, 'isPublished' | 'hasChanges'> }) {
  const { t } = useLang()
  if (!page.isPublished) return <Badge>{t('pageDraft')}</Badge>
  return page.hasChanges ? <Badge tone="warning">{t('pageHasChanges')}</Badge> : <Badge tone="success">{t('pageLive')}</Badge>
}

export function Pages() {
  const { t, time, num, lang } = useLang()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const status = ['live', 'draft', 'changes'].includes(params.get('status') ?? '') ? params.get('status')! : ''
  const sort = params.get('sort') === 'title' ? 'title' : 'updated'
  const setFilter = (key: string, value: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }
  const latest = useRef(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)
  const path = useStorePath()
  const navigate = useNavigate()
  const current = useCurrentStore()!
  const handle = current.store.handle
  const [deleting, setDeleting] = useState<PageRow | null>(null)
  const base = `/stores/${handle}/pages`
  const [rows, setRows] = useState<PageRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const duplicateRequest = useRef(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const request = ++latest.current
    setFailed(false)
    setRows(null)
    setCopied(null)
    setCopyFailed(false)
    try {
      const result = await api<PageRow[]>(base)
      if (request === latest.current) setRows(result)
    } catch {
      if (request === latest.current) setFailed(true)
    }
  }, [base])

  useEffect(() => {
    void load()
    return () => { latest.current += 1 }
  }, [load])

  // Export downloads a signed file; Import takes only such files and opens the new (unpublished) page.
  const exportPage = async (row: PageRow) => {
    try {
      const file = await api(`${base}/${row.id}/export`)
      const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }))
      const link = Object.assign(document.createElement('a'), { href: url, download: `${row.handle || 'page'}.uddokta-page.json` })
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) { setDuplicateError(errorCode(err)) }
  }
  const importFile = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const importPage = async (file: File) => {
    setImporting(true)
    setDuplicateError(null)
    try {
      const body = JSON.parse(await file.text())
      const page = await api<{ id: string }>(`${base}/import`, { method: 'POST', body })
      navigate(path(`/landing-pages/${page.id}`))
    } catch (err) { setDuplicateError(err instanceof SyntaxError ? 'importInvalid' : errorCode(err)) }
    finally { setImporting(false); if (importFile.current) importFile.current.value = '' }
  }
  const addButton = <div className="row">
    <input ref={importFile} type="file" accept=".json,application/json" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importPage(f) }} />
    <Button disabled={importing} onClick={() => importFile.current?.click()}><Upload size={16} aria-hidden="true" />{importing ? t('pageImporting') : t('pageImport')}</Button>
    <Button variant="primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />{t('pageAdd')}</Button>
  </div>
  const none = rows !== null && rows.length === 0
  const matchesStatus = (row: PageRow, value: string) => value === 'live' ? row.isPublished : value === 'draft' ? !row.isPublished : value === 'changes' ? row.hasChanges : true
  const visible = (rows ?? []).filter((row) => matchesStatus(row, status) && `${row.title} ${row.handle} ${row.publishedHandle ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, lang) : b.updatedAt.localeCompare(a.updatedAt))
  const liveUrl = (row: PageRow) => `${storefrontUrl(handle)}${pageHref(row.publishedHandle ?? row.handle)}`
  const copyLink = async (row: PageRow) => {
    setCopied(null)
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(liveUrl(row))
      setCopied(row.id)
      window.setTimeout(() => setCopied((c) => (c === row.id ? null : c)), 3000)
    } catch { setCopyFailed(true) }
  }

  const duplicate = async (row: PageRow) => {
    if (duplicateRequest.current) return
    duplicateRequest.current = true
    setDuplicating(row.id)
    setDuplicateError(null)
    try {
      const page = await api<{ id: string }>(`${base}/${row.id}/duplicate`, { method: 'POST', body: { title: `${row.title.slice(0, 180)} (${t('campaignCopySuffix')})` } })
      navigate(path(`/landing-pages/${page.id}`))
    } catch (err) { setDuplicateError(errorCode(err)) }
    finally { duplicateRequest.current = false; setDuplicating(null) }
  }

  return (
    <div className="page pages-manager">
      <PageHeader title={t('landingPages')} description={t('landingPages.d')} action={none ? undefined : addButton} />

      {failed && <section className="card card--flush"><Notice role="alert" title={t('pagesLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}

      {duplicateError && <p className="form-error" role="alert">{t(errorLabel(duplicateError))}</p>}

      {!failed && none && (
        <section className="empty-card">
          <LayoutTemplate size={32} strokeWidth={1.5} aria-hidden="true" />
          <h2>{t('pageEmptyTitle')}</h2>
          <p className="muted">{t('pageEmptyBody')}</p>
          {addButton}
        </section>
      )}

      {!failed && !rows && (
        <div className="data-list" role="status" aria-label={t('loading')}>
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton-row"><Skeleton width="16rem" /><Skeleton width="5rem" /></div>)}
        </div>
      )}

      {!failed && rows && rows.length > 0 && (
        <section className="data-list">
          <div className="filter-bar">
            <nav className="tabs" aria-label={t('pageStatus')}>
              {([{ value: '', label: 'statusAll' }, { value: 'live', label: 'pageLive' }, { value: 'draft', label: 'pageDraft' }, { value: 'changes', label: 'pagesFilterChanges' }] as const).map((tab) => <button type="button" key={tab.value} className="tab" aria-current={status === tab.value ? 'page' : undefined} onClick={() => setFilter('status', tab.value)}>{t(tab.label)} <span className="tab__count">{num(rows.filter((row) => matchesStatus(row, tab.value)).length)}</span></button>)}
            </nav>
            <div className="pages-bar__tools">
              <SearchInput label={t('pagesSearch')} value={query} onChange={(e) => setFilter('q', e.target.value)} />
            <label className="pages-sort"><span className="visually-hidden">{t('pagesSort')}</span><select className="input" value={sort} onChange={(e) => setFilter('sort', e.target.value)}><option value="updated">{t('pagesSortUpdated')}</option><option value="title">{t('pagesSortTitle')}</option></select></label>
            </div>
          </div>
          {copyFailed && <p className="form-error pages-feedback" role="alert">{t('pagesCopyFailed')}</p>}
          <p className="muted pages-feedback" role="status" hidden={!copied}>{copied ? t('pagesCopied') : ''}</p>
          {visible.length === 0 ? <Notice title={t('pagesNoMatch')} body={t('pagesNoMatchHelp')} action={<Button onClick={() => setParams({}, { replace: true })}>{t('pagesClearFilters')}</Button>} /> : <table className="data-table pages-table">
            <thead>
              <tr>
                <th scope="col">{t('pageTitle')}</th>
                <th scope="col" className="pages-table__link">{t('colLink')}</th>
                <th scope="col" className="pages-table__status">{t('pageStatus')}</th>
                <th scope="col" className="data-table__meta">{t('pageUpdated')}</th>
                <th scope="col" className="pages-table__actions"><span className="visually-hidden">{t('pagesActions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="data-table__row" onClick={() => navigate(path(`/landing-pages/${row.id}`))}>
                  <td>
                    <Link className="data-table__file" to={path(`/landing-pages/${row.id}`)} onClick={(e) => e.stopPropagation()}>
                      <span className="data-table__text">
                        <span className="data-table__name" title={row.title}>{row.title}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="pages-table__link data-table__truncate muted" title={`/${row.handle}`}>/{row.handle}</td>
                  <td className="pages-table__status"><PageStatus page={row} /></td>
                  <td className="data-table__meta">{time(row.updatedAt)}</td>
                  <td className="pages-table__actions" onClick={(e) => e.stopPropagation()}>
                    <Dropdown.Root>
                      <Dropdown.Trigger className="btn btn--icon pages-table__more" aria-label={`${t('pagesActions')}: ${row.title}`} title={t('pagesActions')} aria-busy={duplicating === row.id}><MoreHorizontal size={16} aria-hidden="true" /></Dropdown.Trigger>
                      <Dropdown.Portal><Dropdown.Content className="menu menu--compact" align="end" sideOffset={6} collisionPadding={8}>
                        <div className="menu__section">
                          {row.isPublished && <>
                            <Dropdown.Item asChild className="menu__item menu__action"><a href={liveUrl(row)} target="_blank" rel="noopener"><ExternalLink size={16} aria-hidden="true" />{t('pagesView')}</a></Dropdown.Item>
                            <Dropdown.Item className="menu__item menu__action" onSelect={() => void copyLink(row)}><Copy size={16} aria-hidden="true" />{t('mediaCopyLink')}</Dropdown.Item>
                          </>}
                          <Dropdown.Item className="menu__item menu__action" disabled={duplicating !== null} onSelect={() => void duplicate(row)}><CopyPlus size={16} aria-hidden="true" />{t('campaignDuplicate')}</Dropdown.Item>
                          <Dropdown.Item className="menu__item menu__action" onSelect={() => void exportPage(row)}><Download size={16} aria-hidden="true" />{t('pageExport')}</Dropdown.Item>
                          {current.role !== 'staff' && <Dropdown.Item className="menu__item menu__action menu__item--danger" onSelect={() => setDeleting(row)}><Trash2 size={16} aria-hidden="true" />{t('pageDelete')}</Dropdown.Item>}
                        </div>
                      </Dropdown.Content></Dropdown.Portal>
                    </Dropdown.Root>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
          <footer className="data-list__footer"><span role="status">{t('pagesShowing', { n: num(visible.length), total: num(rows.length) })}</span></footer>
        </section>
      )}

      {creating && <NewCampaignDialog key={handle} onClose={() => setCreating(false)} />}
      {deleting && <DeletePageDialog url={`${base}/${deleting.id}`} title={deleting.title} onClose={() => setDeleting(null)} onDeleted={() => setRows((r) => r && r.filter((x) => x.id !== deleting.id))} />}
    </div>
  )
}

function DeletePageDialog({ url, title, onClose, onDeleted }: { url: string; title: string; onClose: () => void; onDeleted: () => void }) {
  const { t } = useLang()
  const { ref, close, props } = useDialog(onClose)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { ref.current?.showModal() }, [ref])
  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await api(url, { method: 'DELETE' })
      close(() => { onDeleted(); onClose() })
    } catch (err) { setError(errorCode(err)); setBusy(false) }
  }
  return <dialog {...props} className="modal" aria-labelledby="page-delete-title" onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
    <DialogHead id="page-delete-title" title={t('pageDelete')} sub={title} disabled={busy} onClose={() => close()} />
    <div className="dialog__body">
      <p className="muted">{t('pageDeleteWarning')}</p>
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
    </div>
    <div className="dialog__foot">
      <Button disabled={busy} onClick={() => close()}>{t('cancel')}</Button>
      <Button variant="danger" disabled={busy} onClick={() => void remove()}>{t('productConfirmDelete')}</Button>
    </div>
  </dialog>
}
