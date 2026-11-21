import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { FileUp } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, type MediaItem } from '../api'
import { Button } from '../components/ui'
import { DialogHead } from '../components/DialogHead'
import { useDialog } from '../components/dialog'
import { errorLabel, useLang, type Key } from '../i18n'
import { readProductFile, type ImportFile, type ImportNote, type ImportProduct, type SkipReason } from '../product-import'

const skipLabels: Record<SkipReason, Key> = { tooManyVariants: 'productImportTooManyVariants', unsupportedType: 'productImportUnsupported', noName: 'productImportNoName' }
const noteLabels: Record<ImportNote, Key> = { noPrice: 'productImportNoPrice', addedVariants: 'productImportAddedVariants', imagesCut: 'productImportImagesCut', descriptionDropped: 'productImportDescriptionDropped' }

type Imported = { id: string; name: string; notes: ImportNote[]; missingImages: number }
type Result = { imported: Imported[]; existing: number; failed: { name: string; error: string }[]; limit: boolean; storageFull: boolean; stopped: boolean }

// The product as the product API takes it. Image addresses become the media ids downloaded so far.
function productBody(p: ImportProduct, media: Map<string, string>, withCost: boolean, variantIds: string[] = []) {
  return {
    name: p.name, description: p.description, status: p.status, productType: p.productType, brand: p.brand, tags: p.tags,
    seoTitle: p.seoTitle, seoDescription: p.seoDescription, handle: p.handle, options: p.options,
    mediaIds: p.images.flatMap((i) => media.get(i.url) ?? []),
    variants: p.variants.map((v, i) => ({
      id: variantIds[i], options: v.options, price: v.price, comparePrice: v.comparePrice, sku: v.sku, stock: v.stock,
      mediaId: (v.image && media.get(v.image)) || null, ...(withCost ? { cost: v.cost } : {}),
    })),
  }
}

// A few downloads at once; the server converts each image, so more would only queue there.
async function eachLimit<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await run(items[next++])
  }))
}

