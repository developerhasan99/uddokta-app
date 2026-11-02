import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Bold, Heading2, Italic, Link2, List, ListOrdered, RemoveFormatting, Underline } from 'lucide-react'
import { useLang, type Key } from '../i18n'
import { linkAddress } from '../product-form'
import { Button } from './ui'

const tools: { command: string; label: Key; Icon: typeof Bold }[] = [
  { command: 'heading', label: 'richHeading', Icon: Heading2 },
  { command: 'bold', label: 'richBold', Icon: Bold },
  { command: 'italic', label: 'richItalic', Icon: Italic },
  { command: 'underline', label: 'richUnderline', Icon: Underline },
  { command: 'insertUnorderedList', label: 'richBullets', Icon: List },
  { command: 'insertOrderedList', label: 'richNumbers', Icon: ListOrdered },
  { command: 'link', label: 'richLink', Icon: Link2 },
  { command: 'removeFormat', label: 'richClear', Icon: RemoveFormatting },
]

const linkAtSelection = () => {
  const node = document.getSelection()?.anchorNode
  return (node instanceof Element ? node : node?.parentElement)?.closest('a') ?? null
}
const isHeading = () => document.queryCommandValue('formatBlock').toLowerCase() === 'h2'

// The API cleans what this produces, so nothing here is trusted as safe.
// ponytail: execCommand is deprecated but works in every browser with no dependency; move to an editor library if a browser drops it or sellers need tables.
export function RichText({ labelledBy, value, invalid, onChange }: { labelledBy: string; value: string; invalid?: boolean; onChange: (html: string) => void }) {
  const { t } = useLang()
  const box = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<string[]>([])
  // The link box takes focus, so the seller's selection is kept here until they press Apply.
  const saved = useRef<Range | null>(null)
  const [link, setLink] = useState<{ address: string; existing: HTMLAnchorElement | null; bad: boolean } | null>(null)

  useEffect(() => {
    if (box.current && box.current.innerHTML !== value) box.current.innerHTML = value
  }, [value])

  useEffect(() => {
    const read = () => {
      const inside = box.current?.contains(document.getSelection()?.anchorNode ?? null)
      setActive(inside ? tools.filter(({ command }) => (command === 'heading' ? isHeading() : command === 'link' ? Boolean(linkAtSelection()) : command === 'underline' && linkAtSelection() ? false : command !== 'removeFormat' && document.queryCommandState(command))).map((tool) => tool.command) : [])
    }
    document.addEventListener('selectionchange', read)
    return () => document.removeEventListener('selectionchange', read)
  }, [])

  // A cleared editor leaves stray tags behind, which would count as an edit.
  const emit = (isComposing = false) => {
    const el = box.current!
    // Browsers leave the first line outside any paragraph. Not while a Bangla keyboard is composing a letter.
    const first = el.firstChild
    if (first && !isComposing && !(first instanceof HTMLElement && /^(P|H2|UL|OL|DIV)$/.test(first.tagName))) document.execCommand('formatBlock', false, 'p')
    onChange(el.textContent!.trim() || el.querySelector('li') ? el.innerHTML : '')
  }

  const restore = (range: Range | null) => {
    box.current!.focus()
    const selection = document.getSelection()!
    if (range) {
      selection.removeAllRanges()
      selection.addRange(range)
    }
    return selection
  }

  const openLink = () => {
    box.current!.focus()
    const selection = document.getSelection()!
    saved.current = selection.rangeCount > 0 && box.current!.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null
    const existing = linkAtSelection()
    setLink({ address: existing?.getAttribute('href') ?? '', existing, bad: false })
  }

  // Selects a whole existing link, so changing or removing it covers all of its words.
  const selectExisting = (anchor: HTMLAnchorElement) => {
    const range = document.createRange()
    range.selectNodeContents(anchor)
    restore(range)
  }

  const applyLink = () => {
    const address = link && linkAddress(link.address)
    if (!link) return
    if (!address) {
      setLink({ ...link, bad: true })
      return
    }
    if (link.existing) selectExisting(link.existing)
    const selection = restore(link.existing ? null : saved.current)
    // With nothing selected, the address itself becomes the link's words.
    if (selection.isCollapsed) {
      const anchor = document.createElement('a')
      anchor.href = address
      anchor.textContent = link.address.trim()
      document.execCommand('insertHTML', false, anchor.outerHTML)
    } else {
      document.execCommand('createLink', false, address)
      selection.collapseToEnd()
    }
    setLink(null)
    emit()
  }

  const removeLink = () => {
    if (!link?.existing) return
    selectExisting(link.existing)
    document.execCommand('unlink')
    document.getSelection()!.collapseToEnd()
    setLink(null)
    emit()
  }

  const linkKeys = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyLink()
    } else if (e.key === 'Escape') {
      setLink(null)
      restore(saved.current)
    }
  }

  const run = (command: string) => {
    if (command === 'link') {
      if (link) setLink(null)
      else openLink()
      return
    }
    box.current!.focus()
    document.execCommand('defaultParagraphSeparator', false, 'p')
    if (command === 'heading') document.execCommand('formatBlock', false, isHeading() ? 'p' : 'h2')
    else document.execCommand(command)
    emit()
  }

  // Pasted pages bring their own fonts and colours, so only the words come through.
  const paste = (e: ClipboardEvent) => {
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  }

  return (
    <div className={invalid ? 'rich-text rich-text--invalid' : 'rich-text'}>
      <div className="rich-text__tools" role="toolbar" aria-labelledby={labelledBy}>
        {tools.map(({ command, label, Icon }) => (
          <button key={command} type="button" aria-label={t(label)} title={t(label)} aria-pressed={command === 'removeFormat' ? undefined : active.includes(command)} onMouseDown={(e) => e.preventDefault()} onClick={() => run(command)}>
            <Icon size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
      {link && (
        <div className="rich-text__link">
          <input
            className="input"
            autoFocus
            autoComplete="off"
            inputMode="url"
            aria-label={t('richLinkAddress')}
            aria-invalid={link.bad ? true : undefined}
            placeholder={t('richLinkHint')}
            value={link.address}
            onChange={(e) => setLink({ ...link, address: e.target.value, bad: false })}
            onKeyDown={linkKeys}
          />
          <Button onClick={applyLink}>{t('richLinkApply')}</Button>
          {link.existing && <Button onClick={removeLink}>{t('richLinkRemove')}</Button>}
          {link.bad && <p className="field__help field__help--error rich-text__link-error" role="alert">{t('richLinkBad')}</p>}
        </div>
      )}
      <div
        ref={box}
        className="rich-text__body"
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelledBy}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
        onInput={(e) => emit((e.nativeEvent as InputEvent).isComposing)}
        onPaste={paste}
      />
    </div>
  )
}
