import { useEffect, useState, type FormEvent } from 'react'
import { CircleCheck } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { Button, PageHeader, Skeleton } from '../components/ui'
import { chime, devicePrefs, notificationKinds, type NotificationKind } from '../components/Notifications'
import { errorLabel, useLang, type Key } from '../i18n'

type Settings = Partial<Record<NotificationKind, boolean>>
const supported = typeof window !== 'undefined' && 'Notification' in window

export function NotificationSettings() {
  const { t } = useLang()
  const handle = useCurrentStore()!.store.handle
  const [settings, setSettings] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [popups, setPopups] = useState(() => devicePrefs.get('popups') && supported && Notification.permission === 'granted')
  const [sound, setSound] = useState(() => devicePrefs.get('sound'))
  const [blocked, setBlocked] = useState(() => supported && Notification.permission === 'denied')

  useEffect(() => {
    setSettings(null)
    api<{ settings: Settings }>(`/stores/${handle}/notification-settings`).then((r) => setSettings(r.settings)).catch((err) => setError(errorCode(err)))
  }, [handle])

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 4000)
    return () => clearTimeout(timer)
  }, [done])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!settings) return
    setBusy(true)
    setError(null)
    try {
      setSettings((await api<{ settings: Settings }>(`/stores/${handle}/notification-settings`, { method: 'PUT', body: { settings } })).settings)
      setDone(true)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  // The browser asks the seller once; after a refusal only the browser's own settings can undo it.
  const togglePopups = async (on: boolean) => {
    if (on && Notification.permission !== 'granted') {
      const answer = await Notification.requestPermission()
      setBlocked(answer === 'denied')
      if (answer !== 'granted') return
    }
    devicePrefs.set('popups', on)
    setPopups(on)
  }

  const toggleSound = (on: boolean) => {
    devicePrefs.set('sound', on)
    setSound(on)
    if (on) chime()
  }

  const test = () => {
    if (sound) chime()
    if (popups) new Notification(t('notifTestTitle'), { body: t('notifTestBody'), icon: '/favicon.svg' })
  }

  return (
    <form className="page page--narrow" onSubmit={(e) => void save(e)} noValidate>
      <PageHeader title={t('notifications')} description={t('notifications.d')} action={<Button type="submit" variant="primary" disabled={busy || !settings} aria-busy={busy}>{t('productSave')}</Button>} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}

      <section className="card">
        <div>
          <h2>{t('notifWhatTitle')}</h2>
          <p className="muted">{t('notifWhatBody')}</p>
        </div>
        {!settings && !error && <Skeleton />}
        {settings && (
          <div className="switch-list">
            {notificationKinds.filter((kind) => kind in settings).map((kind) => (
              <label key={kind} className="switch-row">
                <input type="checkbox" className="check" checked={settings[kind] ?? false} onChange={(e) => setSettings({ ...settings, [kind]: e.target.checked })} />
                <span className="switch-row__text">
                  <span className="switch-row__title">{t(`notifKind.${kind}` as Key)}</span>
                  <span className="muted">{t(`notifKind.${kind}.d` as Key)}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>{t('notifDeviceTitle')}</h2>
            <p className="muted">{t('notifDeviceBody')}</p>
          </div>
          {(popups || sound) && <Button type="button" onClick={test}>{t('notifTest')}</Button>}
        </div>
        <div className="switch-list">
          <label className="switch-row">
            <input type="checkbox" className="check" checked={popups} disabled={!supported} onChange={(e) => void togglePopups(e.target.checked)} />
            <span className="switch-row__text">
              <span className="switch-row__title">{t('notifPopups')}</span>
              <span className="muted">{t(supported ? 'notifPopupsHelp' : 'notifPopupsUnsupported')}</span>
              {blocked && <span className="form-error">{t('notifPopupsBlocked')}</span>}
            </span>
          </label>
          <label className="switch-row">
            <input type="checkbox" className="check" checked={sound} onChange={(e) => toggleSound(e.target.checked)} />
            <span className="switch-row__text">
              <span className="switch-row__title">{t('notifSound')}</span>
              <span className="muted">{t('notifSoundHelp')}</span>
            </span>
          </label>
        </div>
      </section>

      <div className="toast-anchor" role="status">
        {done && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('notifSaved')}</p>}
      </div>
    </form>
  )
}