// Runs in the browser one product at a time through the normal product API, so every product rule applies.
// A product already in the store (same address) is left alone, so running the same file again picks up the rest.
// ponytail: closing the tab stops the import; move it to a server job if sellers import thousands of products.
export function ProductImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { t, num } = useLang()
  const path = useStorePath()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}`
  const withCost = current.role !== 'staff'
  const { ref, close, props } = useDialog(onClose)
  const input = useRef<HTMLInputElement>(null)
  const stop = useRef(false)
  const [file, setFile] = useState<ImportFile | null>(null)
  const [unknown, setUnknown] = useState(false)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const choose = async (picked: File) => {
    const read = readProductFile(await picked.text())
    setUnknown(!read)
    setFile(read)
    if (input.current) input.current.value = ''
  }

  // A CSV dragged in from the desktop works anywhere on the dialog until the import starts.
  const accepts = (e: DragEvent) => !running && !result && e.dataTransfer.types.includes('Files')
  const drop = {
    onDragOver: (e: DragEvent) => { if (!accepts(e)) return; e.preventDefault(); setDragging(true) },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) },
    onDrop: (e: DragEvent) => {
      if (!accepts(e)) return
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files[0]
      if (f) void choose(f)
    },
  }

  const run = async (products: ImportProduct[]) => {
    stop.current = false
    setRunning(true)
    const r: Result = { imported: [], existing: 0, failed: [], limit: false, storageFull: false, stopped: false }
    for (const [i, p] of products.entries()) {
      if (stop.current) { r.stopped = true; break }
      setDone(i)
      let created: { id: string; variants: { id: string }[] }
      try {
        created = await api(`${base}/products`, { method: 'POST', body: productBody(p, new Map(), withCost) })
      } catch (err) {
        const code = errorCode(err)
        if (code === 'productHandleTaken') r.existing++
        else if (code === 'productLimit') { r.limit = true; break }
        else r.failed.push({ name: p.name, error: code })
        continue
      }
      // Images come after the product exists, so a skipped product never uses storage.
      const media = new Map<string, string>()
      await eachLimit(r.storageFull ? [] : p.images, 4, async (image) => {
        if (r.storageFull) return
        try {
          media.set(image.url, (await api<MediaItem>(`${base}/media/import`, { method: 'POST', body: image })).id)
        } catch (err) {
          if (errorCode(err) === 'storageFull') r.storageFull = true
        }
      })
      let attached = media.size
      if (media.size > 0) {
        try {
          await api(`${base}/products/${created.id}`, { method: 'PUT', body: productBody(p, media, withCost, created.variants.map((v) => v.id)) })
        } catch {
          // The images stay in the media gallery; the seller can add them to the product there.
          attached = 0
        }
      }
      r.imported.push({ id: created.id, name: p.name, notes: p.notes, missingImages: p.images.length - attached })
    }
    setResult(r)
    setRunning(false)
    if (r.imported.length > 0) onImported()
  }

  const variants = file?.products.reduce((n, p) => n + p.variants.length, 0) ?? 0
  const images = file?.products.reduce((n, p) => n + p.images.length, 0) ?? 0
  const attention = result?.imported.filter((p) => p.notes.length > 0 || p.missingImages > 0) ?? []
  const percent = file && file.products.length ? (done / file.products.length) * 100 : 0

  return (
    <dialog {...props} {...drop} className="modal product-import" aria-labelledby="product-import-title" onCancel={(e) => { e.preventDefault(); if (!running) close() }}>
      <DialogHead id="product-import-title" title={t('productImportTitle')} onClose={() => close()} disabled={running} />
      <input ref={input} type="file" accept=".csv,text/csv" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f) }} />

      {!file && (
        <>
          <div className="dialog__body">
            <p>{t('productImportIntro')}</p>
            <ul className="product-import__how muted">
              <li>{t('productImportShopifyHow')}</li>
              <li>{t('productImportWooHow')}</li>
            </ul>
            <button type="button" className="media__empty" onClick={() => input.current?.click()}>
              <FileUp size={32} strokeWidth={1.5} aria-hidden="true" />
              <strong>{t('productImportChoose')}</strong>
              <span className="muted">{t('productImportDrag')}</span>
            </button>
            {unknown && <p className="form-error" role="alert">{t('productImportUnknown')}</p>}
          </div>
          <div className="dialog__foot">
            <Button onClick={() => close()}>{t('cancel')}</Button>
          </div>
        </>
      )}

      {file && !running && !result && (
        <>
          <div className="dialog__body">
            <p>{t('productImportFound', { source: file.source === 'shopify' ? 'Shopify' : 'WooCommerce', products: num(file.products.length), variants: num(variants), images: num(images) })}</p>
            {file.skipped.length > 0 && (
              <div className="stack">
                <h3 className="product-import__head">{t('productImportSkipped', { n: num(file.skipped.length) })}</h3>
                <ul className="product-import__list">
                  {file.skipped.map((s, i) => <li key={i}><span>{s.name}</span><span className="muted">{t(skipLabels[s.reason])}</span></li>)}
                </ul>
              </div>
            )}
            <p className="muted">{t('productImportNote')}</p>
          </div>
          <div className="dialog__foot">
            <Button onClick={() => input.current?.click()}>{t('productImportOther')}</Button>
            <Button variant="primary" disabled={file.products.length === 0} onClick={() => void run(file.products)}>{t('productImportStart', { n: num(file.products.length) })}</Button>
          </div>
        </>
      )}

      {file && running && (
        <>
          <div className="dialog__body" role="status">
            <p>{t('productImportProgress', { done: num(done), total: num(file.products.length) })}</p>
            <p className="muted product-import__current">{file.products[done]?.name}</p>
            <span className="bars__track" role="progressbar" aria-label={t('productImportTitle')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
              <span className="bars__fill" style={{ width: `${percent}%` }} />
            </span>
            <p className="muted">{t('productImportKeepOpen')}</p>
          </div>
          <div className="dialog__foot">
            <Button onClick={() => { stop.current = true }}>{t('productImportStop')}</Button>
          </div>
        </>
      )}

      {result && (
        <>
          <div className="dialog__body" role="status">
            <p><strong>{t('productImportDone', { n: num(result.imported.length) })}</strong></p>
            {result.existing > 0 && <p className="muted">{t('productImportExisting', { n: num(result.existing) })}</p>}
            {result.limit && <p className="form-error" role="alert">{t('errProductLimit')}</p>}
            {result.storageFull && <p className="form-error" role="alert">{t('productImportStorage')}</p>}
            {result.stopped && <p className="muted">{t('productImportStopped')}</p>}
            {(attention.length > 0 || result.failed.length > 0) && (
              <div className="stack">
                <h3 className="product-import__head">{t('productImportCheck')}</h3>
                <ul className="product-import__list">
                  {result.failed.map((f, i) => <li key={`f${i}`}><span>{f.name}</span><span className="form-error">{t('productImportFailed', { reason: t(errorLabel(f.error)) })}</span></li>)}
                  {attention.map((p) => (
                    <li key={p.id}>
                      <Link to={path(`/products/${p.id}`)} onClick={() => close()}>{p.name}</Link>
                      <span className="muted">{[...p.notes.map((n) => t(noteLabels[n])), ...(p.missingImages > 0 ? [t('productImportMissingImages', { n: num(p.missingImages) })] : [])].join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="dialog__foot">
            <Button variant="primary" onClick={() => close()}>{t('mediaClose')}</Button>
          </div>
        </>
      )}
      {dragging && <div className="media__drop" aria-hidden="true"><FileUp size={24} />{t('productImportDrop')}</div>}
    </dialog>
  )
}
