import { useEffect, useRef, useState } from 'react'

// The live store, drawn at a desktop width and scaled down to fit (the Online store page's preview). It asks with
// ?preview=dashboard, so the store leaves out its pixels and custom code (no ad or analytics visits from the dashboard);
// only the dashboard may frame a store. Nothing in it can be clicked or focused; its scripts cannot reach the dashboard
// (another origin) or navigate it (sandbox without top navigation).
const width = 1280
export function StoreFrame({ url, label }: { url: string; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!host.current) return
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / width))
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={host} className="store-preview" data-loaded={loaded || undefined}>
      <iframe title={label} src={`${url}/?preview=dashboard`} loading="lazy" tabIndex={-1} inert sandbox="allow-scripts allow-same-origin"
        style={{ width, height: `${100 / scale}%`, transform: `scale(${scale})` }} onLoad={() => setLoaded(true)} />
    </div>
  )
}
