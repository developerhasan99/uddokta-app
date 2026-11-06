import { useState } from 'react'
import { Minus, Plus, Search, X } from 'lucide-react'
import { api } from '../api'
import { useLang } from '../i18n'
import { ProductPicker, type ProductRow } from './ProductPicker'

export type Variant = { id: string; options: string[]; price: number; stock: number | null }
export type Product = { id: string; name: string; variants: Variant[] }
export type Line = { product: Product; thumbUrl: string | null; variantId: string; quantity: number }
export const maxLines = 20

export const variantOf = (line: Line) => line.product.variants.find((v) => v.id === line.variantId)!
// A product already in an order keeps the price it was sold at; the database does the same when it saves.
export const linePrice = (line: Line, sold?: Map<string, number>) => sold?.get(line.variantId) ?? variantOf(line).price
export const linesSubtotal = (lines: Line[], sold?: Map<string, number>) => lines.reduce((sum, line) => sum + linePrice(line, sold) * line.quantity, 0)

// Product lines with a picker, variant choice, stock hint and quantity stepper. Shared by the new-order form and order editing.
export function OrderLines({ handle, lines, onChange, invalid, sold }: { handle: string; lines: Line[]; onChange: (update: (lines: Line[]) => Line[]) => void; invalid?: boolean; sold?: Map<string, number> }) {
  const { t, money, num } = useLang()
  const [picking, setPicking] = useState(false)
  const setLine = (index: number, changes: Partial<Line>) => onChange((all) => all.map((line, i) => i === index ? { ...line, ...changes } : line))
  const add = async (rows: ProductRow[]) => {
    const fresh = rows.filter((row) => !lines.some((line) => line.product.id === row.id)).slice(0, maxLines - lines.length)
    const products = await Promise.all(fresh.map((row) => api<Product>(`/stores/${handle}/products/${row.id}`).then((product) => ({ product, row })).catch(() => null)))
    onChange((all) => [...all, ...products.flatMap((p) => p ? [{
      product: p.product, thumbUrl: p.row.thumbUrl, quantity: 1,
      variantId: (p.product.variants.find((v) => v.stock === null || v.stock > 0) ?? p.product.variants[0]).id,
    }] : [])])
  }
  return <>
    <button type="button" className="new-order__add" disabled={lines.length >= maxLines} onClick={() => setPicking(true)} aria-invalid={invalid ? true : undefined}>
      <Search size={16} aria-hidden="true" /><span>{t('newOrderAddProducts')}</span><Plus size={16} aria-hidden="true" />
    </button>
    {invalid && <p className="field__help field__help--error">{t('newOrderNoLines')}</p>}
    {lines.length > 0 && <ul className="order-lines">
      {lines.map((line, index) => {
        const variant = variantOf(line)
        const short = variant.stock !== null && variant.stock < line.quantity
        return <li key={line.product.id} className="order-line">
          <span className="data-table__thumb order-line__thumb">{line.thumbUrl && <img src={line.thumbUrl} alt="" />}</span>
          <div className="order-line__main">
            <span className="order-line__name">{line.product.name}</span>
            {line.product.variants.length > 1 && (
              <select className="input input--compact order-line__variant" aria-label={t('newOrderOption')} value={line.variantId} onChange={(e) => setLine(index, { variantId: e.target.value })}>
                {line.product.variants.map((v) => <option key={v.id} value={v.id}>{v.options.join(' / ')}{v.stock === 0 ? ` (${t('newOrderOutOfStock')})` : ''}</option>)}
              </select>
            )}
            <span className={short ? 'order-line__meta order-line__meta--alert' : 'order-line__meta'}>
              {t('newOrderEach', { price: money(linePrice(line, sold)) })}
              {variant.stock !== null && ` · ${variant.stock === 0 ? t('newOrderOutOfStock') : t('newOrderInStock', { n: num(variant.stock) })}`}
            </span>
          </div>
          <div className="stepper" role="group" aria-label={t('newOrderQuantity')}>
            <button type="button" aria-label={t('newOrderLess')} disabled={line.quantity <= 1} onClick={() => setLine(index, { quantity: line.quantity - 1 })}><Minus size={14} aria-hidden="true" /></button>
            <input inputMode="numeric" aria-label={t('newOrderQuantity')} value={line.quantity} onChange={(e) => setLine(index, { quantity: Math.min(Math.max(Number(e.target.value.replace(/\D/g, '')) || 1, 1), 100) })} />
            <button type="button" aria-label={t('newOrderMore')} disabled={line.quantity >= 100} onClick={() => setLine(index, { quantity: line.quantity + 1 })}><Plus size={14} aria-hidden="true" /></button>
          </div>
          <strong className="order-line__total num">{money(linePrice(line, sold) * line.quantity)}</strong>
          <button type="button" className="btn btn--icon order-line__remove" aria-label={t('newOrderRemoveLine', { name: line.product.name })} onClick={() => onChange((all) => all.filter((_, i) => i !== index))}><X size={16} aria-hidden="true" /></button>
        </li>
      })}
    </ul>}
    {picking && <ProductPicker sellableOnly selected={[]} max={maxLines - lines.length} onClose={() => setPicking(false)} onDone={(rows) => { setPicking(false); void add(rows) }} />}
  </>
}
