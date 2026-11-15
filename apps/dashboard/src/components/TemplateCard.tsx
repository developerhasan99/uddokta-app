import { useEffect, useState } from 'react'
import { useCurrentStore } from '../account-context'
import { api } from '../api'
import { useLang } from '../i18n'

type Templates = Record<'product' | 'collection' | 'page', string[]>
let cached: { store: string; at: number; data: Promise<Templates> } | null = null

// Which of the live theme's templates draws this product, collection or page. Shown only once the theme has another
// template of this kind (made in the theme editor with +); blank means the default one.
export function TemplateCard({ kind, value, onChange }: { kind: keyof Templates; value: string; onChange: (value: string) => void }) {
  const { lang } = useLang()
  const handle = useCurrentStore()!.store.handle
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    if (!cached || cached.store !== handle || Date.now() - cached.at > 30_000) cached = { store: handle, at: Date.now(), data: api<Templates>(`/stores/${handle}/theme-templates`) }
    void cached.data.then((all) => setNames(all[kind])).catch(() => setNames([]))
  }, [handle, kind])
  if (names.length === 0 && !value) return null
  return (
    <section className="card card--form">
      <div className="field">
        <label htmlFor={`template-${kind}`}>{lang === 'bn' ? 'থিমের টেমপ্লেট' : 'Theme template'}</label>
        <select className="input" id={`template-${kind}`} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{lang === 'bn' ? 'ডিফল্ট' : 'Default'}</option>
          {names.map((name) => <option key={name} value={name}>{name}</option>)}
          {value && !names.includes(value) && <option value={value}>{value} ({lang === 'bn' ? 'থিমে নেই, ডিফল্ট দেখাবে' : 'not in theme, default shows'})</option>}
        </select>
      </div>
    </section>
  )
}
