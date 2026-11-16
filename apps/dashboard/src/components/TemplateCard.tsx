import { useEffect, useState } from 'react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api } from '../api'
import { useLang } from '../i18n'

type Option = { id: string; title: string; isDefault: boolean; isPublished: boolean }

// Which template draws this product, collection or store page: the store's default for its type, or one picked here.
// Only published templates are used on the live store; a draft one shows a note.
export function TemplateCard({ kind, value, onChange }: { kind: 'product' | 'collection' | 'page'; value: string | null; onChange: (value: string | null) => void }) {
  const { lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const path = useStorePath()
  const handle = useCurrentStore()!.store.handle
  const [options, setOptions] = useState<Option[] | null>(null)
  useEffect(() => {
    api<Option[]>(`/stores/${handle}/templates?type=${kind}`).then(setOptions).catch(() => setOptions([]))
  }, [handle, kind])
  if (!options || (options.length === 0 && !value)) return null
  const picked = options.find((o) => o.id === value)
  return (
    <section className="card card--form">
      <div className="field">
        <label htmlFor={`template-${kind}`}>{L(['টেমপ্লেট', 'Template'])}</label>
        <select className="input" id={`template-${kind}`} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{L(['দোকানের ডিফল্ট', 'Store default'])}</option>
          {options.filter((o) => !o.isDefault).map((o) => <option key={o.id} value={o.id}>{o.title}{o.isPublished ? '' : L([' (খসড়া)', ' (draft)'])}</option>)}
        </select>
        {picked && !picked.isPublished && <p className="field__help">{L(['এটি এখনো প্রকাশিত নয়, তাই প্রকাশ না করা পর্যন্ত ডিফল্ট দেখাবে।', 'This template is not published yet, so the default shows until it is.'])}</p>}
        {picked && <a className="field__help" href={path(`/online-store/templates/${picked.id}`)}>{L(['টেমপ্লেটটি সাজান', 'Edit this template'])}</a>}
      </div>
    </section>
  )
}
