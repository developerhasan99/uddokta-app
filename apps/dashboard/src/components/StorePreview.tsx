import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { catalogCss } from 'storefront/catalog'
import { css as storefrontCss, PageView, type Ctx } from 'storefront/sections'
import { siteCss, siteFontsHref, type SiteStyle } from 'storefront/site'
import { api } from '../api'
import type { PreviewData } from '../pages/PageEditor'

const width = 1280
const shell = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}"><style>${storefrontCss}${catalogCss}html,body{overflow:hidden}a,button,input,select,summary{pointer-events:none}</style></head><body></body></html>`

// The store's real home page (its default home template, else the built-in one, inside the default header and footer),
// drawn with the shared section components and the given look, so unsaved Site settings show before saving.
// Scaled down from a desktop width; nothing in it can be clicked or focused.
export function StorePreview({ handle, style }: { handle: string; style: SiteStyle }) {
  const host = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)
  const [body, setBody] = useState<HTMLElement | null>(null)
  const [data, setData] = useState<PreviewData | null>(null)
  useEffect(() => {
    let live = true
    api<PreviewData>(`/stores/${handle}/store-preview`).then((d) => { if (live) setData(d) }).catch(() => {})
    return () => { live = false }
  }, [handle])
  useEffect(() => {
    if (!host.current) return
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / width))
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])

  const frame = (type: 'header' | 'footer') => {
    const list = (type === 'header' ? data?.headers : data?.footers) ?? []
    const chosen = type === 'header' ? data?.home.canvas?.headerId : data?.home.canvas?.footerId
    return (list.find((f) => f.id === chosen) ?? list.find((f) => f.isDefault) ?? list.find((f) => f.builtIn))?.sections ?? data?.builtIn[type] ?? []
  }
  const ctx: Ctx | null = data && {
    preview: true, shipping: [],
    image: (id) => (id ? data.images[id] : undefined),
    product: () => undefined,
    store: data.store, menus: data.menus, collections: data.collections,
    grid: () => ({ cards: data.cards.slice(0, 8), page: 1, hasMore: false, base: '' }),
    current: { path: '' },
  }
  const fontsHref = siteFontsHref(style)
  return (
    <div ref={host} className="store-preview" aria-hidden="true">
      <iframe title="" srcDoc={shell} style={{ width, height: `${100 / scale}%`, transform: `scale(${scale})` }} onLoad={(e) => setBody(e.currentTarget.contentDocument?.body ?? null)} tabIndex={-1} inert sandbox="allow-same-origin" />
      {body && data && ctx && createPortal(<>
        {fontsHref && <link rel="stylesheet" href={fontsHref} />}
        <style>{siteCss(style)}</style>
        <PageView content={data.home} ctx={ctx} storeName={data.store.name} frame={{ header: frame('header'), footer: frame('footer') }} themeCss={style.css} />
      </>, body)}
    </div>
  )
}
