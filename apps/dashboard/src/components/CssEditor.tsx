import { css } from '@codemirror/lang-css'
import { CodeEditor, type CodeEditorProps } from './CodeEditor'

const language = css()
const format = async (code: string) => (await import('js-beautify')).css(code, { indent_size: 2, end_with_newline: false })
export default function CssEditor(props: CodeEditorProps) { return <CodeEditor language={language} format={format} {...props} /> }
