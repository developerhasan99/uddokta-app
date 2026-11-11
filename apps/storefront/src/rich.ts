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

