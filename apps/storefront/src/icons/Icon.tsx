import { createElement } from 'react'
import { isIconName } from './catalog.ts'
import { iconNodes } from './nodes.ts'

// Shared by Admin previews and server-rendered public pages. No browser icon runtime or external assets.
export function MarketingIcon({ name, size = 24, label, className = '' }: { name: string; size?: number; label?: string; className?: string }) {
  if (!isIconName(name)) return null
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`sf-marketing-icon ${className}`.trim()} data-icon={name} focusable="false" role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
    {iconNodes[name].map(([tag, attrs], i) => createElement(tag, { ...attrs, key: i }))}
  </svg>
}

export function IconBadge({ name, surface, label }: { name: string; surface?: string | number; label?: string }) {
  if (!isIconName(name)) return null
  return <span className="sf-icon-badge" data-icon-surface={surface || 'plain'}><MarketingIcon name={name} label={label} /></span>
}
