import { html } from '@codemirror/lang-html'
import { EditorView } from 'codemirror'
import { CodeEditor, type CodeEditorProps } from './CodeEditor'

// Long lines wrap: the settings panel is narrow.
const language = [html({ autoCloseTags: true }), EditorView.lineWrapping]
export default function HtmlEditor(props: CodeEditorProps) { return <CodeEditor language={language} {...props} /> }
