import { useEffect, useMemo, useState } from 'react'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { Ellipsis, ExternalLink, Eye, EyeOff, ImageOff, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { Badge, Button, PageHeader } from '../../../dashboard/src/components/ui'
import { templateLabels, type TemplateType } from '../../../storefront/src/site'
import { api, count, date, errorText } from '../api'
import { LoadError, Loading, Modal, ReasonDialog, useLoad } from '../ui'

// Demos sellers start from: whole landing pages, templates and single sections. The team designs them in an ordinary
// store with the page builder; here a saved draft becomes a demo (a snapshot, images included). Sellers see only
// published demos and always get their own copy.

type Kind = 'landing' | 'template' | 'section'
type Demo = {
  id: string; kind: Kind; templateType: TemplateType | null; nameBn: string; nameEn: string; category: string; thumb: string | null; previewUrl: string
  status: 'draft' | 'published'; sort: number; version: number; uses: number; images: number; sourceStoreId: string | null; sourceStore: string | null
  sourceId: string | null; sourceSection: string | null; updatedAt: string
}
type Part = { id: string; name: string }
type Sources = {
  store: { id: string; handle: string; name: string }
  pages: { id: string; title: string; sections: Part[] }[]
  templates: { id: string; title: string; type: TemplateType; builtIn: boolean; sections: Part[] }[]
}

const kinds: { key: Kind; label: string; one: string; help: string }[] = [
  { key: 'landing', label: 'Landing pages', one: 'landing page', help: 'A whole landing page. Sellers pick one of their products and it replaces the demo’s product.' },
  { key: 'template', label: 'Templates', one: 'template', help: 'A store template (header, footer, home, product page, …). Offered when a seller makes a template of that type.' },
  { key: 'section', label: 'Sections', one: 'section', help: 'One section of a landing page or template, offered in the editor’s Add section. Store-only blocks are not allowed.' },
]
const storeKey = 'console.demoStore'
const remembered = () => { try { return localStorage.getItem(storeKey) ?? '' } catch { return '' } }
const remember = (handle: string) => { try { localStorage.setItem(storeKey, handle) } catch { /* private window */ } }

// One thing to turn into a demo: a whole landing page, a whole template, or one section of either.
type Pick = { kind: Kind; sourceId: string; section: string | null }
const samePick = (a: Pick | null, b: Pick) => Boolean(a && a.kind === b.kind && a.sourceId === b.sourceId && a.section === b.section)

// Everything the demo store offers, in one list: each landing page and template, with its sections underneath.
function SourcePicker({ sources, value, onChange }: { sources: Sources; value: Pick | null; onChange: (pick: Pick, name: string) => void }) {
  const [q, setQ] = useState('')
  const match = (...texts: string[]) => !q.trim() || texts.some((t) => t.toLowerCase().includes(q.trim().toLowerCase()))
  const row = (pick: Pick, title: string, sub: string, name: string) => (
    <li key={`${pick.sourceId}-${pick.section ?? 'all'}`} className={pick.section ? 'console-source console-source--section' : 'console-source'}>
      <label><input type="radio" name="demo-source" checked={samePick(value, pick)} onChange={() => onChange(pick, name)} />
        <span className="console-source__text"><span>{title}</span><span className="muted">{sub}</span></span></label>
    </li>
  )
  const group = (owner: { id: string; title: string; sections: Part[] }, kind: Kind, sub: string) => {
    const sections = owner.sections.map((s, i) => ({ ...s, label: s.name || `Section ${i + 1}` })).filter((s) => match(owner.title, s.label))
    if (!match(owner.title) && sections.length === 0) return null
    return [row({ kind, sourceId: owner.id, section: null }, owner.title, sub, owner.title),
      ...sections.map((s) => row({ kind: 'section', sourceId: owner.id, section: s.id }, s.label, 'Section only', s.label))]
  }
  return (
    <div className="console-sources">
      <input className="input" type="search" aria-label="Search pages, templates and sections" placeholder="Search pages, templates and sections" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="console-sources__list">
        <p className="console-sources__group">Landing pages</p>
        <ul>{sources.pages.length ? sources.pages.map((p) => group(p, 'landing', `Whole landing page · ${p.sections.length} sections`)) : <li className="muted console-source">No landing pages in this store.</li>}</ul>
        <p className="console-sources__group">Templates</p>
        <ul>{sources.templates.map((t) => group(t, 'template', `Whole ${templateLabels[t.type][1].toLowerCase()} template${t.builtIn ? ' (built-in)' : ''} · ${t.sections.length} sections`))}</ul>
      </div>
    </div>
  )
}

// Where an existing demo came from, in words.
function sourceText(sources: Sources | null, demo: Demo) {
  if (!demo.sourceStore || !demo.sourceId) return 'The source page, template or store was deleted.'
  if (!sources) return `From ${demo.sourceStore}`
  const owner = [...sources.pages, ...sources.templates].find((o) => o.id === demo.sourceId)
  if (!owner) return `From ${demo.sourceStore}: the source was deleted.`
  const index = owner.sections.findIndex((s) => s.id === demo.sourceSection)
  const section = demo.sourceSection ? (index === -1 ? ' › a section that was removed' : ` › section “${owner.sections[index].name || `Section ${index + 1}`}”`) : ''
  return `From ${demo.sourceStore}: “${owner.title}”${section}`
}

function DemoDialog({ demo, categories, onClose, onDone }: { demo: Demo | null; categories: string[]; onClose: () => void; onDone: (kind: Kind) => void }) {
  const [storeHandle, setStoreHandle] = useState(demo?.sourceStore ?? remembered())
  const [sources, setSources] = useState<Sources | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [pick, setPick] = useState<Pick | null>(null)
  const [nameBn, setNameBn] = useState(demo?.nameBn ?? '')
  const [nameEn, setNameEn] = useState(demo?.nameEn ?? '')
  const [category, setCategory] = useState(demo?.category ?? '')
  const [previewUrl, setPreviewUrl] = useState(demo?.previewUrl ?? '')
  const [published, setPublished] = useState(demo ? demo.status === 'published' : false)
  const [sort, setSort] = useState(String(demo?.sort ?? 0))
  const [file, setFile] = useState<File | null>(null)
  const [removed, setRemoved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl) }, [fileUrl])

  const load = async (handle = storeHandle) => {
    if (!handle.trim()) return
    setSourceError(null)
    try { setSources(await api<Sources>(`/console/demos/sources?store=${encodeURIComponent(handle.trim())}`)); setPick(null); remember(handle.trim()) }
    catch (err) { setSources(null); setSourceError(errorText(err)) }
  }
  useEffect(() => { if (storeHandle) void load() }, [])

  const choose = (next: Pick, name: string) => {
    // A fresh choice suggests its name, unless one was typed already.
    if (!nameEn.trim() || (pick && nameEn === suggested)) setNameEn(name.slice(0, 80))
    setSuggested(name.slice(0, 80))
    setPick(next)
  }
  const [suggested, setSuggested] = useState('')
  const thumb = fileUrl ?? (removed ? null : demo?.thumb ?? null)
  const ready = nameBn.trim() && nameEn.trim() && (demo || pick)

  const save = async () => {
    setBusy(true); setError(null)
    const data = {
      nameBn, nameEn, category, previewUrl, status: published ? 'published' : 'draft', sort: Number(sort) || 0, removeThumbnail: removed && !file,
      ...(demo ? {} : { kind: pick!.kind, sourceStoreId: sources!.store.id, sourceId: pick!.sourceId, sourceSection: pick!.section ?? undefined }),
    }
    const form = new FormData()
    form.set('data', JSON.stringify(data))
    if (file) form.set('thumbnail', file)
    try {
      await api(demo ? `/console/demos/${demo.id}` : '/console/demos', { method: demo ? 'PUT' : 'POST', body: form })
      onDone(demo?.kind ?? pick!.kind)
    } catch (err) { setError(errorText(err)); setBusy(false) }
  }

  return (
    <Modal title={demo ? `Edit ${demo.nameEn}` : 'New demo'} sub={demo ? `Version ${demo.version} · used ${count(demo.uses)} times. Content changes come from “Update from source”.` : 'Load the demo store, pick a landing page, template or one section, then name it for sellers.'} onClose={onClose} foot={(close) => <>
      <Button onClick={() => close()}>Cancel</Button>
      <Button variant="primary" aria-busy={busy} disabled={!ready || busy} onClick={() => void save()}>{demo ? 'Save' : 'Create demo'}</Button>
    </>}>
      {error && <p className="form-error" role="alert">{error}</p>}
      {demo ? <div className="field">
        <span className="field__label">Source</span>
        <p className="console-source-line">{kinds.find((k) => k.key === demo.kind)!.one[0].toUpperCase() + kinds.find((k) => k.key === demo.kind)!.one.slice(1)} · {sourceText(sources, demo)}</p>
      </div> : <>
        <div className="field">
          <label htmlFor="demo-store">Demo store address</label>
          <div className="console-inline">
            <input id="demo-store" className="input" placeholder="for example uddokta-demos" value={storeHandle} onChange={(e) => setStoreHandle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void load() } }} />
            <Button onClick={() => void load()}>Load</Button>
          </div>
          <p className="field__help">{sources ? `${sources.store.name}: ${sources.pages.length} landing pages, ${sources.templates.length} templates.` : 'The store where the team designs demos (the part before .uddokta.live). Saved drafts are copied; publishing there is not needed.'}</p>
          {sourceError && <p className="form-error" role="alert">{sourceError}</p>}
        </div>
        {sources && <fieldset className="console-kinds">
          <legend className="field__label">What to add</legend>
          <SourcePicker sources={sources} value={pick} onChange={choose} />
          {pick && <p className="field__help">{kinds.find((k) => k.key === pick.kind)!.help}</p>}
        </fieldset>}
      </>}
      <div className="console-row">
        <div className="field"><label htmlFor="demo-bn">Name in Bangla</label><input id="demo-bn" className="input" maxLength={80} value={nameBn} onChange={(e) => setNameBn(e.target.value)} /></div>
        <div className="field"><label htmlFor="demo-en">Name in English</label><input id="demo-en" className="input" maxLength={80} value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></div>
      </div>
      <div className="console-row">
        <div className="field"><label htmlFor="demo-category">Category <span className="muted">(optional)</span></label>
          <input id="demo-category" className="input" maxLength={40} placeholder="Fashion, Cosmetics, Food…" value={category} onChange={(e) => setCategory(e.target.value)} />
          {categories.length > 0 && <div className="console-chips" role="group" aria-label="Existing categories">
            {categories.map((c) => <button key={c} type="button" className="tab" aria-pressed={category === c} onClick={() => setCategory(category === c ? '' : c)}>{c}</button>)}
          </div>}
        </div>
        <div className="field"><label htmlFor="demo-preview">Live preview link <span className="muted">(optional)</span></label><input id="demo-preview" className="input" type="url" maxLength={500} placeholder="https://…" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} />
          <p className="field__help">The page on the demo store, so sellers can see it full size.</p>
        </div>
      </div>
      <div className="field">
        <span className="field__label">Thumbnail</span>
        <div className="console-thumb-field">
          {thumb ? <img src={thumb} alt="" /> : <span className="console-thumbs__none"><ImageOff size={20} aria-hidden="true" /></span>}
          <div className="console-thumb-field__side">
            <div className="console-actions">
              <label className="btn">{thumb ? 'Replace image' : 'Upload image'}<input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f) { setFile(f); setRemoved(false) } e.target.value = '' }} /></label>
              {thumb && <Button onClick={() => { setFile(null); setRemoved(true) }}>Remove</Button>}
            </div>
            <p className="field__help">A screenshot of the demo, PNG, JPG or WebP up to 10 MB. Cards show its top part (4:3).{demo ? '' : ' Without one, the demo’s first image is used.'}</p>
          </div>
        </div>
      </div>
      <div className="console-row">
        <label className="console-check"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Published: sellers can use it</label>
        <div className="field"><label htmlFor="demo-sort">Order <span className="muted">(lower shows first)</span></label><input id="demo-sort" className="input" inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value.replace(/[^\d-]/g, '').slice(0, 6))} /></div>
      </div>
    </Modal>
  )
}

