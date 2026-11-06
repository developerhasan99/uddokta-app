import { newSection, type Content, type Label, type SectionType } from './schema.ts'

export const campaignTemplates = [
  { id: 'quick', name: ['ছোট বিক্রির পেজ', 'Quick sales page'], description: ['পণ্যের পরিচয়, ছবি ও অর্ডার ফর্ম।', 'Product introduction, photo and order form.'], sections: ['hero', 'order'] },
  { id: 'story', name: ['পণ্যের বিস্তারিত পেজ', 'Product details page'], description: ['পরিচয়, বিস্তারিত, ছবির গ্যালারি ও অর্ডার ফর্ম।', 'Introduction, details, photo gallery and order form.'], sections: ['hero', 'text', 'gallery', 'order'] },
] as const satisfies readonly { id: string; name: Label; description: Label; sections: readonly SectionType[] }[]

export type CampaignTemplate = typeof campaignTemplates[number]['id']
export const isCampaignTemplate = (value: unknown): value is CampaignTemplate => campaignTemplates.some((template) => template.id === value)

// Only the seller's real product information is prefilled. No sample reviews,
// benefits, policies, discounts or scarcity claims become campaign content.
export function campaignContent(template: CampaignTemplate, product: { id: string; name: string; images: string[] }, lang: 'bn' | 'en', id: () => string): Content {
  const english = lang === 'en'
  const sections = campaignTemplates.find((item) => item.id === template)!.sections.map((type) => {
    const section = newSection(type, id())
    if (type === 'hero') Object.assign(section.settings, { heading: product.name, text: '', image: product.images[0] ?? null, button: english ? 'Order now' : 'এখনই অর্ডার করুন' })
    if (type === 'text') Object.assign(section.settings, { heading: english ? 'Product details' : 'পণ্যের বিস্তারিত', body: '' })
    if (type === 'gallery') Object.assign(section.settings, { heading: english ? 'Product photos' : 'পণ্যের ছবি', items: product.images.slice(0, 12).map((image) => ({ image })) })
    if (type === 'order') Object.assign(section.settings, { product: product.id, heading: english ? 'Place your order' : 'অর্ডার করতে নিচের ফর্মটি পূরণ করুন', button: english ? 'Confirm order' : 'অর্ডার নিশ্চিত করুন' })
    return section
  })
  return { version: 1, canvas: { header: false, footer: false }, sections }
}
