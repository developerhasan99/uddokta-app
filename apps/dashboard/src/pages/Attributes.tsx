import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, CircleCheck, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { DialogHead } from '../components/DialogHead'
import { useDialog } from '../components/dialog'
import { Badge, Button, Field, IconButton, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

export type AttributeKind = 'choice' | 'number' | 'flag'
export type Attribute = { id: string; name: string; kind: AttributeKind; unit: string; showOnProduct: boolean; filterable: boolean; products: number; choices: { id: string; label: string; products: number }[] }
type Pair = readonly [string, string]

export const kindLabels: Record<AttributeKind, Pair> = { choice: ['অপশন থেকে বাছাই', 'Choice'], number: ['সংখ্যা', 'Number'], flag: ['হ্যাঁ / না', 'Yes / no'] }

// Products › Attributes: facts about products defined once (origin, weight, certified…). The store's filters and the
// attributes table on product pages come from these. Staff add and edit; owners and admins delete.
export function Attributes() {
  const { lang, num } = useLang()
  const L = (pair: Pair) => pair[lang === 'bn' ? 0 : 1]
  const current = useCurrentStore()!
  const handle = current.store.handle
  const [list, setList] = useState<Attribute[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<Attribute | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setList(await api<Attribute[]>(`/stores/${handle}/attributes`))
    } catch {
      setFailed(true)
    }
  }, [handle])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const move = async (index: number, by: -1 | 1) => {
    if (!list) return
    const ids = list.map((a) => a.id)
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    setList(ids.map((id) => list.find((a) => a.id === id)!))
    setError(null)
    try {
      setList(await api<Attribute[]>(`/stores/${handle}/attributes-order`, { method: 'PUT', body: { ids } }))
    } catch (err) {
      setError(errorCode(err))
      void load()
    }
  }
  const summary = (a: Attribute) => [
    L(kindLabels[a.kind]),
    a.kind === 'choice' && (lang === 'bn' ? `${num(a.choices.length)}টি অপশন` : `${num(a.choices.length)} choices`),
    a.kind === 'number' && a.unit,
    lang === 'bn' ? `${num(a.products)}টি পণ্যে` : `${num(a.products)} products`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="page page--narrow">
      <PageHeader title={L(['অ্যাট্রিবিউট', 'Attributes'])} description={L(['উৎস, ওজন, মেয়াদের মতো তথ্য একবার ঠিক করে সব পণ্যে ব্যবহার করুন। দোকানের ফিল্টার আর পণ্যের পেজের তথ্যের টেবিল এগুলো থেকেই হয়।', 'Define facts like origin, weight or shelf life once and use them on every product. Your store’s filters and the product page details table come from these.'])}
        action={<Button variant="primary" disabled={!list} onClick={() => setEditing('new')}><Plus size={16} aria-hidden="true" />{L(['নতুন অ্যাট্রিবিউট', 'New attribute'])}</Button>} />
      {error && <p className="form-error" role="alert">{L(['সাজানো যায়নি।', 'Could not reorder.'])}</p>}
      <section className="card card--flush">
        {failed && <Notice role="alert" title={L(['অ্যাট্রিবিউট আনা যায়নি', 'Could not load attributes'])} action={<Button onClick={() => void load()}>{L(['আবার চেষ্টা করুন', 'Try again'])}</Button>} />}
        {!failed && !list && <div className="card__intro" role="status"><Skeleton /><Skeleton width="60%" /></div>}
        {list && list.length === 0 && <Notice title={L(['এখনো কোনো অ্যাট্রিবিউট নেই', 'No attributes yet'])}
          body={L(['যেমন: উৎস (সুন্দরবন, রাজশাহী), ওজন (গ্রাম), অর্গানিক সার্টিফায়েড (হ্যাঁ/না)। বানিয়ে পণ্যের পেজে মান দিন, দোকানে ক্রেতারা এগুলো দিয়ে ফিল্টার করতে পারবেন।', 'For example: Origin (Sundarbans, Rajshahi), Weight (grams), Certified organic (yes/no). Create one, give products their values, and buyers can filter by it.'])}
          action={<Button variant="primary" onClick={() => setEditing('new')}>{L(['নতুন অ্যাট্রিবিউট', 'New attribute'])}</Button>} />}
        {list && list.length > 0 && <ul className="rate-list">
          {list.map((a, i) => (
            <li key={a.id} className="rate-row">
              <button type="button" className="rate-row__main" onClick={() => setEditing(a)}>
                <span className="rate-row__name">{a.name}
                  {a.filterable && <Badge tone="success">{L(['ফিল্টার', 'Filter'])}</Badge>}
                  {!a.showOnProduct && <Badge>{L(['পেজে লুকানো', 'Hidden on page'])}</Badge>}
                </span>
                <span className="muted rate-row__sub">{summary(a)}</span>
                {a.kind === 'choice' && a.choices.length > 0 && <span className="rate-row__free">{a.choices.slice(0, 6).map((c) => c.label).join(', ')}{a.choices.length > 6 ? ' …' : ''}</span>}
              </button>
              <span className="rate-row__move">
                {list.length > 1 && <span className="row-order" role="group">
                  <IconButton label={`${L(['ওপরে', 'Move up'])}: ${a.name}`} disabled={i === 0} onClick={() => void move(i, -1)}><ArrowUp size={14} aria-hidden="true" /></IconButton>
                  <IconButton label={`${L(['নিচে', 'Move down'])}: ${a.name}`} disabled={i === list.length - 1} onClick={() => void move(i, 1)}><ArrowDown size={14} aria-hidden="true" /></IconButton>
                </span>}
                <IconButton label={`${L(['এডিট', 'Edit'])}: ${a.name}`} onClick={() => setEditing(a)}><Pencil size={14} aria-hidden="true" /></IconButton>
              </span>
            </li>
          ))}
        </ul>}
      </section>
      {editing && <AttributePanel handle={handle} attribute={editing === 'new' ? null : editing} canDelete={current.role !== 'staff'}
        onClose={() => setEditing(null)} onDone={(message) => { setEditing(null); setToast(message); void load() }} />}
      <div className="toast-anchor" role="status">{toast && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{toast}</p>}</div>
    </div>
  )
}