export function Demos() {
  const { data, error, reload } = useLoad(() => api<Demo[]>('/console/demos'), [])
  const [kind, setKind] = useState<Kind>('landing')
  const [editing, setEditing] = useState<Demo | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Demo | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const rows = (data ?? []).filter((d) => d.kind === kind)
  const categories = [...new Set((data ?? []).map((d) => d.category).filter(Boolean))].sort()

  const refresh = async (d: Demo) => {
    setBusy(d.id); setNote(null)
    try { await api(`/console/demos/${d.id}/snapshot`, { method: 'POST' }); setNote(`“${d.nameEn}” now matches its source. Stores that already used it keep their copies.`); reload() }
    catch (err) { setNote(errorText(err)) }
    setBusy(null)
  }
  // Publish or back to draft from the list: drafts are hidden from sellers at once; pages they made stay.
  const setStatus = async (d: Demo, status: Demo['status']) => {
    setBusy(d.id); setNote(null)
    const form = new FormData()
    form.set('data', JSON.stringify({ nameBn: d.nameBn, nameEn: d.nameEn, category: d.category, previewUrl: d.previewUrl, sort: d.sort, status }))
    try { await api(`/console/demos/${d.id}`, { method: 'PUT', body: form }); setNote(status === 'published' ? `“${d.nameEn}” is published: sellers can use it.` : `“${d.nameEn}” is a draft: sellers no longer see it.`); reload() }
    catch (err) { setNote(errorText(err)) }
    setBusy(null)
  }

  return (
    <div className="page">
      <PageHeader title="Demos" description="Landing pages, templates and sections sellers can start from. Design them in the demo store with the page builder, then add them here." action={<Button variant="primary" onClick={() => setEditing('new')}>New demo</Button>} />
      {note && <p className="console-done" role="status">{note}</p>}
      <div className="data-list">
        <div className="filter-bar">
          <nav className="tabs" aria-label="Kind">
            {kinds.map((k) => <button key={k.key} type="button" className="tab" aria-current={kind === k.key ? 'page' : undefined} onClick={() => setKind(k.key)}>{k.label}<span className="tab__count">{(data ?? []).filter((d) => d.kind === k.key).length}</span></button>)}
          </nav>
        </div>
        {error ? <LoadError error={error} retry={reload} /> : !data ? <Loading /> : rows.length === 0 ? (
          <div className="notice"><h2>No {kinds.find((k) => k.key === kind)!.one} demos yet</h2><p className="muted">Design one in the demo store, then press New demo.</p><Button onClick={() => setEditing('new')}>New demo</Button></div>
        ) : (
          <table className="data-table console-demos">
            <thead><tr><th style={{ width: '5.5rem' }}><span className="visually-hidden">Thumbnail</span></th><th>Demo</th><th>Category</th>{kind === 'template' && <th>Type</th>}<th>Status</th><th className="end">Uses</th><th>Updated</th><th className="end" style={{ width: '11rem' }}><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="data-table__row" onClick={() => setEditing(d)}>
                  <td>{d.thumb ? <img className="console-demo-thumb" src={d.thumb} alt="" loading="lazy" /> : <span className="console-demo-thumb console-thumbs__none"><ImageOff size={16} aria-hidden="true" /></span>}</td>
                  <th scope="row"><button type="button" className="console-link" onClick={(e) => { e.stopPropagation(); setEditing(d) }}>{d.nameEn}</button><span className="console-sub">{d.nameBn}</span></th>
                  <td>{d.category || '—'}</td>
                  {kind === 'template' && <td>{d.templateType ? templateLabels[d.templateType][1] : '—'}</td>}
                  <td>{d.status === 'published' ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}</td>
                  <td className="num end">{count(d.uses)}</td>
                  <td>{date(d.updatedAt)}<span className="console-sub">Version {d.version}</span></td>
                  <td className="end" onClick={(e) => e.stopPropagation()}>
                    <div className="console-actions console-actions--end">
                      {d.status === 'published'
                        ? <Button disabled={busy === d.id} aria-busy={busy === d.id} onClick={() => void setStatus(d, 'draft')}><EyeOff size={14} aria-hidden="true" />Make draft</Button>
                        : <Button variant="primary" disabled={busy === d.id} aria-busy={busy === d.id} onClick={() => void setStatus(d, 'published')}><Eye size={14} aria-hidden="true" />Publish</Button>}
                      <Dropdown.Root>
                        <Dropdown.Trigger asChild><button type="button" className="btn btn--icon" disabled={busy === d.id} aria-label={`More: ${d.nameEn}`}><Ellipsis size={16} aria-hidden="true" /></button></Dropdown.Trigger>
                        <Dropdown.Portal>
                          <Dropdown.Content className="menu menu--compact" align="end" sideOffset={6} collisionPadding={8}>
                            <Dropdown.Group className="menu__section">
                              <Dropdown.Item className="menu__item menu__action" onSelect={() => setEditing(d)}><Pencil size={16} aria-hidden="true" />Edit</Dropdown.Item>
                              {d.previewUrl && <Dropdown.Item className="menu__item menu__action" onSelect={() => window.open(d.previewUrl, '_blank', 'noopener,noreferrer')}><ExternalLink size={16} aria-hidden="true" />Open preview</Dropdown.Item>}
                              <Dropdown.Item className="menu__item menu__action" disabled={!d.sourceId} onSelect={() => void refresh(d)}><RefreshCw size={16} aria-hidden="true" /><span className="menu__text"><span>Update from source</span><span className="menu__sub">{d.sourceStore ? `Copy ${d.sourceStore}’s saved draft again` : 'The source was deleted'}</span></span></Dropdown.Item>
                            </Dropdown.Group>
                            <Dropdown.Group className="menu__section menu__section--ruled">
                              <Dropdown.Item className="menu__item menu__action menu__action--danger" onSelect={() => setDeleting(d)}><Trash2 size={16} aria-hidden="true" />Delete</Dropdown.Item>
                            </Dropdown.Group>
                          </Dropdown.Content>
                        </Dropdown.Portal>
                      </Dropdown.Root>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted console-note">Demos copy the source’s saved draft, with its images, when created or updated; later edits in the demo store change nothing until you press Update from source. Pages sellers already made keep their own copy.</p>
      {editing && <DemoDialog demo={editing === 'new' ? null : editing} categories={categories} onClose={() => setEditing(null)} onDone={(made) => { if (editing === 'new') setKind(made); setNote(editing === 'new' ? 'Demo created.' : 'Demo saved.'); setEditing(null); reload() }} />}
      {deleting && <ReasonDialog title={`Delete “${deleting.nameEn}”?`} sub="Sellers will no longer see it. Pages and templates already made from it stay as they are." action="Delete demo" danger
        onConfirm={(reason) => api(`/console/demos/${deleting.id}`, { method: 'DELETE', body: { reason } })} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); setNote('Demo deleted.'); reload() }} />}
    </div>
  )
}
