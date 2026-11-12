import { html } from '@codemirror/lang-html'
import { EditorView } from 'codemirror'
import { CodeEditor, type CodeEditorProps } from './CodeEditor'

// Long lines wrap: the settings panel is narrow.
const language = [html({ autoCloseTags: true }), EditorView.lineWrapping]
// js-beautify loads on the first Format; it also tidies the CSS and scripts inside <style> and <script>.
const format = async (code: string) => (await import('js-beautify')).html(code, { indent_size: 2, wrap_line_length: 0, indent_inner_html: false, extra_liners: [], end_with_newline: false })
export default function HtmlEditor(props: CodeEditorProps) { return <CodeEditor language={language} format={format} {...props} /> }
