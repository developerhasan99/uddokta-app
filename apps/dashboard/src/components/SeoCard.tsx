import { Pencil, X } from 'lucide-react'
import { useLang } from '../i18n'
import { searchDescription, seoDescriptionLimit, seoTitleLimit, slugify } from '../product-form'
import { Field } from './ui'

type Seo = { seoTitle: string; seoDescription: string; handle: string }

// A preview of the search result, with the fields behind a pencil. Blank fields fall back to the name and description.
export function SeoCard({ section, name, description: body, seoTitle, seoDescription, handle: typed, storeName, address, price, open, handleError, onToggle, onChange }: Seo & {
  section: 'products' | 'collections'; name: string; description: string; storeName: string; address: string; price?: string | null; open: boolean; handleError?: string; onToggle: () => void; onChange: (changes: Partial<Seo>) => void
}) {
  const { t, num } = useLang()
  const title = seoTitle || name
  const description = seoDescription || searchDescription(body)
  const handle = slugify(typed) || slugify(name) || section.slice(0, -1)
  const count = (n: number, max: number) => `${t('productSeoCount', { n: num(n), max: num(max) })}${n > max ? ` ${t('productSeoOver')}` : ''}`
  return (
    <section className="card card--flush seo-card">
      <div className="seo-card__head">
        <h2>{t('productSeo')}</h2>
        <button type="button" className="media__dismiss" aria-expanded={open} aria-label={t(open ? 'productSeoClose' : 'productSeoEdit')} title={t(open ? 'productSeoClose' : 'productSeoEdit')} onClick={onToggle}>
          {open ? <X size={16} aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />}
        </button>
      </div>
      <div className="seo-preview">
        <p className="seo-preview__store">{storeName}</p>
        <p className="muted seo-preview__url">{address} › {section} › {handle}</p>
        <p className="seo-preview__title">{title || t(section === 'products' ? 'productNew' : 'collectionNew')}</p>
        <p className="muted seo-preview__text">{description || t('productSeoNoDescription')}</p>
        {price && <p className="muted">{price}</p>}
      </div>
      {open && (
        <div className="seo-card__fields">
          <Field id="seo-title" name="seoTitle" label={t('productSeoTitle')} maxLength={300} autoComplete="off" placeholder={name} value={seoTitle} help={count(title.length, seoTitleLimit)} onChange={(e) => onChange({ seoTitle: e.target.value })} />
          <div className="field">
            <label htmlFor="seo-description">{t('productSeoDescription')}</label>
            <textarea id="seo-description" name="seoDescription" className="input input--area" rows={3} maxLength={1000} placeholder={searchDescription(body)} aria-describedby="seo-description-help" value={seoDescription} onChange={(e) => onChange({ seoDescription: e.target.value })} />
            <p id="seo-description-help" className="field__help">{count(description.length, seoDescriptionLimit)}</p>
          </div>
          <div className="field">
            <label htmlFor="seo-handle">{t('productHandle')}</label>
            <div className={handleError ? 'input-affix input-affix--invalid' : 'input-affix'}>
              <span aria-hidden="true">{section}/</span>
              <input id="seo-handle" name="handle" maxLength={100} autoComplete="off" placeholder={slugify(name)} aria-invalid={handleError ? true : undefined} aria-describedby="seo-handle-help" value={typed} onChange={(e) => onChange({ handle: e.target.value })} onBlur={() => onChange({ handle: slugify(typed) })} />
            </div>
            <div id="seo-handle-help">
              {handleError && <p className="field__help field__help--error">{handleError}</p>}
              <p className="field__help seo-card__url">{address}/{section}/{handle}</p>
              <p className="field__help">{t('productHandleHelp')}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
