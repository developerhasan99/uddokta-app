import { useEffect, useState } from 'react'
import { ExternalLink, ImageOff } from 'lucide-react'
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
  images: { id: string; name: string; url: string }[]
}

const kinds: { key: Kind; label: string; one: string; help: string }[] = [
  { key: 'landing', label: 'Landing pages', one: 'landing page', help: 'A whole landing page. Sellers pick one of their products and it replaces the demo’s product.' },
  { key: 'template', label: 'Templates', one: 'template', help: 'A store template (header, footer, home, product page, …). Offered when a seller makes a template of that type.' },
  { key: 'section', label: 'Sections', one: 'section', help: 'One section of a landing page or template, offered in the editor’s Add section. Store-only blocks are not allowed.' },
]
const storeKey = 'console.demoStore'
const remembered = () => { try { return localStorage.getItem(storeKey) ?? '' } catch { return '' } }
const remember = (handle: string) => { try { localStorage.setItem(storeKey, handle) } catch { /* private window */ } }

function DemoDialog({ demo, kind: startKind, categories, onClose, onDone }: { demo: Demo | null; kind: Kind; categories: string[]; onClose: () => void; onDone: (kind: Kind) => void }) {
  const [kind, setKind] = useState<Kind>(demo?.kind ?? startKind)
  const [storeHandle, setStoreHandle] = useState(demo?.sourceStore ?? remembered())
  const [sources, setSources] = useState<Sources | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [sourceId, setSourceId] = useState(demo?.sourceId ?? '')
  const [section, setSection] = useState(demo?.sourceSection ?? '')
  const [nameBn, setNameBn] = useState(demo?.nameBn ?? '')
  const [nameEn, setNameEn] = useState(demo?.nameEn ?? '')
  const [category, setCategory] = useState(demo?.category ?? '')
  const [previewUrl, setPreviewUrl] = useState(demo?.previewUrl ?? '')
  const [published, setPublished] = useState(demo ? demo.status === 'published' : false)
  const [sort, setSort] = useState(String(demo?.sort ?? 0))
  const [thumb, setThumb] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (handle = storeHandle) => {
    if (!handle.trim()) return
    setSourceError(null)
    try { setSources(await api<Sources>(`/console/demos/sources?store=${encodeURIComponent(handle.trim())}`)); remember(handle.trim()) }
    catch (err) { setSources(null); setSourceError(errorText(err)) }
  }
  useEffect(() => { if (storeHandle) void load() }, [])

  const choices = kind === 'template' ? (sources?.templates ?? []).map((t) => ({ id: t.id, label: `${templateLabels[t.type][1]} · ${t.title}${t.builtIn ? ' (built-in)' : ''}`, sections: t.sections }))
    : [...(sources?.pages ?? []).map((p) => ({ id: p.id, label: `Landing page · ${p.title}`, sections: p.sections })),
      ...(kind === 'section' ? (sources?.templates ?? []).map((t) => ({ id: t.id, label: `${templateLabels[t.type][1]} · ${t.title}`, sections: t.sections })) : [])]
  const chosen = choices.find((c) => c.id === sourceId)
  const ready = nameBn.trim() && nameEn.trim() && (demo || (sources && sourceId && (kind !== 'section' || section)))

  const save = async () => {
    setBusy(true); setError(null)
    const details = { nameBn, nameEn, category, previewUrl, status: published ? 'published' : 'draft', sort: Number(sort) || 0, sourceStoreId: sources?.store.id, thumbImageId: thumb }
    try {
      if (demo) await api(`/console/demos/${demo.id}`, { method: 'PUT', body: details })
      else await api('/console/demos', { method: 'POST', body: { ...details, kind, sourceId, sourceSection: kind === 'section' ? section : undefined } })
      onDone(kind)
    } catch (err) { setError(errorText(err)); setBusy(false) }
  }

  return (
    <Modal title={demo ? `Edit ${demo.nameEn}` : 'New demo'} sub={demo ? `Version ${demo.version} · used ${count(demo.uses)} times. Content changes come from “Update from source”.` : 'Pick what to copy from the demo store, then name it for sellers.'} onClose={onClose} foot={(close) => <>
      <Button onClick={() => close()}>Cancel</Button>
      <Button variant="primary" aria-busy={busy} disabled={!ready || busy} onClick={() => void save()}>{demo ? 'Save' : 'Create demo'}</Button>
    </>}>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!demo && <fieldset className="console-kinds">
        <legend className="field__label">What is it?</legend>
        <div className="segmented">{kinds.map((k) => <label key={k.key}><input type="radio" name="demo-kind" checked={kind === k.key} onChange={() => { setKind(k.key); setSourceId(''); setSection('') }} /><span>{k.label}</span></label>)}</div>
        <p className="field__help">{kinds.find((k) => k.key === kind)!.help}</p>
      </fieldset>}
      <div className="field">
        <label htmlFor="demo-store">Demo store address</label>
        <div className="console-inline">
          <input id="demo-store" className="input" placeholder="for example uddokta-demos" value={storeHandle} onChange={(e) => setStoreHandle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void load() } }} />
          <Button onClick={() => void load()}>Load</Button>
        </div>
        <p className="field__help">{sources ? `${sources.store.name}: ${sources.pages.length} landing pages, ${sources.templates.length} templates.` : 'The store where the team designs demos. Its saved drafts are copied; publishing there is not needed.'}</p>
        {sourceError && <p className="form-error" role="alert">{sourceError}</p>}
      </div>
      {!demo && sources && <div className="console-row">
        <div className="field"><label htmlFor="demo-source">{kind === 'section' ? 'From page or template' : kind === 'template' ? 'Template' : 'Landing page'}</label>
          <select id="demo-source" className="input" value={sourceId} onChange={(e) => { setSourceId(e.target.value); setSection(''); const c = choices.find((x) => x.id === e.target.value); if (c && !nameEn && kind !== 'section') setNameEn(c.label.split(' · ').pop()!.slice(0, 80)) }}>
            <option value="">Choose…</option>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        {kind === 'section' ? <div className="field"><label htmlFor="demo-section">Section</label>
          <select id="demo-section" className="input" value={section} disabled={!chosen} onChange={(e) => { setSection(e.target.value); const p = chosen?.sections.find((s) => s.id === e.target.value); if (p?.name && !nameEn) setNameEn(p.name.slice(0, 80)) }}>
            <option value="">Choose…</option>
            {chosen?.sections.map((s, i) => <option key={s.id} value={s.id}>{s.name || `Section ${i + 1}`}</option>)}
          </select>
        </div> : <div />}
      </div>}
      <div className="console-row">
        <div className="field"><label htmlFor="demo-bn">Name in Bangla</label><input id="demo-bn" className="input" maxLength={80} value={nameBn} onChange={(e) => setNameBn(e.target.value)} /></div>
        <div className="field"><label htmlFor="demo-en">Name in English</label><input id="demo-en" className="input" maxLength={80} value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></div>
      </div>
      <div className="console-row">
        <div className="field"><label htmlFor="demo-category">Category <span className="muted">(optional)</span></label>
          <input id="demo-category" className="input" list="demo-categories" maxLength={40} placeholder="Fashion, Cosmetics, Food…" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="demo-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="field"><label htmlFor="demo-preview">Live preview link <span className="muted">(optional)</span></label><input id="demo-preview" className="input" type="url" maxLength={500} placeholder="https://…" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} /></div>
      </div>
      {sources && <fieldset className="console-thumbs">
        <legend className="field__label">Thumbnail <span className="muted">(a screenshot from the demo store’s Media; with none, the demo’s first image is used)</span></legend>
        <ul>
          {demo?.thumb && <li><button type="button" aria-pressed={thumb === undefined} onClick={() => setThumb(undefined)}><img src={demo.thumb} alt="" /><span>Current</span></button></li>}
          <li><button type="button" aria-pressed={thumb === null || (!demo?.thumb && thumb === undefined)} onClick={() => setThumb(demo?.thumb ? null : undefined)}><span className="console-thumbs__none"><ImageOff size={18} aria-hidden="true" /></span><span>None</span></button></li>
          {sources.images.map((m) => <li key={m.id}><button type="button" aria-pressed={thumb === m.id} title={m.name} onClick={() => setThumb(m.id)}><img src={m.url} alt="" loading="lazy" /><span>{m.name}</span></button></li>)}
        </ul>
      </fieldset>}
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
          <table className="data-table">
            <thead><tr><th style={{ width: '5.5rem' }}><span className="visually-hidden">Thumbnail</span></th><th>Demo</th><th>Category</th>{kind === 'template' && <th>Type</th>}<th>Status</th><th className="end">Uses</th><th>Updated</th><th className="end"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="data-table__row" onClick={() => setEditing(d)}>
                  <td>{d.thumb ? <img className="console-demo-thumb" src={d.thumb} alt="" loading="lazy" /> : <span className="console-demo-thumb console-thumbs__none"><ImageOff size={16} aria-hidden="true" /></span>}</td>
                  <th scope="row"><button type="button" className="console-link" onClick={(e) => { e.stopPropagation(); setEditing(d) }}>{d.nameEn}</button><span className="console-sub">{d.nameBn}</span></th>
                  <td>{d.category || '—'}</td>
                  {kind === 'template' && <td>{d.templateType ? templateLabels[d.templateType][1] : '—'}</td>}
                  <td>{d.status === 'published' ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}</td>
                  <td className="num end">{count(d.uses)}</td>
                  <td>{date(d.updatedAt)}<span className="console-sub">v{d.version} · {d.sourceStore ?? 'source gone'}</span></td>
                  <td className="end" onClick={(e) => e.stopPropagation()}>
                    <div className="console-actions console-actions--end">
                      {d.previewUrl && <a className="btn" href={d.previewUrl} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${d.nameEn}`}><ExternalLink size={14} aria-hidden="true" /></a>}
                      <Button disabled={!d.sourceId || busy === d.id} aria-busy={busy === d.id} title="Copy the source’s saved draft again" onClick={() => void refresh(d)}>Update from source</Button>
                      <Button onClick={() => setDeleting(d)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted console-note">Demos copy the source’s saved draft, with its images, when created or updated; later edits in the demo store change nothing until you press Update from source. Pages sellers already made keep their own copy.</p>
      {editing && <DemoDialog demo={editing === 'new' ? null : editing} kind={kind} categories={categories} onClose={() => setEditing(null)} onDone={(made) => { if (editing === 'new') setKind(made); setNote(editing === 'new' ? 'Demo created.' : 'Demo saved.'); setEditing(null); reload() }} />}
      {deleting && <ReasonDialog title={`Delete “${deleting.nameEn}”?`} sub="Sellers will no longer see it. Pages and templates already made from it stay as they are." action="Delete demo" danger
        onConfirm={(reason) => api(`/console/demos/${deleting.id}`, { method: 'DELETE', body: { reason } })} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); setNote('Demo deleted.'); reload() }} />}
    </div>
  )
}
