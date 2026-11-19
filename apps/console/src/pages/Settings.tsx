import { useEffect, useState } from 'react'
import { Button, PageHeader } from '../../../dashboard/src/components/ui'
import { api, dateTime, errorText } from '../api'
import { LoadError, Loading, useLoad } from '../ui'

type Pay = { whatsapp: string; bkash: string; nagad: string; bank: string; note: string; updatedAt: string }

// How sellers pay for their plan. Shown on every store's Settings › Billing page in the dashboard.
export function Settings() {
  const { data, error, reload } = useLoad(() => api<Pay>('/console/settings'), [])
  const [form, setForm] = useState<Omit<Pay, 'updatedAt'> | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { if (data) setForm({ whatsapp: data.whatsapp, bkash: data.bkash, nagad: data.nagad, bank: data.bank, note: data.note }) }, [data])
  if (error) return <div className="page"><LoadError error={error} retry={reload} /></div>
  if (!data || !form) return <div className="page"><Loading /></div>
  const set = (patch: Partial<typeof form>) => { setForm({ ...form, ...patch }); setMessage(null) }
  const line = (key: 'whatsapp' | 'bkash' | 'nagad', label: string, help: string) => (
    <div className="field"><label htmlFor={`pay-${key}`}>{label}</label><input id={`pay-${key}`} className="input" inputMode="tel" maxLength={30} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} /><p className="field__help">{help}</p></div>
  )
  return (
    <div className="page page--narrow">
      <PageHeader title="Settings" description="How sellers pay for their plan. Every store’s Billing page shows these details." />
      <form className="card console-form" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true)
        try { await api('/console/settings', { method: 'PUT', body: form }); setMessage({ ok: true, text: 'Saved. Billing pages show the new details now.' }); reload() } catch (err) { setMessage({ ok: false, text: errorText(err) }) } finally { setBusy(false) }
      }}>
        <h2 className="console-h2">Payment details</h2>
        <div className="console-row">
          {line('bkash', 'bKash number', 'Merchant or personal number sellers send money to.')}
          {line('nagad', 'Nagad number', 'Leave blank if you do not take Nagad.')}
        </div>
        {line('whatsapp', 'WhatsApp number', 'Sellers send payments here, and every "WhatsApp support" link in the dashboard (account menu, log in, suspended store) opens this chat. Blank hides those links.')}
        <div className="field"><label htmlFor="pay-bank">Bank transfer</label><textarea id="pay-bank" className="input console-textarea" rows={3} maxLength={500} value={form.bank} onChange={(e) => set({ bank: e.target.value })} placeholder="Account name, number, bank and branch" /></div>
        <div className="field"><label htmlFor="pay-note">Instructions</label><textarea id="pay-note" className="input console-textarea" rows={3} maxLength={1000} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Send the payment with your store address as the reference, then message us on WhatsApp." /></div>
        {message && <p className={message.ok ? 'console-done' : 'form-error'} role="status">{message.text}</p>}
        <div className="console-actions"><Button type="submit" variant="primary" aria-busy={busy}>Save</Button><span className="muted console-note">Last changed {dateTime(data.updatedAt)}</span></div>
      </form>
    </div>
  )
}
