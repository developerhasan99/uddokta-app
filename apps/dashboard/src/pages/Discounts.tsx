import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { Badge, Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

type Discount = { id: string; code: string; kind: 'percent' | 'amount'; value: number; minSubtotal: number; maxUses: number | null; uses: number; endsAt: string | null; active: boolean }
const digits = (text: string) => text.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\D/g, '')

export function Discounts() {
  const { t, num, money, time } = useLang()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/discounts`
  const [rows, setRows] = useState<Discount[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [form, setForm] = useState({ code: '', kind: 'percent', value: '', minSubtotal: '', maxUses: '', endsAt: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setRows(await api<Discount[]>(base))
    } catch {
      setFailed(true)
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api(base, {
        method: 'POST',
        body: {
          code: form.code, kind: form.kind, value: Number(digits(form.value)), minSubtotal: Number(digits(form.minSubtotal) || 0),
          maxUses: form.maxUses ? Number(digits(form.maxUses)) : null, endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        },
      })
      setForm({ code: '', kind: form.kind, value: '', minSubtotal: '', maxUses: '', endsAt: '' })
      await load()
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (d: Discount) => {
    const row = await api<Discount>(`${base}/${d.id}`, { method: 'PATCH', body: { active: !d.active } })
    setRows((all) => all && all.map((x) => (x.id === d.id ? row : x)))
  }
  const remove = async (d: Discount) => {
    try {
      await api(`${base}/${d.id}`, { method: 'DELETE' })
      setRows((all) => all && all.filter((x) => x.id !== d.id))
    } catch (err) {
      setError(errorCode(err))
    }
  }

  return (
    <div className="page page--narrow">
      <PageHeader title={t('discounts')} description={t('discounts.d')} />
      <form className="card card--form" onSubmit={(e) => void create(e)} noValidate>
        <h2>{t('discCreate')}</h2>
        <div className="price-grid price-grid--two">
          <Field id="disc-code" label={t('discCode')} help={t('discCodeHelp')} maxLength={30} autoComplete="off" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <div className="field">
            <label htmlFor="disc-kind">{t('discKind')}</label>
            <select id="disc-kind" className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="percent">{t('discPercent')}</option>
              <option value="amount">{t('discAmount')}</option>
            </select>
          </div>
          <Field id="disc-value" label={t('discValue')} unit={form.kind === 'percent' ? '%' : '৳'} inputMode="numeric" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          <Field id="disc-min" label={t('discMin')} unit="৳" inputMode="numeric" value={form.minSubtotal} onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })} />
          <Field id="disc-uses" label={t('discMaxUses')} help={t('discMaxUsesHelp')} inputMode="numeric" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
          <Field id="disc-ends" type="datetime-local" label={t('discEnds')} help={t('discEndsHelp')} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
        </div>
        {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        <div className="row"><Button type="submit" variant="primary" disabled={busy || !form.code || !digits(form.value)} aria-busy={busy}>{t('discCreate')}</Button></div>
      </form>

      <section className="card">
        {failed && <Notice role="alert" title={t('discLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />}
        {!failed && !rows && <Skeleton />}
        {rows && rows.length === 0 && <p className="muted">{t('discEmpty')}</p>}
        {rows && rows.length > 0 && (
          <ul className="blocked-list">
            {rows.map((d) => {
              const expired = d.endsAt !== null && new Date(d.endsAt) < new Date()
              return (
                <li key={d.id}>
                  <span className="blocked-list__text">
                    <strong>{d.code} · {d.kind === 'percent' ? `${num(d.value)}%` : money(d.value)}</strong>
                    <span className="muted">
                      {[d.maxUses ? t('discUsesOf', { uses: num(d.uses), max: num(d.maxUses) }) : t('discUses', { uses: num(d.uses) }),
                        d.minSubtotal > 0 && t('discMinLine', { money: money(d.minSubtotal) }),
                        d.endsAt && `${t('discEnds')} ${time(d.endsAt)}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {expired ? <Badge>{t('discExpired')}</Badge> : <Badge tone={d.active ? 'success' : 'neutral'}>{t(d.active ? 'discOn' : 'discOff')}</Badge>}
                  <Button onClick={() => void toggle(d)}>{t(d.active ? 'discTurnOff' : 'discTurnOn')}</Button>
                  {current.role !== 'staff' && <button type="button" className="media__dismiss" aria-label={t('discDelete', { value: d.code })} title={t('discDelete', { value: d.code })} onClick={() => void remove(d)}><X size={16} aria-hidden="true" /></button>}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
