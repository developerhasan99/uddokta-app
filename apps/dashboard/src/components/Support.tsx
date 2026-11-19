import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { MessageCircle } from 'lucide-react'
import { api } from '../api'
import { useLang } from '../i18n'

// Uddokta support on WhatsApp: the number the console's Settings holds (shared with Billing), from the open
// GET /support so it works on the log-in page too. Nothing is shown while no number is set.

// A Bangladeshi number as wa.me wants it: digits only, 01… becomes 8801….
export const waDigits = (phone: string) => phone.replace(/\D/g, '').replace(/^0/, '880')

let cached: Promise<string> | null = null
const loadNumber = () => (cached ??= api<{ whatsapp: string }>('/support').then((r) => waDigits(r.whatsapp), () => { cached = null; return '' }))

export function useSupportNumber() {
  const [digits, setDigits] = useState('')
  useEffect(() => { let live = true; void loadNumber().then((d) => { if (live) setDigits(d) }); return () => { live = false } }, [])
  return digits
}

export function supportHref(digits: string, lang: string, store?: string) {
  const text = lang === 'bn'
    ? `হ্যালো, উদ্যোক্তা নিয়ে সাহায্য দরকার।${store ? ` দোকান: ${store}` : ''}`
    : `Hello, I need help with Uddokta.${store ? ` Store: ${store}` : ''}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export const supportLabel = (lang: string) => (lang === 'bn' ? 'WhatsApp-এ সাপোর্ট' : 'WhatsApp support')

// A small button, placed wherever a message tells the person to contact support.
export function SupportLink() {
  const { lang } = useLang()
  const { handle } = useParams()
  const digits = useSupportNumber()
  if (!digits) return null
  return (
    <a className="btn support-link" href={supportHref(digits, lang, handle)} target="_blank" rel="noopener noreferrer">
      <MessageCircle size={16} aria-hidden="true" />
      {supportLabel(lang)}
    </a>
  )
}
