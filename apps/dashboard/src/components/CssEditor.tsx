import { css } from '@codemirror/lang-css'
import { CodeEditor, type CodeEditorProps } from './CodeEditor'

const language = css()
export default function CssEditor(props: CodeEditorProps) { return <CodeEditor language={language} {...props} /> }
