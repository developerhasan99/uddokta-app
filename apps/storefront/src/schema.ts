// Page content: versioned JSON, shared by the API (which validates it), the editor (which builds its forms from it)
// and the storefront (which renders it). No JSX here, so the API can import it without a build step.

export type Label = readonly [bn: string, en: string]

type Leaf =
  | { key: string; kind: 'text' | 'textarea'; label: Label; max: number }
  | { key: string; kind: 'image' | 'product' | 'url'; label: Label }
  | { key: string; kind: 'amount' | 'datetime'; label: Label }
export type Field = Leaf | { key: string; kind: 'list'; label: Label; max: number; item: Label; fields: Leaf[] }

export type SectionDef = { label: Label; fields: Field[]; defaults: Settings }

export type Value = string | number | null | Record<string, string | null>[]
export type Settings = Record<string, Value>
export type Section = { id: string; type: SectionType; hidden: boolean; settings: Settings }
export type Content = { version: 1; sections: Section[] }

const heading = (max = 120): Leaf => ({ key: 'heading', kind: 'text', label: ['শিরোনাম', 'Heading'], max })

export const sectionDefs = {
  hero: {
    label: ['শুরুর ব্যানার', 'Hero banner'],
    fields: [
      heading(),
      { key: 'text', kind: 'textarea', label: ['ছোট বর্ণনা', 'Short description'], max: 500 },
      { key: 'image', kind: 'image', label: ['ছবি', 'Image'] },
      { key: 'button', kind: 'text', label: ['বাটনের লেখা', 'Button text'], max: 40 },
    ],
    defaults: { heading: 'আপনার পণ্যের নাম এখানে লিখুন', text: 'পণ্যটি কেন কিনবেন, এক-দুই লাইনে বলুন।', image: null, button: 'এখনই অর্ডার করুন' },
  },
  text: {
    label: ['লেখা', 'Text'],
    fields: [heading(), { key: 'body', kind: 'textarea', label: ['লেখা', 'Text'], max: 5000 }],
    defaults: { heading: 'পণ্যের বিস্তারিত', body: 'এখানে পণ্যের মাপ, উপাদান আর ব্যবহারের নিয়ম লিখুন।' },
  },
  image: {
    label: ['ছবি', 'Image'],
    fields: [{ key: 'image', kind: 'image', label: ['ছবি', 'Image'] }, { key: 'caption', kind: 'text', label: ['ছবির নিচের লেখা', 'Caption'], max: 200 }],
    defaults: { image: null, caption: '' },
  },
  features: {
    label: ['সুবিধাগুলো', 'Benefits'],
    fields: [
      heading(),
      {
        key: 'items', kind: 'list', label: ['সুবিধা', 'Benefits'], item: ['সুবিধা', 'Benefit'], max: 12,
        fields: [{ key: 'title', kind: 'text', label: ['সুবিধা', 'Benefit'], max: 120 }, { key: 'text', kind: 'textarea', label: ['বিস্তারিত', 'Details'], max: 400 }],
      },
    ],
    defaults: {
      heading: 'কেন আমাদের পণ্য',
      items: [
        { title: '১০০% আসল পণ্য', text: 'হাতে পেয়ে দেখে টাকা দিন।' },
        { title: 'সারা দেশে ডেলিভারি', text: 'ঢাকায় ১-২ দিনে, বাইরে ২-৩ দিনে।' },
        { title: 'সহজ রিটার্ন', text: 'সমস্যা থাকলে ডেলিভারির সময়ই ফেরত দিন।' },
      ],
    },
  },
  video: {
    label: ['ভিডিও', 'Video'],
    fields: [heading(), { key: 'url', kind: 'url', label: ['ইউটিউব বা ফেসবুক ভিডিওর লিংক', 'YouTube or Facebook video link'] }],
    defaults: { heading: 'ভিডিওতে দেখুন', url: '' },
  },
  reviews: {
    label: ['কাস্টমারের মতামত', 'Customer reviews'],
    fields: [
      heading(),
      {
        key: 'items', kind: 'list', label: ['মতামত', 'Reviews'], item: ['মতামত', 'Review'], max: 20,
        fields: [
          { key: 'name', kind: 'text', label: ['কাস্টমারের নাম', 'Customer name'], max: 80 },
          { key: 'text', kind: 'textarea', label: ['মতামত', 'Review'], max: 600 },
          { key: 'image', kind: 'image', label: ['স্ক্রিনশট বা ছবি', 'Screenshot or photo'] },
        ],
      },
    ],
    defaults: { heading: 'কাস্টমাররা যা বলছেন', items: [{ name: 'কাস্টমারের নাম', text: 'কাস্টমারের আসল মতামত এখানে লিখুন, অথবা মেসেজের স্ক্রিনশট দিন।', image: null }] },
  },
  faq: {
    label: ['প্রশ্ন ও উত্তর', 'Questions and answers'],
    fields: [
      heading(),
      {
        key: 'items', kind: 'list', label: ['প্রশ্ন', 'Questions'], item: ['প্রশ্ন', 'Question'], max: 20,
        fields: [{ key: 'question', kind: 'text', label: ['প্রশ্ন', 'Question'], max: 200 }, { key: 'answer', kind: 'textarea', label: ['উত্তর', 'Answer'], max: 1000 }],
      },
    ],
    defaults: {
      heading: 'সাধারণ প্রশ্ন',
      items: [
        { question: 'ডেলিভারি চার্জ কত?', answer: 'ঢাকার ভেতরে আর বাইরে চার্জ অর্ডার ফর্মে দেখানো আছে।' },
        { question: 'টাকা কখন দেব?', answer: 'পণ্য হাতে পেয়ে, ডেলিভারি ম্যানের কাছে।' },
      ],
    },
  },
  order: {
    label: ['অর্ডার ফর্ম', 'Order form'],
    fields: [
      heading(),
      { key: 'product', kind: 'product', label: ['পণ্য', 'Product'] },
      { key: 'button', kind: 'text', label: ['বাটনের লেখা', 'Button text'], max: 40 },
    ],
    defaults: { heading: 'অর্ডার করতে নিচের ফর্মটি পূরণ করুন', product: null, button: 'অর্ডার নিশ্চিত করুন' },
  },
  gallery: {
    label: ['ছবির গ্যালারি', 'Photo gallery'],
    fields: [
      heading(),
      { key: 'items', kind: 'list', label: ['ছবি', 'Photos'], item: ['ছবি', 'Photo'], max: 12, fields: [{ key: 'image', kind: 'image', label: ['ছবি', 'Photo'] }] },
    ],
    defaults: { heading: 'আরও ছবি', items: [{ image: null }, { image: null }, { image: null }] },
  },
  countdown: {
    label: ['অফারের সময় গণনা', 'Offer countdown'],
    fields: [
      heading(),
      { key: 'ends', kind: 'datetime', label: ['অফার শেষ হবে', 'Offer ends'] },
      { key: 'ended', kind: 'text', label: ['শেষ হলে যা লেখা থাকবে', 'Text once it ends'], max: 120 },
    ],
    defaults: { heading: 'অফার শেষ হতে বাকি', ends: '', ended: 'অফারটি শেষ হয়েছে' },
  },
  contact: {
    label: ['কল ও হোয়াটসঅ্যাপ', 'Call and WhatsApp'],
    fields: [
      heading(),
      { key: 'phone', kind: 'text', label: ['ফোন নম্বর', 'Phone number'], max: 20 },
      { key: 'whatsapp', kind: 'text', label: ['হোয়াটসঅ্যাপ নম্বর', 'WhatsApp number'], max: 20 },
    ],
    defaults: { heading: 'অর্ডার করতে সমস্যা হলে কল করুন', phone: '', whatsapp: '' },
  },
} satisfies Record<string, SectionDef>

