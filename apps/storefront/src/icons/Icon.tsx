import { createElement } from 'react'
import { isIconName, mediaIconId } from './catalog.ts'
import { iconNodes } from './nodes.ts'

// Shared by Admin previews and server-rendered public pages. No browser icon runtime or external assets.
// image: looks up a seller's own icon (media:<id>); without it, or when the image is gone, nothing is drawn.
export type IconImage = (id: string) => { url: string } | undefined
export function MarketingIcon({ name, size = 24, label, className = '', image }: { name: string; size?: number; label?: string; className?: string; image?: IconImage }) {
  const own = mediaIconId(name)
  if (own) {
    const img = image?.(own)
    return img ? <img src={img.url} width={size} height={size} alt={label ?? ''} className={`sf-marketing-icon sf-marketing-icon--image ${className}`.trim()} loading="lazy" decoding="async" /> : null
  }
  if (!isIconName(name)) return null
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`sf-marketing-icon ${className}`.trim()} data-icon={name} focusable="false" role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
    {iconNodes[name].map(([tag, attrs], i) => createElement(tag, { ...attrs, key: i }))}
  </svg>
}

export function IconBadge({ name, surface, label, image }: { name: string; surface?: string | number; label?: string; image?: IconImage }) {
  if (!isIconName(name) && !(mediaIconId(name) && image?.(mediaIconId(name)!))) return null
  return <span className="sf-icon-badge" data-icon-surface={surface || 'plain'}><MarketingIcon name={name} label={label} image={image} /></span>
}
