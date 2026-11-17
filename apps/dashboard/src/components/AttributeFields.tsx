import { Link } from 'react-router'
import { X } from 'lucide-react'
import { useStorePath } from '../account-context'
import { useLang } from '../i18n'
import type { Attribute } from '../pages/Attributes'
import { IconButton } from './ui'

// A product's attribute values as the form keeps them: numbers stay as typed until saved.
export type AttributeDraft = { attributeId: string; choiceIds?: string[]; number?: string; flag?: boolean }
type Pair = readonly [string, string]

// Bangla or Latin digits, decimals allowed. Null when it is not a number.
export function parseAttributeNumber(text: string) {
  const latin = text.trim().replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/,/g, '')
  return /^\d{1,9}(\.\d{1,3})?$/.test(latin) ? Number(latin) : null
}
// What the API takes: values with nothing in them are left out.
type AttributeValue = { attributeId: string; choiceIds?: string[]; number?: number; flag?: boolean }
export const attributesBody = (drafts: AttributeDraft[]) => drafts.flatMap((d): AttributeValue[] => {
  if (d.choiceIds) return d.choiceIds.length ? [{ attributeId: d.attributeId, choiceIds: d.choiceIds }] : []
  if (d.number !== undefined) { const n = parseAttributeNumber(d.number); return n === null ? [] : [{ attributeId: d.attributeId, number: n }] }
  return d.flag === undefined ? [] : [{ attributeId: d.attributeId, flag: d.flag }]
})
export const badAttributeNumbers = (drafts: AttributeDraft[]) => drafts.filter((d) => d.number !== undefined && d.number.trim() !== '' && parseAttributeNumber(d.number) === null).map((d) => d.attributeId)

// The product form's Attributes card: one row per attribute the product has, and a picker for the rest.
export function AttributeFields({ defs, values, tried, onChange }: { defs: Attribute[] | null; values: AttributeDraft[]; tried: boolean; onChange: (next: AttributeDraft[]) => void }) {
  const { lang, num } = useLang()
  const L = (pair: Pair) => pair[lang === 'bn' ? 0 : 1]
  const path = useStorePath()
  const bad = badAttributeNumbers(values)
  const set = (attributeId: string, change: Partial<AttributeDraft>) => onChange(values.map((v) => (v.attributeId === attributeId ? { ...v, ...change } : v)))
  const unused = defs?.filter((d) => !values.some((v) => v.attributeId === d.id)) ?? []
  const add = (id: string) => {
    const def = defs?.find((d) => d.id === id)
    if (!def) return
    onChange([...values, def.kind === 'choice' ? { attributeId: id, choiceIds: [] } : def.kind === 'number' ? { attributeId: id, number: '' } : { attributeId: id, flag: true }])
  }
  return (
    <section className="card card--form" aria-labelledby="product-attributes-title">
      <div className="card__head">
        <h2 id="product-attributes-title">{L(['অ্যাট্রিবিউট', 'Attributes'])}</h2>
        <Link to={path('/products/attributes')}>{L(['অ্যাট্রিবিউট সাজান', 'Manage attributes'])}</Link>
      </div>
      <p className="muted">{L(['উৎস, ওজন, মেয়াদের মতো তথ্য। পণ্যের পেজের টেবিলে দেখাবে, আর ক্রেতারা এগুলো দিয়ে ফিল্টার করবেন।', 'Facts like origin, weight or shelf life. They show in the product page table and buyers filter by them.'])}</p>
      {defs?.length === 0 && <p className="field__help"><Link to={path('/products/attributes')}>{L(['প্রথম অ্যাট্রিবিউট বানান', 'Create your first attribute'])}</Link>{L([', তারপর এখানে মান দিন।', ', then give this product its values here.'])}</p>}
      {values.map((v) => {
        const def = defs?.find((d) => d.id === v.attributeId)
        if (!def) return null
        const remove = <IconButton label={`${L(['সরান', 'Remove'])}: ${def.name}`} onClick={() => onChange(values.filter((x) => x.attributeId !== v.attributeId))}><X size={14} aria-hidden="true" /></IconButton>
        return (
          <div key={def.id} className="attribute-row" role="group" aria-labelledby={`attr-${def.id}`}>
            <span className="attribute-row__name" id={`attr-${def.id}`}>{def.name}</span>
            <div className="attribute-row__value">
              {def.kind === 'choice' && (def.choices.length
                ? <div className="attribute-choices">{def.choices.map((c) => {
                  const on = v.choiceIds?.includes(c.id) ?? false
                  return <button key={c.id} type="button" className="attribute-choice" aria-pressed={on} onClick={() => set(def.id, { choiceIds: on ? v.choiceIds!.filter((x) => x !== c.id) : [...(v.choiceIds ?? []), c.id] })}>{c.label}</button>
                })}</div>
                : <Link to={path('/products/attributes')}>{L(['এই অ্যাট্রিবিউটে অপশন যোগ করুন', 'Add choices to this attribute'])}</Link>)}
              {def.kind === 'number' && <span className="input-affix">
                <input className="input" inputMode="decimal" maxLength={14} aria-labelledby={`attr-${def.id}`} aria-invalid={tried && bad.includes(def.id) || undefined} value={v.number ?? ''} onChange={(e) => set(def.id, { number: e.target.value })} />
                {def.unit && <span className="input-affix__unit">{def.unit}</span>}
              </span>}
              {def.kind === 'flag' && <div className="segmented" role="radiogroup" aria-labelledby={`attr-${def.id}`}>
                {([[true, ['হ্যাঁ', 'Yes']], [false, ['না', 'No']]] as const).map(([flag, label]) => <label key={String(flag)}><input type="radio" name={`attr-${def.id}`} checked={v.flag === flag} onChange={() => set(def.id, { flag })} /><span>{L(label)}</span></label>)}
              </div>}
              {tried && bad.includes(def.id) && <span className="field__help field__help--error">{L(['একটি সংখ্যা লিখুন, যেমন ৫০০ বা ১.৫।', 'Enter a number, like 500 or 1.5.'])}</span>}
            </div>
            {remove}
          </div>
        )
      })}
      {unused.length > 0 && <div className="field">
        <label htmlFor="product-attribute-add" className="visually-hidden">{L(['অ্যাট্রিবিউট যোগ করুন', 'Add an attribute'])}</label>
        <select id="product-attribute-add" className="input" value="" onChange={(e) => add(e.target.value)}>
          <option value="">{L(['+ অ্যাট্রিবিউট যোগ করুন', '+ Add an attribute'])}{lang === 'bn' ? ` (${num(unused.length)}টি)` : ` (${num(unused.length)})`}</option>
          {unused.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>}
    </section>
  )
}
