import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { TriangleAlert } from 'lucide-react'
import { useAccount, useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { errorLabel, useLang } from '../i18n'
import { DialogHead } from './DialogHead'
import { useDialog } from './dialog'
import { Button, Field } from './ui'

// Deleting a store (apps/api/src/store-deletion.ts): the owner asks with the store's address and their password; the
// store is offline and read-only for 30 days, every member sees the bar below, and the owner can restore it until then.

const dayText = (iso: string, lang: string) => new Date(iso).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

// Across the top of every store screen while the store waits to be deleted.
export function DeletionBar() {
  const { t, lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const { refresh } = useAccount()
  const current = useCurrentStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const due = current?.store.deletionDueAt
  if (!current || !due) return null
  const restore = async () => {
    setBusy(true); setError(null)
    try { await api(`/stores/${current.store.handle}/deletion`, { method: 'DELETE' }); await refresh() } catch (err) { setError(errorCode(err)); setBusy(false) }
  }
  return (
    <div className="deletion-bar" role="status">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>
        <strong>{L([`${dayText(due, lang)} দোকানটি পুরোপুরি মুছে যাবে।`, `This store will be deleted for good on ${dayText(due, lang)}.`])}</strong>{' '}
        {L(['ততদিন দোকান ক্রেতাদের জন্য বন্ধ, আর কিছু বদলানো যাবে না।', 'Until then it is closed to buyers and nothing can be changed.'])}
        {error && <> {t(errorLabel(error))}</>}
      </span>
      {current.role === 'owner'
        ? <Button variant="primary" disabled={busy} aria-busy={busy} onClick={() => void restore()}>{L(['দোকান ফিরিয়ে আনুন', 'Restore store'])}</Button>
        : <span className="muted">{L(['মালিক দোকানটি ফিরিয়ে আনতে পারেন।', 'The owner can restore it.'])}</span>}
    </div>
  )
}

// Across the top of every store screen while Uddokta has the store suspended (console). The reason stays internal.
export function SuspendedBar() {
  const { lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const current = useCurrentStore()
  if (!current?.store.suspendedAt) return null
  return (
    <div className="deletion-bar" role="status">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>
        <strong>{L(['উদ্যোক্তা এই দোকানটি সাময়িকভাবে বন্ধ রেখেছে।', 'Uddokta has suspended this store.'])}</strong>{' '}
        {L(['ক্রেতারা এখন দোকান ও ল্যান্ডিং পেজ দেখতে পাচ্ছেন না, আর কিছু বদলানো যাবে না। কারণ জানতে ও দোকান চালু করতে উদ্যোক্তা সাপোর্টে যোগাযোগ করুন।', 'Buyers cannot open the store or its landing pages, and nothing can be changed. Contact Uddokta support to find out why and get it back online.'])}
      </span>
    </div>
  )
}

// Settings › Store, owners only: the last section of the page.
export function DeleteStoreSection() {
  const { lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const current = useCurrentStore()!
  const [open, setOpen] = useState(false)
  if (current.role !== 'owner') return null
  const due = current.store.deletionDueAt
  return (
    <section className="card card--form danger-zone" aria-labelledby="store-delete">
      <div>
        <h2 id="store-delete">{L(['দোকান মুছে ফেলুন', 'Delete store'])}</h2>
        <p className="muted">{due
          ? L([`মুছে ফেলার অনুরোধ করা হয়েছে। ${dayText(due, lang)} পর্যন্ত ওপরের বার থেকে ফিরিয়ে আনতে পারবেন।`, `Deletion is scheduled. You can restore the store from the bar at the top until ${dayText(due, lang)}.`])
          : L(['দোকান সঙ্গে সঙ্গে ক্রেতাদের জন্য বন্ধ হবে। ৩০ দিন পর পণ্য, অর্ডার, পেজ, ছবিসহ সবকিছু চিরতরে মুছে যাবে। এর মধ্যে চাইলে ফিরিয়ে আনতে পারবেন।', 'The store closes to buyers at once. After 30 days everything in it (products, orders, pages, images) is deleted for good. You can restore it until then.'])}</p>
      </div>
      {!due && <div><Button variant="danger" onClick={() => setOpen(true)}>{L(['দোকান মুছে ফেলুন…', 'Delete store…'])}</Button></div>}
      {open && createPortal(<DeleteStoreDialog onClose={() => setOpen(false)} />, document.body)}
    </section>
  )
}

function DeleteStoreDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const { refresh } = useAccount()
  const current = useCurrentStore()!
  const handle = current.store.handle
  const { ref, close, props } = useDialog(onClose)
  const [confirm, setConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  const ready = confirm.trim() === handle && password.length > 0
  const remove = async () => {
    if (!ready || busy) return
    setBusy(true); setError(null)
    try {
      await api(`/stores/${handle}/deletion`, { method: 'POST', body: { confirm: confirm.trim(), password } })
      close(() => void refresh())
    } catch (err) { setError(errorCode(err)); setBusy(false) }
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void remove() } }
  return (
    <dialog {...props} className="modal" aria-labelledby="store-delete-title" onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
      <DialogHead id="store-delete-title" title={L([`"${current.store.name}" মুছে ফেলবেন?`, `Delete "${current.store.name}"?`])} disabled={busy} onClose={() => close()} />
      <div className="dialog__body">
        <p>{L(['দোকানটি এখনই ক্রেতাদের জন্য বন্ধ হবে, টিমের কেউ কিছু বদলাতে পারবে না। ৩০ দিন পর সব তথ্য ও ছবি চিরতরে মুছে যাবে, তখন আর ফেরানো যাবে না।', 'The store closes to buyers now and nobody on the team can change anything. After 30 days all its data and images are deleted for good and cannot be brought back.'])}</p>
        <Field id="store-delete-confirm" label={L([`নিশ্চিত করতে দোকানের ঠিকানা লিখুন: ${handle}`, `Type the store address to confirm: ${handle}`])} autoComplete="off" value={confirm} disabled={busy} onChange={(e) => setConfirm(e.target.value)} onKeyDown={enter} />
        <Field id="store-delete-password" type="password" label={L(['আপনার পাসওয়ার্ড', 'Your password'])} autoComplete="current-password" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} onKeyDown={enter} />
        {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      </div>
      <footer className="dialog__foot dialog__foot--split">
        <Button disabled={busy} onClick={() => close()}>{t('cancel')}</Button>
        <Button variant="danger" disabled={!ready || busy} aria-busy={busy} onClick={() => void remove()}>{L(['দোকান মুছে ফেলুন', 'Delete store'])}</Button>
      </footer>
    </dialog>
  )
}