export type SectionType = keyof typeof sectionDefs
export const sectionTypes = Object.keys(sectionDefs) as SectionType[]
export const defOf = (type: SectionType): SectionDef => sectionDefs[type]

export const maxSections = 40
export const maxAmount = 100_000
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

export const newSection = (type: SectionType, id: string): Section => ({ id, type, hidden: false, settings: structuredClone(defOf(type).defaults) })

// What a new landing page starts with: the shape most single-product pages follow.
export const starterContent = (id: (n: number) => string): Content => ({
  version: 1,
  sections: (['hero', 'features', 'video', 'reviews', 'faq', 'order', 'contact'] as const).map((type, n) => newSection(type, id(n))),
})

function readLeaf(field: Leaf, raw: unknown): string | number | null | undefined {
  switch (field.kind) {
    case 'text':
    case 'textarea':
      return typeof raw === 'string' && raw.length <= field.max ? raw : undefined
    case 'url':
      return typeof raw === 'string' && raw.length <= 500 && (raw === '' || /^https:\/\//.test(raw)) ? raw : undefined
    case 'image':
    case 'product':
      return raw === null || isId(raw) ? raw : undefined
    case 'datetime':
      return typeof raw === 'string' && (raw === '' || (raw.length <= 40 && !Number.isNaN(Date.parse(raw)))) ? raw : undefined
    case 'amount':
      return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) <= maxAmount ? raw as number : undefined
  }
}

