import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { useLang } from '../i18n'

// Commits on Enter, a comma or leaving the box. `accepts` can refuse a new list, which keeps what was typed.
export function ChipsInput({ id, values, onChange, placeholder, list, max, maxLength, accepts = () => true }: { id: string; values: string[]; onChange: (values: string[]) => void; placeholder?: string; list?: string; max: number; maxLength: number; accepts?: (values: string[]) => boolean }) {
  const { t } = useLang()
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const added = raw.split(/[,،]/).map((v) => v.trim().slice(0, maxLength)).filter((v) => v && !values.includes(v))
    const next = [...values, ...new Set(added)].slice(0, max)
    if (!accepts(next)) return
    setDraft('')
    if (next.length !== values.length) onChange(next)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && !draft && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="chips">
      {values.map((value) => (
        <span key={value} className="chip">
          {value}
          <button type="button" aria-label={t('productRemoveValue', { value })} onClick={() => onChange(values.filter((v) => v !== value))}><X size={12} aria-hidden="true" /></button>
        </span>
      ))}
      <input id={id} list={list} autoComplete="off" placeholder={values.length === 0 ? placeholder : undefined} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => commit(draft)} />
    </div>
  )
}
