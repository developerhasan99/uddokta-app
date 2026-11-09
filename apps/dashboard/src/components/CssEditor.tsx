import { useEffect, useRef } from 'react'
import { basicSetup, EditorView } from 'codemirror'
import { css } from '@codemirror/lang-css'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'

// CodeMirror for the page's custom CSS: highlighting, line numbers, property and value completion,
// bracket matching, search and folding. Loaded on demand, so it never weighs on the rest of the dashboard.
export default function CssEditor({ value, onChange, label, describedBy, maxLength }: { value: string; onChange: (value: string) => void; label: string; describedBy?: string; maxLength: number }) {
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
          css(),
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

  return <div ref={host} className="css-editor" />
}
