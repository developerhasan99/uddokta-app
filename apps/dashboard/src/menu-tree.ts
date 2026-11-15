// Pure edits on a menu tree (storefront/src/menus.ts). Each returns a new tree, or the same one when the move is not allowed.
import { maxMenuDepth, type MenuItem } from 'storefront/menus'

export type Drop = 'before' | 'inside' | 'after'

export const newItemId = () => Math.random().toString(36).slice(2, 10)

// Levels below and including this item: 1 for an item with no children.
export const height = (item: MenuItem): number => 1 + Math.max(0, ...item.children.map(height))

// The item's level (1 = top) and its parent's id, or null when it is not in the tree.
export function locate(items: MenuItem[], id: string, depth = 1, parent: string | null = null): { depth: number; parent: string | null; index: number; siblings: MenuItem[] } | null {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) return { depth, parent, index: i, siblings: items }
    const found = locate(items[i].children, id, depth + 1, items[i].id)
    if (found) return found
  }
  return null
}

export const find = (items: MenuItem[], id: string): MenuItem | null => {
  const at = locate(items, id)
  return at ? at.siblings[at.index] : null
}

export const update = (items: MenuItem[], id: string, change: (item: MenuItem) => MenuItem): MenuItem[] =>
  items.map((item) => (item.id === id ? change(item) : { ...item, children: update(item.children, id, change) }))

export const remove = (items: MenuItem[], id: string): MenuItem[] =>
  items.filter((item) => item.id !== id).map((item) => ({ ...item, children: remove(item.children, id) }))

// Adds an item at the end of a parent's children (null = top level).
export const append = (items: MenuItem[], parent: string | null, item: MenuItem): MenuItem[] =>
  parent === null ? [...items, item] : update(items, parent, (p) => ({ ...p, children: [...p.children, item] }))

function insertAt(items: MenuItem[], target: string, where: Drop, item: MenuItem): MenuItem[] {
  if (where === 'inside') return update(items, target, (p) => ({ ...p, children: [...p.children, item] }))
  const out: MenuItem[] = []
  for (const each of items) {
    if (each.id === target && where === 'before') out.push(item)
    out.push(each.id === target ? each : { ...each, children: insertAt(each.children, target, where, item) })
    if (each.id === target && where === 'after') out.push(item)
  }
  return out
}

// Moves an item next to or into another. Refused (same tree back) when it would go into itself or deeper than 3 levels.
export function move(items: MenuItem[], id: string, target: string, where: Drop): MenuItem[] {
  if (id === target) return items
  const item = find(items, id)
  const at = locate(items, target)
  if (!item || !at || find(item.children, target)) return items
  const depth = where === 'inside' ? at.depth + 1 : at.depth
  if (depth + height(item) - 1 > maxMenuDepth) return items
  return insertAt(remove(items, id), target, where, item)
}

// Keyboard moves: up and down among siblings, right into the item above, left out to after the parent.
export function nudge(items: MenuItem[], id: string, key: 'up' | 'down' | 'in' | 'out'): MenuItem[] {
  const at = locate(items, id)
  if (!at) return items
  const { siblings, index, parent } = at
  if (key === 'up') return index > 0 ? move(items, id, siblings[index - 1].id, 'before') : items
  if (key === 'down') return index < siblings.length - 1 ? move(items, id, siblings[index + 1].id, 'after') : items
  if (key === 'in') return index > 0 ? move(items, id, siblings[index - 1].id, 'inside') : items
  return parent ? move(items, id, parent, 'after') : items
}
