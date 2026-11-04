import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Search } from 'lucide-react'

type Variant = 'primary' | 'default' | 'danger'

export function Button({ variant = 'default', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...props} className={`btn btn--${variant}`} />
}

export function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" {...props} aria-label={label} className="btn btn--icon">{children}</button>
}

export function LinkButton({ to, variant = 'default', children }: { to: string; variant?: Variant; children: ReactNode }) {
  return <Link to={to} className={`btn btn--${variant}`}>{children}</Link>
}

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  )
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <PageTitle title={title} />
      <div className="page-header__text">
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </header>
  )
}

export function PageTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = title
  }, [title])
  return (
    null
  )
}

export function Notice({ title, body, role, action }: { title: string; body?: string; role?: 'alert'; action?: ReactNode }) {
  return (
    <div className="notice" role={role}>
      <h2>{title}</h2>
      {body && <p className="muted">{body}</p>}
      {action}
    </div>
  )
}

export function Field({ label, error, help, id, trailing, unit, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; error?: string; help?: string; trailing?: ReactNode; unit?: string }) {
  const message = error ?? help
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field__control">
        {unit && <span className="field__unit" aria-hidden="true">{unit}</span>}
        <input id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={message ? `${id}-help` : undefined} {...props} />
        {trailing}
      </div>
      {message && <p id={`${id}-help`} className={error ? 'field__help field__help--error' : 'field__help'}>{message}</p>}
    </div>
  )
}

export function SearchInput({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="search-field" role="search">
      <Search size={16} aria-hidden="true" />
      <input className="input" type="search" name="q" aria-label={label} placeholder={label} autoComplete="off" {...props} />
    </div>
  )
}

export function Skeleton({ width = '100%' }: { width?: string }) {
  return <span className="skeleton" style={{ width }} />
}
