import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { defOf, newSection, type SectionType } from 'storefront/schema'
import { css, SectionFrame, SectionView, type Ctx } from 'storefront/sections'
import previewPhoto from '../assets/section-preview.jpg'

const photoId = '00000000-0000-4000-8000-000000000001'
const productId = '00000000-0000-4000-8000-000000000002'
const image = { url: previewPhoto, alt: 'মসলার বাস্তব নমুনা ছবি', width: 1000, height: 667 }
const ctx: Ctx = {
  preview: true, shipping: [{ id: '00000000-0000-4000-8000-000000000003', name: 'ঢাকার ভেতরে', note: '', price: 60, freeOver: null, freeMinQty: null, freeProducts: [] }, { id: '00000000-0000-4000-8000-000000000004', name: 'ঢাকার বাইরে', note: '', price: 120, freeOver: null, freeMinQty: null, freeProducts: [] }], image: () => image,
  product: () => ({ id: productId, name: 'নমুনা পণ্য', image, variants: [{ id: productId, label: 'ছোট প্যাক', price: 450, comparePrice: null, available: true }, { id: photoId, label: 'বড় প্যাক', price: 850, comparePrice: null, available: true }] }),
}

// The actual shared renderer, with inert sample content. These IDs never enter a seller's document.
export function SectionThumbnail({ type }: { type: SectionType }) {
  const host = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)
  useEffect(() => {
    if (!host.current) return
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1000))
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  const [body, setBody] = useState<HTMLElement | null>(null)
  const section = useMemo(() => {
    const section = newSection(type, 'thumbnail')
    for (const field of defOf(type).fields) {
      if (field.kind === 'image') section.settings[field.key] = photoId
      if (field.kind === 'product') section.settings[field.key] = productId
    }
    if (type === 'countdown') section.settings.ends = '2030-12-31T18:00:00Z'
    return section
  }, [type])
  const shell = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><style>${css}body{--sf-accent:#285a3f;--sf-accent-ink:#fff;--sf-ink:#253127;--sf-paper:#fff;--sf-tint:#f3f5ef;--sf-rule:#dde3d8;--sf-radius:12px;--sf-muted:#64705e;--sf-error:#b62222;overflow:hidden}a,button,input,summary{pointer-events:none}</style></head><body></body></html>`
  return <div ref={host} className="editor-section-thumb" aria-hidden="true">
    <iframe title="" style={{ transform: `scale(${scale})` }} srcDoc={shell} onLoad={(e) => setBody(e.currentTarget.contentDocument?.body ?? null)} tabIndex={-1} inert sandbox="allow-same-origin" loading="lazy" />
    {body && createPortal(<SectionFrame s={section}><SectionView s={section} ctx={ctx} orderId="sample-order" /></SectionFrame>, body)}
  </div>
}
