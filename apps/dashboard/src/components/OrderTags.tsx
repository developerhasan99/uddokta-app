import { useEffect, useState } from 'react'
import { api } from '../api'
import { useLang } from '../i18n'
import { ChipsInput } from './ChipsInput'

export const maxOrderTags = 10

// Tag input for an order, suggesting the tags this store already uses.
export function OrderTagsField({ id, handle, values, onChange }: { id: string; handle: string; values: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useLang()
  const [suggestions, setSuggestions] = useState<string[]>([])
  useEffect(() => { api<string[]>(`/stores/${handle}/order-tags`).then(setSuggestions).catch(() => {}) }, [handle])
  return <>
    <ChipsInput id={id} list={`${id}-list`} maxLength={50} max={maxOrderTags} placeholder={t('orderTagsHint')} values={values} onChange={onChange} />
    <datalist id={`${id}-list`}>{suggestions.filter((tag) => !values.includes(tag)).map((tag) => <option key={tag} value={tag} />)}</datalist>
  </>
}