type Choice = { key: string; id?: string; label: string; products: number }

function AttributePanel({ handle, attribute, canDelete, onClose, onDone }: { handle: string; attribute: Attribute | null; canDelete: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const { t, lang, num } = useLang()
  const L = (pair: Pair) => pair[lang === 'bn' ? 0 : 1]
  const base = `/stores/${handle}/attributes`
  const { ref, close, props } = useDialog(onClose)
  const [name, setName] = useState(attribute?.name ?? '')
  const [kind, setKind] = useState<AttributeKind>(attribute?.kind ?? 'choice')
  const [unit, setUnit] = useState(attribute?.unit ?? '')
  const [showOnProduct, setShowOnProduct] = useState(attribute?.showOnProduct ?? true)
  const [filterable, setFilterable] = useState(attribute?.filterable ?? true)
  const [choices, setChoices] = useState<Choice[]>(() => (attribute?.choices ?? []).map((c) => ({ key: c.id, id: c.id, label: c.label, products: c.products })))
  const [adding, setAdding] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => { ref.current?.showModal() }, [])

  const labels = choices.map((c) => c.label.trim().toLowerCase())
  const twice = labels.some((l, i) => l && labels.indexOf(l) !== i)
  const removedInUse = (attribute?.choices ?? []).filter((c) => c.products > 0 && !choices.some((x) => x.id === c.id))
  const addChoice = () => {
    const label = adding.trim()
    if (!label) return
    setChoices([...choices, { key: crypto.randomUUID(), label, products: 0 }])
    setAdding('')
  }
  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); addChoice() } }
  const moveChoice = (i: number, by: -1 | 1) => {
    const next = [...choices]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    setChoices(next)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError(null)
    const pending = adding.trim()
    const all = pending ? [...choices, { key: 'pending', label: pending, products: 0 }] : choices
    if (!name.trim() || twice || (kind === 'choice' && all.some((c) => !c.label.trim()))) return
    setBusy(true)
    try {
      await api(attribute ? `${base}/${attribute.id}` : base, { method: attribute ? 'PUT' : 'POST', body: {
        name, kind, unit: kind === 'number' ? unit : '', showOnProduct, filterable,
        choices: kind === 'choice' ? all.map((c) => ({ ...(c.id ? { id: c.id } : {}), label: c.label })) : [],
      } })
      close(() => onDone(L(['সেভ হয়েছে।', 'Saved.'])))
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }
  const remove = async () => {
    setError(null)
    try {
      await api(`${base}/${attribute!.id}`, { method: 'DELETE' })
      close(() => onDone(L(['অ্যাট্রিবিউট মুছে ফেলা হয়েছে।', 'Attribute deleted.'])))
    } catch (err) {
      setConfirming(false)
      setError(errorCode(err))
    }
  }

  return (
    <dialog {...props} className="picker" aria-labelledby="attribute-title" onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
      <DialogHead id="attribute-title" title={attribute ? L(['অ্যাট্রিবিউট এডিট', 'Edit attribute']) : L(['নতুন অ্যাট্রিবিউট', 'New attribute'])} disabled={busy} onClose={() => close()} />
      <form className="warehouse-form" onSubmit={(e) => void save(e)} noValidate>
        <div className="dialog__body rate-form">
          {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
          <Field id="attribute-name" label={L(['নাম', 'Name'])} maxLength={60} autoComplete="off" placeholder={L(['যেমন: উৎস', 'For example: Origin'])} value={name}
            help={L(['দোকানে ফিল্টার আর পণ্যের পেজে এই নামই দেখাবে।', 'Shown to buyers in filters and on product pages.'])}
            error={tried && !name.trim() ? t('errNameRequired') : undefined} onChange={(e) => setName(e.target.value)} />
          <div className="field">
            <span className="field__label" id="attribute-kind">{L(['ধরন', 'Type'])}</span>
            {attribute
              ? <p className="muted">{L(kindLabels[kind])} · {L(['পরে বদলানো যায় না।', 'Cannot be changed later.'])}</p>
              : <div className="segmented" role="radiogroup" aria-labelledby="attribute-kind">
                {(['choice', 'number', 'flag'] as const).map((k) => <label key={k}><input type="radio" name="attribute-kind" checked={kind === k} onChange={() => setKind(k)} /><span>{L(kindLabels[k])}</span></label>)}
              </div>}
            {!attribute && <p className="field__help">{kind === 'choice' ? L(['নির্দিষ্ট কয়েকটির মধ্যে থেকে, যেমন উৎস বা রং। একটি পণ্যে একাধিকও দেওয়া যায়।', 'One or more of a fixed list, like origin or colour.'])
              : kind === 'number' ? L(['একটি সংখ্যা, যেমন ওজন বা মেয়াদ। দোকানে সীমা দিয়ে ফিল্টার করা যায়।', 'A number like weight or shelf life. Buyers filter by a range.'])
              : L(['আছে কি নেই, যেমন অর্গানিক সার্টিফায়েড।', 'Something a product is or is not, like certified organic.'])}</p>}
          </div>
          {kind === 'number' && <Field id="attribute-unit" label={L(['একক', 'Unit'])} maxLength={20} autoComplete="off" placeholder={L(['যেমন: গ্রাম, মাস, মিলি', 'For example: g, months, ml'])} value={unit} onChange={(e) => setUnit(e.target.value)} />}
          {kind === 'choice' && <div className="field">
            <span className="field__label">{L(['অপশন', 'Choices'])}</span>
            {choices.length > 0 && <ul className="choice-editor">
              {choices.map((c, i) => (
                <li key={c.key}>
                  <input className="input" aria-label={`${L(['অপশন', 'Choice'])} ${num(i + 1)}`} maxLength={60} value={c.label} aria-invalid={tried && (!c.label.trim() || labels.indexOf(c.label.trim().toLowerCase()) !== i) || undefined}
                    onChange={(e) => setChoices(choices.map((x) => (x.key === c.key ? { ...x, label: e.target.value } : x)))} />
                  {c.products > 0 && <span className="muted choice-editor__uses">{lang === 'bn' ? `${num(c.products)}টি পণ্যে` : `${num(c.products)} products`}</span>}
                  <IconButton label={`${L(['ওপরে', 'Move up'])}: ${c.label}`} disabled={i === 0} onClick={() => moveChoice(i, -1)}><ArrowUp size={14} aria-hidden="true" /></IconButton>
                  <IconButton label={`${L(['নিচে', 'Move down'])}: ${c.label}`} disabled={i === choices.length - 1} onClick={() => moveChoice(i, 1)}><ArrowDown size={14} aria-hidden="true" /></IconButton>
                  <IconButton label={`${L(['সরান', 'Remove'])}: ${c.label}`} onClick={() => setChoices(choices.filter((x) => x.key !== c.key))}><X size={14} aria-hidden="true" /></IconButton>
                </li>
              ))}
            </ul>}
            <div className="choice-editor__add">
              <input className="input" maxLength={60} placeholder={L(['নতুন অপশন লিখে Enter চাপুন', 'Type a choice and press Enter'])} aria-label={L(['নতুন অপশন', 'New choice'])} value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={onAddKey} />
              <Button onClick={addChoice} disabled={!adding.trim()}>{L(['যোগ করুন', 'Add'])}</Button>
            </div>
            {tried && twice && <p className="field__help field__help--error">{L(['একই অপশন দুবার আছে।', 'A choice is listed twice.'])}</p>}
            {removedInUse.length > 0 && <p className="field__help field__help--error">{lang === 'bn'
              ? `সেভ করলে ${removedInUse.map((c) => c.label).join(', ')} যে পণ্যগুলোতে আছে সেখান থেকেও সরে যাবে।`
              : `Saving removes ${removedInUse.map((c) => c.label).join(', ')} from the products that have it.`}</p>}
          </div>}
          <div className="switch-list">
            <label className="switch-row"><input type="checkbox" className="check" checked={showOnProduct} onChange={(e) => setShowOnProduct(e.target.checked)} />
              <span className="switch-row__text"><span className="switch-row__title">{L(['পণ্যের পেজে দেখান', 'Show on product pages'])}</span><span className="muted">{L(['পণ্যের পেজের তথ্যের টেবিলে।', 'In the details table on the product page.'])}</span></span></label>
            <label className="switch-row"><input type="checkbox" className="check" checked={filterable} onChange={(e) => setFilterable(e.target.checked)} />
              <span className="switch-row__text"><span className="switch-row__title">{L(['ফিল্টার হিসেবে ব্যবহার করুন', 'Use as a store filter'])}</span><span className="muted">{L(['কালেকশন, সব পণ্য আর খোঁজার পেজে।', 'On collection, all-products and search pages.'])}</span></span></label>
          </div>
          {attribute && canDelete && (confirming
            ? <div className="stack">
              <p className="muted">{attribute.products > 0
                ? (lang === 'bn' ? `${num(attribute.products)}টি পণ্য থেকে এই তথ্য মুছে যাবে। এটি ফেরানো যাবে না।` : `This removes it from ${num(attribute.products)} products. This cannot be undone.`)
                : L(['এটি ফেরানো যাবে না।', 'This cannot be undone.'])}</p>
              <div className="row"><Button onClick={() => setConfirming(false)}>{t('cancel')}</Button><Button variant="danger" onClick={() => void remove()}>{t('productConfirmDelete')}</Button></div>
            </div>
            : <button type="button" className="media-details__delete" onClick={() => setConfirming(true)}><Trash2 size={16} aria-hidden="true" />{L(['অ্যাট্রিবিউট মুছুন', 'Delete attribute'])}</button>)}
        </div>
        <div className="dialog__foot">
          <Button onClick={() => close()} disabled={busy}>{t('cancel')}</Button>
          <Button type="submit" variant="primary" aria-busy={busy} disabled={busy}>{t('productSave')}</Button>
        </div>
      </form>
    </dialog>
  )
}
