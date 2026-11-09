import { newNode, newSection, type Content, type Label, type NodeKind, type NodeStyle, type PageNode, type SectionType } from './schema.ts'

export const campaignTemplates = [
  { id: 'quick', name: ['ছোট বিক্রির পেজ', 'Quick sales page'], description: ['পণ্যের পরিচয়, ছবি ও অর্ডার ফর্ম।', 'Product introduction, photo and order form.'], sections: ['hero', 'order'] },
  { id: 'story', name: ['পণ্যের বিস্তারিত পেজ', 'Product details page'], description: ['পরিচয়, বিস্তারিত, ছবির গ্যালারি ও অর্ডার ফর্ম।', 'Introduction, details, photo gallery and order form.'], sections: ['hero', 'text', 'gallery', 'order'] },
  { id: 'modern', name: ['আধুনিক পণ্যের পেজ', 'Modern product page'], description: ['পাশাপাশি ছবি আর লেখা, ছবির সারি ও অর্ডার ফর্ম। সব অংশ নিজের মতো সাজানো যায়।', 'Image beside text, a row of photos and the order form. Every part can be rearranged.'], sections: ['layout', 'layout', 'order'] },
  { id: 'banner', name: ['রঙিন ব্যানার পেজ', 'Colour banner page'], description: ['রঙিন ব্যানারে পণ্যের নাম, ছবি আর বিস্তারিত, তারপর অর্ডার ফর্ম।', 'Your product name on a colour band, an image with details, then the order form.'], sections: ['layout', 'layout', 'order'] },
] as const satisfies readonly { id: string; name: Label; description: Label; sections: readonly SectionType[] }[]

export type CampaignTemplate = typeof campaignTemplates[number]['id']
export const isCampaignTemplate = (value: unknown): value is CampaignTemplate => campaignTemplates.some((template) => template.id === value)

// Only the seller's real product information is prefilled. No sample reviews,
// benefits, policies, discounts or scarcity claims become campaign content.
export function campaignContent(template: CampaignTemplate, product: { id: string; name: string; images: string[] }, lang: 'bn' | 'en', id: () => string): Content {
  const english = lang === 'en'
  let layoutIndex = 0
  const sections = campaignTemplates.find((item) => item.id === template)!.sections.map((type) => {
    const section = newSection(type, id())
    if (type === 'hero') Object.assign(section.settings, { heading: product.name, text: '', image: product.images[0] ?? null, button: english ? 'Order now' : 'এখনই অর্ডার করুন' })
    if (type === 'text') Object.assign(section.settings, { heading: english ? 'Product details' : 'পণ্যের বিস্তারিত', body: '' })
    if (type === 'gallery') Object.assign(section.settings, { heading: english ? 'Product photos' : 'পণ্যের ছবি', items: product.images.slice(0, 12).map((image) => ({ image })) })
    if (type === 'layout') section.children = layoutFor(template, layoutIndex++, product, english, id)
    if (type === 'order') Object.assign(section.settings, { product: product.id, heading: english ? 'Place your order' : 'অর্ডার করতে নিচের ফর্মটি পূরণ করুন', button: english ? 'Confirm order' : 'অর্ডার নিশ্চিত করুন' })
    return section
  })
  return { version: 2, canvas: { header: false, footer: false }, sections }
}

const node = (kind: NodeKind, id: () => string, props: PageNode['props'] = {}, style?: NodeStyle, children?: PageNode[]): PageNode => {
  const made = newNode(kind, id)
  return { ...made, props: { ...made.props, ...props }, ...(style ? { style } : {}), ...(children ? { children } : {}) }
}

// The layout parts of the layout templates. Text the seller has to write starts empty: buyers see nothing,
// the editor shows a prompt to fill it in.
function layoutFor(template: CampaignTemplate, n: number, product: { name: string; images: string[] }, english: boolean, id: () => string): PageNode[] {
  const image = (i: number, style?: NodeStyle) => node('image', id, { image: product.images[i] ?? product.images[0] ?? null }, { radius: 20, ...style })
  const order = (style?: NodeStyle) => node('button', id, { text: english ? 'Order now' : 'এখনই অর্ডার করুন' }, style)
  if (template === 'modern' && n === 0) return [node('box', id, {}, { direction: 'row', gap: 40, align: 'center' }, [
    image(0, { width: 50 }),
    node('box', id, {}, { width: 50, gap: 16 }, [node('heading', id, { text: product.name, level: 'h1' }), node('text', id, { text: '' }), order()]),
  ])]
  if (template === 'modern') return [
    node('heading', id, { text: english ? 'Product photos' : 'পণ্যের ছবি', level: 'h2' }, { textAlign: 'center' }),
    node('box', id, {}, { direction: 'row', gap: 16 }, (product.images.length > 1 ? product.images.slice(1, 4) : product.images.slice(0, 1)).map((_, i) => image(product.images.length > 1 ? i + 1 : 0, { radius: 16 }))),
  ]
  if (n === 0) return [node('box', id, {}, { align: 'center', textAlign: 'center', gap: 16, paddingTop: 56, paddingBottom: 56, paddingLeft: 24, paddingRight: 24, radius: 24, background: '#163b2e', color: '#ffffff' }, [
    node('heading', id, { text: product.name, level: 'h1' }), node('text', id, { text: '' }), order({ background: '#e2c86c', color: '#163b2e' }),
  ])]
  return [node('box', id, {}, { direction: 'row', gap: 32, align: 'center' }, [
    image(1, { width: 45 }),
    node('box', id, {}, { width: 55, gap: 12 }, [node('heading', id, { text: english ? 'About this product' : 'পণ্যের বিস্তারিত', level: 'h2' }), node('text', id, { text: '' })]),
  ])]
}