// The trust boundary for page content: anything that does not match the section's schema is refused, and unknown keys are dropped.
export function readContent(raw: unknown): Content | null {
  const doc = raw as Content
  if (!doc || typeof doc !== 'object' || doc.version !== 1 || !Array.isArray(doc.sections) || doc.sections.length > maxSections) return null
  const ids = new Set<string>()
  const sections: Section[] = []
  for (const s of doc.sections as unknown[]) {
    const section = s as Section
    if (!section || typeof section !== 'object' || !(sectionTypes as string[]).includes(section.type)) return null
    if (typeof section.id !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(section.id) || ids.has(section.id)) return null
    ids.add(section.id)
    const given = (section.settings ?? {}) as Record<string, unknown>
    const settings: Settings = {}
    for (const field of defOf(section.type).fields) {
      const value = given[field.key] ?? defOf(section.type).defaults[field.key] ?? null
      if (field.kind === 'list') {
        if (!Array.isArray(value) || value.length > field.max) return null
        const items: Record<string, string | null>[] = []
        for (const item of value as Record<string, unknown>[]) {
          if (!item || typeof item !== 'object') return null
          const read: Record<string, string | null> = {}
          for (const sub of field.fields) {
            const v = readLeaf(sub, item[sub.key] ?? (sub.kind === 'image' ? null : ''))
            if (v === undefined || typeof v === 'number') return null
            read[sub.key] = v
          }
          items.push(read)
        }
        settings[field.key] = items
      } else {
        const v = readLeaf(field, value)
        if (v === undefined) return null
        settings[field.key] = v
      }
    }
    sections.push({ id: section.id, type: section.type, hidden: section.hidden === true, settings })
  }
  return { version: 1, sections }
}

// Every image and product a page points at, so the API can check they belong to the store and the storefront can load them.
export function references(content: Content) {
  const media = new Set<string>()
  const products = new Set<string>()
  for (const section of content.sections) {
    for (const field of defOf(section.type).fields) {
      const value = section.settings[field.key]
      if (field.kind === 'image' && typeof value === 'string') media.add(value)
      if (field.kind === 'product' && typeof value === 'string') products.add(value)
      if (field.kind === 'list' && Array.isArray(value)) {
        for (const sub of field.fields) if (sub.kind === 'image') for (const item of value) if (item[sub.key]) media.add(item[sub.key]!)
      }
    }
  }
  return { media: [...media], products: [...products] }
}

// Only YouTube and Facebook links are embedded; anything else shows nothing rather than an arbitrary frame.
export function videoEmbed(url: string) {
  if (!URL.canParse(url)) return null
  const u = new URL(url)
  const host = u.hostname.replace(/^(www|m)\./, '')
  const youtube = host === 'youtu.be' ? u.pathname.slice(1)
    : host === 'youtube.com' ? (u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1])
    : null
  if (youtube && /^[\w-]{6,20}$/.test(youtube)) return `https://www.youtube-nocookie.com/embed/${youtube}`
  if (host === 'facebook.com' || host === 'fb.watch') return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`
  return null
}

// Bangladeshi mobile numbers, typed with Bangla or English digits, with or without +88.
export function readPhone(raw: string) {
  const digits = raw.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/[\s-]/g, '').replace(/^\+?88/, '')
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null
}
