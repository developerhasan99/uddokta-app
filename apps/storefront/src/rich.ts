// Rich text the seller writes (product descriptions, text elements). Only these tags survive, with no attributes,
// plus links to http(s), mailto and tel. Everything else is dropped and a stray "<" is escaped. It is the only
// thing that makes this HTML safe to render, so the storefront and the editor run it again before drawing.
const richTags: Record<string, string> = { p: 'p', div: 'p', br: 'br', b: 'strong', strong: 'strong', i: 'em', em: 'em', u: 'u', ul: 'ul', ol: 'ol', li: 'li', h2: 'h2', h3: 'h3' }

export function cleanRichText(html: string) {
  return html.replace(/<(\/?)([a-z][a-z0-9]*)\b[^<>]*>|</gi, (match, close: string, tag?: string) => {
    if (!tag) return '&lt;'
    if (tag.toLowerCase() === 'a') {
      if (close) return '</a>'
      const href = /\shref="((?:https?:\/\/|mailto:|tel:)[^"<>\s]*)"/i.exec(match)?.[1]
      return href ? `<a href="${href}">` : ''
    }
    const known = richTags[tag.toLowerCase()]
    return known ? `<${close}${known}>` : ''
  })
}

// Older text was plain, with blank lines between paragraphs.
export const isRich = (text: string) => /<[a-z/]/i.test(text)

// Plain text as rich text: each blank-line paragraph becomes a <p>, with its characters escaped.
export const toRich = (text: string) => (isRich(text) ? text : text.split(/\n{2,}/).filter((p) => p.trim()).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`).join(''))

// Custom HTML blocks. Same approach as cleanRichText: every tag is rebuilt from an allowlist and only checked
// attributes are copied, so nothing the seller writes reaches the page unchecked. Scripts, event handlers, forms,
// frames and <style> are dropped (with the content of script-like tags), links and images must be http(s),
// and tags are balanced so a stray </div> cannot close the page around the block. It is the only thing that makes
// this HTML safe: the API runs it on save and the renderer again before drawing (the editor preview included).
const htmlTags = new Set(['div', 'span', 'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'mark', 'sup', 'sub', 'blockquote', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'section', 'article', 'header', 'footer', 'aside', 'nav', 'details', 'summary'])
const voidTags = new Set(['br', 'hr', 'img'])
const attrPattern = /\s([a-z][a-z-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi
const escAttr = (v: string) => v.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function htmlAttrs(tag: string, raw: string): string {
  let out = ''
  for (const m of raw.matchAll(attrPattern)) {
    const name = m[1].toLowerCase()
    const value = m[2] ?? m[3] ?? m[4] ?? ''
    if (name === 'class' && /^[\w -]{1,200}$/.test(value)) out += ` class="${value}"`
    else if (name === 'id' && /^[a-z][\w-]{0,60}$/i.test(value)) out += ` id="${value}"`
    else if (name === 'style' && value.length <= 2000) out += ` style="${escAttr(value.replace(/[\\<>"]/g, ''))}"`
    else if ((name === 'title' || name === 'alt') && value.length <= 300) out += ` ${name}="${escAttr(value)}"`
    else if (name === 'href' && tag === 'a' && /^(?:https?:\/\/|mailto:|tel:|#)[^\s"<>]*$/i.test(value)) out += ` href="${value}"`
    else if (name === 'target' && tag === 'a' && value === '_blank') out += ' target="_blank" rel="noopener noreferrer"'
    else if (name === 'src' && tag === 'img' && /^https?:\/\/[^\s"<>]+$/i.test(value)) out += ` src="${value}"`
    else if ((name === 'width' || name === 'height') && tag === 'img' && /^\d{1,4}$/.test(value)) out += ` ${name}="${value}"`
    else if ((name === 'colspan' || name === 'rowspan') && (tag === 'td' || tag === 'th') && /^\d{1,2}$/.test(value)) out += ` ${name}="${value}"`
  }
  return out
}

export function cleanHtml(html: string): string {
  const open: string[] = []
  const body = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|template|noscript|iframe|object|embed|textarea|title|svg|math)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<(\/?)([a-z][a-z0-9]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>|</gi, (match, close: string, rawTag?: string, attrs = '') => {
      if (!rawTag) return '&lt;'
      const tag = rawTag.toLowerCase()
      if (!htmlTags.has(tag)) return ''
      if (voidTags.has(tag)) return close ? '' : `<${tag}${htmlAttrs(tag, attrs)}>`
      if (!close) { open.push(tag); return `<${tag}${htmlAttrs(tag, attrs)}>` }
      const at = open.lastIndexOf(tag)
      if (at < 0) return ''
      return open.splice(at).reverse().map((t) => `</${t}>`).join('')
    })
  return body + open.reverse().map((t) => `</${t}>`).join('')
}
