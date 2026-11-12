import { useEffect, useRef, useState } from 'react'
import { WandSparkles } from 'lucide-react'
import { useLang } from '../i18n'
import { basicSetup, EditorView } from 'codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState, type Extension } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'

// CodeMirror for code the seller writes (page CSS, Custom HTML blocks): highlighting, line numbers, completion,
// bracket matching, search and folding. Each language has its own small module (CssEditor, HtmlEditor) that is
// loaded on demand, so neither weighs on the rest of the dashboard.
export type CodeEditorProps = { value: string; onChange: (value: string) => void; label: string; describedBy?: string; maxLength: number }
// format: tidies the code (Format button); the formatter loads only when the button is pressed.
export function CodeEditor({ language, format, value, onChange, label, describedBy, maxLength }: CodeEditorProps & { language: Extension; format?: (code: string) => Promise<string> }) {
  const { lang } = useLang()
  const L = (bn: string, en: string) => lang === 'bn' ? bn : en
  const [note, setNote] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const changed = useRef(onChange)
  changed.current = onChange

  useEffect(() => {
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          language,
          oneDark,
          keymap.of([indentWithTab]),
          EditorState.changeFilter.of((tr) => tr.newDoc.length <= maxLength),
          EditorView.contentAttributes.of({ 'aria-label': label, ...(describedBy ? { 'aria-describedby': describedBy } : {}) }),
          EditorView.updateListener.of((u) => { if (u.docChanged) changed.current(u.state.doc.toString()) }),
        ],
      }),
    })
    return () => view.current?.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Undo, redo and reloads change the value from outside.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  // One change, so a single undo brings the old code back.
  const tidy = async () => {
    const v = view.current
    if (!v || !format) return
    const code = v.state.doc.toString()
    let next: string
    try { next = await format(code) } catch { setNote(L('কোডটি সাজানো গেল না।', 'This code could not be formatted.')); return }
    if (next.length > maxLength) { setNote(L('সাজালে কোড সীমার চেয়ে লম্বা হয়ে যায়।', 'Formatted, the code would be over the length limit.')); return }
    setNote('')
    if (next !== code) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: next } })
  }

  return <div className="code-editor">
    {format && <div className="code-editor__bar">
      <button type="button" className="code-editor__format" onClick={tidy} title={L('কোড সুন্দর করে সাজান', 'Tidy indentation and line breaks')}><WandSparkles size={13} aria-hidden="true" />{L('কোড সাজান', 'Format code')}</button>
      {note && <span className="code-editor__note" role="status">{note}</span>}
    </div>}
    <div ref={host} className="css-editor" />
  </div>
}
