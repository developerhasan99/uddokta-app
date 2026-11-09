import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useLang } from '../i18n'

// The one dialog header: title (with an optional line above or below it) and the round close button.
// Pair it with .dialog__body and .dialog__foot inside a .modal or .picker (see "Dialogs" in app.css).
export function DialogHead({ id, title, kicker, sub, onClose, disabled }: { id: string; title: ReactNode; kicker?: ReactNode; sub?: ReactNode; onClose: () => void; disabled?: boolean }) {
  const { t } = useLang()
  return (
    <header className="dialog__head">
      <div className="dialog__title">
        {kicker && <p className="dialog__kicker">{kicker}</p>}
        <h2 id={id}>{title}</h2>
        {sub && <p className="dialog__sub">{sub}</p>}
      </div>
      <button type="button" className="dialog__close" disabled={disabled} aria-label={t('mediaClose')} title={t('mediaClose')} onClick={onClose}><X size={18} aria-hidden="true" /></button>
    </header>
  )
}
