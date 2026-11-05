import { isIconName, type IconName } from './icons/catalog.ts'

// Page content: versioned JSON, shared by the API (which validates it), the editor (which builds its forms from it)
// and the storefront (which renders it). No JSX here, so the API can import it without a build step.

export type Label = readonly [bn: string, en: string]

export type Leaf =
  | { key: string; kind: 'icon'; label: Label; defaultIcon?: IconName }
  | { key: string; kind: 'text' | 'textarea'; label: Label; max: number }
  | { key: string; kind: 'image' | 'product' | 'url' | 'link' | 'color'; label: Label }
  | { key: string; kind: 'number'; label: Label; min: number; max: number }
  | { key: string; kind: 'select'; label: Label; options: readonly { value: string; label: Label }[] }
  | { key: string; kind: 'amount' | 'datetime'; label: Label }
export type Field = (Leaf & { group?: 'layout' }) | { key: string; kind: 'list'; label: Label; max: number; item: Label; fields: Leaf[] }

export type SectionDef = { label: Label; fields: Field[]; defaults: Settings }

export type Value = string | number | null | Record<string, string | null>[]
export type Settings = Record<string, Value>
export type SectionStyle = Record<string, string | number>
export type Section = { id: string; type: SectionType; hidden: boolean; settings: Settings; style?: SectionStyle }
export type Content = { version: 1; sections: Section[]; canvas?: { header: boolean; footer: boolean } }

const heading = (max = 120): Leaf => ({ key: 'heading', kind: 'text', label: ['শিরোনাম', 'Heading'], max })


const select = (key: string, label: Label, options: readonly (readonly [string, Label])[]): Leaf & { group: 'layout' } => ({ key, kind: 'select', label, group: 'layout', options: options.map(([value, label]) => ({ value, label })) })
const splitLayout = select('layout', ['বিন্যাস', 'Layout'], [['split', ['লেখা বামে, ছবি ডানে', 'Text left, media right']], ['reverse', ['ছবি বামে, লেখা ডানে', 'Media left, text right']], ['center', ['মাঝখানে', 'Centered']]])
const button = (): Leaf => ({ key: 'button', kind: 'text', label: ['বাটনের লেখা', 'Button text'], max: 60 })
const link = (key = 'link', label: Label = ['লিংক (ফাঁকা রাখলে অর্ডার ফর্ম)', 'Link (blank uses order form)']): Leaf => ({ key, kind: 'link', label })
const icon = (defaultIcon?: IconName): Leaf => ({ key: 'icon', kind: 'icon', label: ['আইকন', 'Icon'], ...(defaultIcon ? { defaultIcon } : {}) })
const buttonIcon = (): Leaf => ({ key: 'buttonIcon', kind: 'icon', label: ['বাটনের আইকন', 'Button icon'] })
const description = (): Leaf => ({ key: 'text', kind: 'textarea', label: ['বর্ণনা', 'Description'], max: 2000 })
const cards = (label: Label, withImage = false, withIcon = false): Field => ({ key: 'items', kind: 'list', label, item: ['আইটেম', 'Item'], max: 16, fields: [
  { key: 'title', kind: 'text', label: ['শিরোনাম', 'Title'], max: 120 },
  { key: 'text', kind: 'textarea', label: ['বিস্তারিত', 'Details'], max: 600 },
  ...(withIcon ? [icon()] : []),
  ...(withImage ? [{ key: 'image', kind: 'image', label: ['ছবি', 'Image'] } as Leaf] : []),
] })

// Optional overrides inherit the store theme when absent. A blank control removes its override.
export const styleFields: (Leaf & { group: 'layout' | 'style' })[] = [
  { key: 'align', kind: 'select', label: ['লেখার অবস্থান', 'Text alignment'], group: 'layout', options: [{ value: 'left', label: ['বামে', 'Left'] }, { value: 'center', label: ['মাঝখানে', 'Center'] }, { value: 'right', label: ['ডানে', 'Right'] }] },
  { key: 'maxWidth', kind: 'number', min: 320, max: 1600, label: ['কন্টেন্টের সর্বোচ্চ প্রস্থ (px)', 'Content max width (px)'], group: 'layout' },
  { key: 'columns', kind: 'number', min: 1, max: 4, label: ['ডেস্কটপ কলাম', 'Desktop columns'], group: 'layout' },
  { key: 'mobileColumns', kind: 'number', min: 1, max: 2, label: ['মোবাইল কলাম', 'Mobile columns'], group: 'layout' },
  ...(['paddingTop', 'paddingBottom', 'paddingX', 'mobilePaddingTop', 'mobilePaddingBottom', 'gap', 'marginTop', 'marginBottom'] as const).map((key, i) => ({ key, kind: 'number' as const, min: 0, max: 160, label: ([ ['উপরের প্যাডিং (px)', 'Top padding (px)'], ['নিচের প্যাডিং (px)', 'Bottom padding (px)'], ['পাশের প্যাডিং (px)', 'Side padding (px)'], ['মোবাইলে উপরের প্যাডিং (px)', 'Mobile top padding (px)'], ['মোবাইলে নিচের প্যাডিং (px)', 'Mobile bottom padding (px)'], ['আইটেমের ফাঁক (px)', 'Item gap (px)'], ['উপরের মার্জিন (px)', 'Top margin (px)'], ['নিচের মার্জিন (px)', 'Bottom margin (px)'] ] as const)[i], group: 'layout' as const })),
  ...(['paddingLeft', 'paddingRight', 'marginLeft', 'marginRight', 'mobilePaddingLeft', 'mobilePaddingRight', 'mobileMarginTop', 'mobileMarginRight', 'mobileMarginBottom', 'mobileMarginLeft'] as const).map((key, i) => ({ key, kind: 'number' as const, min: 0, max: 160, label: ([['বামের প্যাডিং (px)', 'Left padding (px)'], ['ডানের প্যাডিং (px)', 'Right padding (px)'], ['বামের মার্জিন (px)', 'Left margin (px)'], ['ডানের মার্জিন (px)', 'Right margin (px)'], ['মোবাইলে বামের প্যাডিং (px)', 'Mobile left padding (px)'], ['মোবাইলে ডানের প্যাডিং (px)', 'Mobile right padding (px)'], ['মোবাইলে উপরের মার্জিন (px)', 'Mobile top margin (px)'], ['মোবাইলে ডানের মার্জিন (px)', 'Mobile right margin (px)'], ['মোবাইলে নিচের মার্জিন (px)', 'Mobile bottom margin (px)'], ['মোবাইলে বামের মার্জিন (px)', 'Mobile left margin (px)']] as const)[i], group: 'layout' as const })),
  { key: 'visibility', kind: 'select', label: ['ডিভাইসে দেখানো', 'Device visibility'], group: 'layout', options: [{ value: 'all', label: ['সব ডিভাইস', 'All devices'] }, { value: 'desktop', label: ['শুধু ডেস্কটপ', 'Desktop only'] }, { value: 'mobile', label: ['শুধু মোবাইল', 'Mobile only'] }] },
  ...(['background', 'color', 'accent', 'buttonText', 'cardBackground', 'borderColor'] as const).map((key, i) => ({ key, kind: 'color' as const, label: ([['পটভূমি', 'Background'], ['লেখার রং', 'Text color'], ['বাটন ও হাইলাইট', 'Button / accent'], ['বাটনের লেখার রং', 'Button text'], ['কার্ডের পটভূমি', 'Card background'], ['বর্ডারের রং', 'Border color']] as const)[i], group: 'style' as const })),
  ...(['headingSize', 'mobileHeadingSize', 'bodySize', 'buttonSize'] as const).map((key, i) => ({ key, kind: 'number' as const, min: 12, max: key.includes('Heading') || key === 'headingSize' ? 88 : 32, label: ([['শিরোনামের মাপ (px)', 'Heading size (px)'], ['মোবাইলে শিরোনামের মাপ (px)', 'Mobile heading size (px)'], ['লেখার মাপ (px)', 'Body size (px)'], ['বাটনের লেখার মাপ (px)', 'Button font size (px)']] as const)[i], group: 'style' as const })),
  { key: 'font', kind: 'select', label: ['ফন্ট', 'Font'], group: 'style', options: [{ value: 'sans', label: ['নোটো স্যান্স বাংলা', 'Noto Sans Bengali'] }, { value: 'serif', label: ['তিরো বাংলা', 'Tiro Bangla'] }] },
  { key: 'headingWeight', kind: 'select', label: ['শিরোনামের ওজন', 'Heading weight'], group: 'style', options: [{ value: '400', label: ['স্বাভাবিক', 'Regular'] }, { value: '600', label: ['সেমিবোল্ড', 'Semibold'] }, { value: '700', label: ['বোল্ড', 'Bold'] }] },
  { key: 'borderWidth', kind: 'number', min: 0, max: 12, label: ['বর্ডারের প্রস্থ (px)', 'Border width (px)'], group: 'style' },
  { key: 'borderStyle', kind: 'select', label: ['বর্ডারের ধরন', 'Border style'], group: 'style', options: [{ value: 'solid', label: ['সলিড', 'Solid'] }, { value: 'dashed', label: ['ড্যাশ', 'Dashed'] }, { value: 'dotted', label: ['বিন্দু', 'Dotted'] }] },
  { key: 'radius', kind: 'number', min: 0, max: 120, label: ['কার্ড ও ছবির কোণা (px)', 'Card / media corners (px)'], group: 'style' },
  { key: 'sectionRadius', kind: 'number', min: 0, max: 120, label: ['সেকশনের কোণা (px)', 'Section corners (px)'], group: 'style' },
  { key: 'buttonRadius', kind: 'number', min: 0, max: 80, label: ['বাটনের কোণা (px)', 'Button corners (px)'], group: 'style' },
  { key: 'shadow', kind: 'select', label: ['ছায়া', 'Shadow'], group: 'style', options: [{ value: 'none', label: ['ছায়া নেই', 'None'] }, { value: 'soft', label: ['হালকা', 'Soft'] }, { value: 'strong', label: ['গাঢ়', 'Strong'] }] },
  { key: 'iconSize', kind: 'number', min: 12, max: 120, label: ['আইকনের মাপ (px)', 'Icon size (px)'], group: 'style' },
  { key: 'iconColor', kind: 'color', label: ['আইকনের রং', 'Icon color'], group: 'style' },
  { key: 'iconBackground', kind: 'color', label: ['আইকনের পটভূমি', 'Icon background'], group: 'style' },
  { key: 'iconRadius', kind: 'number', min: 0, max: 80, label: ['আইকনের কোণা (px)', 'Icon corners (px)'], group: 'style' },
  { key: 'iconStroke', kind: 'select', label: ['আইকনের রেখা', 'Icon stroke'], group: 'style', options: [{ value: '1', label: ['সরু', 'Thin'] }, { value: '1.5', label: ['হালকা', 'Light'] }, { value: '2', label: ['স্বাভাবিক', 'Regular'] }, { value: '2.5', label: ['মোটা', 'Medium'] }, { value: '3', label: ['বোল্ড', 'Bold'] }] },
  { key: 'iconSurface', kind: 'select', label: ['আইকনের ধরন', 'Icon treatment'], group: 'style', options: [{ value: 'plain', label: ['শুধু আইকন', 'Plain'] }, { value: 'soft', label: ['হালকা পটভূমি', 'Soft background'] }, { value: 'outline', label: ['বর্ডার', 'Outlined'] }, { value: 'solid', label: ['গাঢ় পটভূমি', 'Solid background'] }] },
  { key: 'imageFit', kind: 'select', label: ['ছবি ফিট', 'Image fit'], group: 'style', options: [{ value: 'cover', label: ['ভরে দেখান', 'Cover'] }, { value: 'contain', label: ['পুরো ছবি', 'Contain'] }] },
  { key: 'imageRatio', kind: 'select', label: ['ছবির অনুপাত', 'Image ratio'], group: 'style', options: [{ value: 'auto', label: ['স্বাভাবিক', 'Natural'] }, { value: '1/1', label: ['বর্গাকার', 'Square'] }, { value: '4/3', label: ['ল্যান্ডস্কেপ ৪:৩', 'Landscape 4:3'] }, { value: '3/4', label: ['পোর্ট্রেট ৩:৪', 'Portrait 3:4'] }, { value: '16/9', label: ['ওয়াইড ১৬:৯', 'Wide 16:9'] }] },
]

export const sectionDefs = {
  hero: {
    label: ['শুরুর ব্যানার', 'Hero banner'],
    fields: [
      heading(), splitLayout,
      { key: 'eyebrow', kind: 'text', label: ['ছোট উপশিরোনাম', 'Eyebrow'], max: 100 },
      link(),
      { key: 'text', kind: 'textarea', label: ['ছোট বর্ণনা', 'Short description'], max: 500 },
      { key: 'image', kind: 'image', label: ['ছবি', 'Image'] },
      { key: 'button', kind: 'text', label: ['বাটনের লেখা', 'Button text'], max: 40 }, buttonIcon(),
    ],
    defaults: { layout: 'split', eyebrow: '', link: '', heading: 'আপনার পণ্যের নাম এখানে লিখুন', text: 'পণ্যটি কেন কিনবেন, এক-দুই লাইনে বলুন।', image: null, button: 'এখনই অর্ডার করুন' },
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
        fields: [icon('check'), { key: 'title', kind: 'text', label: ['সুবিধা', 'Benefit'], max: 120 }, { key: 'text', kind: 'textarea', label: ['বিস্তারিত', 'Details'], max: 400 }],
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
      select('layout', ['বিন্যাস', 'Layout'], [['stack', ['এক কলাম', 'Stacked']], ['split', ['দুই কলাম', 'Two columns']]]),
      select('choices', ['প্যাক বাছাইয়ের ধরন', 'Variant presentation'], [['rows', ['সারি', 'Rows']], ['cards', ['কার্ড', 'Cards']]]),
      { key: 'product', kind: 'product', label: ['পণ্য', 'Product'] },
      { key: 'button', kind: 'text', label: ['বাটনের লেখা', 'Button text'], max: 40 }, buttonIcon(),
    ],
    defaults: { layout: 'stack', choices: 'rows', heading: 'অর্ডার করতে নিচের ফর্মটি পূরণ করুন', product: null, button: 'অর্ডার নিশ্চিত করুন' },
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
  announcement: {
    label: ['ঘোষণা বার', 'Announcement bar'],
    fields: [description(), button(), buttonIcon(), link()],
    defaults: { text: 'আপনার দোকানের গুরুত্বপূর্ণ তথ্য এখানে লিখুন', button: '', link: '' },
  },
  header: {
    label: ['পেজ হেডার', 'Page header'],
    fields: [{ key: 'brand', kind: 'text', label: ['ব্র্যান্ডের নাম', 'Brand name'], max: 100 }, { key: 'image', kind: 'image', label: ['লোগো', 'Logo'] }, button(), buttonIcon(), link(), { key: 'items', kind: 'list', label: ['নেভিগেশন লিংক', 'Navigation links'], item: ['লিংক', 'Link'], max: 6, fields: [{ key: 'title', kind: 'text', label: ['লেখা', 'Label'], max: 50 }, link('link', ['লিংক', 'Link'])] }],
    defaults: { brand: 'আপনার ব্র্যান্ড', image: null, button: 'অর্ডার করুন', link: '', items: [] },
  },
  footer: {
    label: ['পেজ ফুটার', 'Page footer'],
    fields: [heading(), description(), { key: 'items', kind: 'list', label: ['লিংক', 'Links'], item: ['লিংক', 'Link'], max: 8, fields: [{ key: 'title', kind: 'text', label: ['লেখা', 'Label'], max: 50 }, link('link', ['লিংক', 'Link'])] }],
    defaults: { heading: 'আপনার ব্র্যান্ড', text: 'যোগাযোগ ও দোকানের তথ্য এখানে লিখুন।', items: [] },
  },
  imageText: {
    label: ['ছবি ও গল্প', 'Image with text'],
    fields: [heading(), description(), { key: 'image', kind: 'image', label: ['ছবি', 'Image'] }, splitLayout, button(), buttonIcon(), link()],
    defaults: { heading: 'পণ্যের পেছনের গল্প', text: 'পণ্যের উৎস, উপাদান ও তৈরির গল্প বলুন।', image: null, layout: 'reverse', button: '', link: '' },
  },
  trust: {
    label: ['আস্থার বার', 'Trust strip'], fields: [cards(['তথ্য', 'Highlights'], false, true)],
    defaults: { items: [{ title: 'ক্যাশ অন ডেলিভারি', text: 'হাতে পেয়ে পেমেন্ট করুন' }, { title: 'ডেলিভারি তথ্য', text: 'আপনার ডেলিভারির নীতি লিখুন' }, { title: 'সহায়তা', text: 'দোকানের সাথে যোগাযোগ করুন' }] },
  },
  steps: {
    label: ['ধাপে ধাপে', 'Steps / process'], fields: [heading(), cards(['ধাপ', 'Steps'], false, true), select('layout', ['বিন্যাস', 'Layout'], [['grid', ['পাশাপাশি', 'Grid']], ['list', ['তালিকা', 'List']]])],
    defaults: { heading: 'যেভাবে ব্যবহার করবেন', layout: 'grid', items: [{ title: 'প্রথম ধাপ', text: 'প্রথমে কী করবেন লিখুন।' }, { title: 'দ্বিতীয় ধাপ', text: 'পরের কাজটি লিখুন।' }, { title: 'তৃতীয় ধাপ', text: 'শেষের কাজটি লিখুন।' }] },
  },
  specifications: {
    label: ['পণ্যের স্পেসিফিকেশন', 'Specifications'], fields: [heading(), { key: 'items', kind: 'list', label: ['তথ্য', 'Specifications'], item: ['তথ্য', 'Specification'], max: 24, fields: [{ key: 'title', kind: 'text', label: ['বৈশিষ্ট্য', 'Label'], max: 120 }, { key: 'text', kind: 'text', label: ['মান', 'Value'], max: 300 }] }],
    defaults: { heading: 'পণ্যের তথ্য', items: [{ title: 'উপাদান', text: 'পণ্যের সঠিক উপাদান লিখুন' }, { title: 'মাপ / পরিমাণ', text: 'মাপ বা পরিমাণ লিখুন' }] },
  },
  comparison: {
    label: ['তুলনার টেবিল', 'Comparison table'], fields: [heading(), { key: 'left', kind: 'text', label: ['প্রথম কলামের শিরোনাম', 'First column title'], max: 80 }, { key: 'right', kind: 'text', label: ['দ্বিতীয় কলামের শিরোনাম', 'Second column title'], max: 80 }, { key: 'items', kind: 'list', label: ['সারি', 'Rows'], item: ['সারি', 'Row'], max: 20, fields: [{ key: 'title', kind: 'text', label: ['বৈশিষ্ট্য', 'Feature'], max: 100 }, { key: 'left', kind: 'text', label: ['প্রথম মান', 'First value'], max: 300 }, { key: 'right', kind: 'text', label: ['দ্বিতীয় মান', 'Second value'], max: 300 }] }],
    defaults: { heading: 'পছন্দ করতে জেনে নিন', left: 'প্রথম প্যাক', right: 'দ্বিতীয় প্যাক', items: [{ title: 'পরিমাণ', left: 'প্রথম প্যাকের তথ্য', right: 'দ্বিতীয় প্যাকের তথ্য' }] },
  },
  cards: {
    label: ['ছবিসহ কার্ড / কম্বো', 'Image cards / bundle contents'], fields: [heading(), cards(['কার্ড', 'Cards'], true, true)],
    defaults: { heading: 'যা যা থাকছে', items: [{ title: 'প্রথম আইটেম', text: 'উপাদান, পরিমাণ বা বৈশিষ্ট্য লিখুন।', image: null }, { title: 'দ্বিতীয় আইটেম', text: 'এই আইটেমের তথ্য লিখুন।', image: null }] },
  },
  cta: {
    label: ['কল টু অ্যাকশন', 'Call to action'], fields: [heading(), description(), button(), buttonIcon(), link()],
    defaults: { heading: 'আপনার পছন্দের পণ্যটি বেছে নিন', text: 'অর্ডারের আগে সব তথ্য দেখে নিন।', button: 'অর্ডার করুন', link: '' },
  },
  icon: {
    label: ['আলাদা আইকন', 'Standalone icon'], fields: [icon(), { key: 'label', kind: 'text', label: ['অ্যাক্সেসিবল নাম', 'Accessible label'], max: 120 }, link('link', ['লিংক (ঐচ্ছিক)', 'Link (optional)'])],
    defaults: { icon: 'heart', label: '', link: '' },
  },
  iconCards: {
    label: ['আইকন কার্ড', 'Icon cards'], fields: [heading(), cards(['কার্ড', 'Cards'], false, true)],
    defaults: { heading: 'কেন আমাদের বেছে নেবেন', items: [{ icon: 'truck', title: 'ডেলিভারি', text: 'আপনার ডেলিভারির তথ্য লিখুন।' }, { icon: 'shield-check', title: 'যত্ন ও আস্থা', text: 'পণ্যের সঠিক তথ্য দিন।' }, { icon: 'headphones', title: 'গ্রাহক সহায়তা', text: 'যোগাযোগের তথ্য দিন।' }] },
  },
  iconList: {
    label: ['আইকন তালিকা', 'Icon list'], fields: [heading(), cards(['তালিকা', 'List items'], false, true)],
    defaults: { heading: 'এক নজরে সুবিধাগুলো', items: [{ icon: 'check', title: 'প্রথম সুবিধা', text: 'এই সুবিধার বিস্তারিত লিখুন।' }, { icon: 'check', title: 'দ্বিতীয় সুবিধা', text: 'এই সুবিধার বিস্তারিত লিখুন।' }] },
  },
} satisfies Record<string, SectionDef>

export type SectionType = keyof typeof sectionDefs
export const sectionTypes = Object.keys(sectionDefs) as SectionType[]
export const defOf = (type: SectionType): SectionDef => sectionDefs[type]

export function styleFieldsFor(type: SectionType) {
  const grid = (['features', 'reviews', 'gallery', 'trust', 'steps', 'cards', 'iconCards'] as SectionType[]).includes(type)
  const media = (['hero', 'image', 'imageText', 'gallery', 'cards'] as SectionType[]).includes(type)
  const icons = defOf(type).fields.some((field) => field.kind === 'icon' || (field.kind === 'list' && field.fields.some((sub) => sub.kind === 'icon')))
  return styleFields.filter((field) => {
    if (field.key.startsWith('icon')) return icons
    if (field.key === 'columns' || field.key === 'mobileColumns' || field.key === 'cardBackground') return grid || (field.key === 'cardBackground' && type === 'order')
    if (field.key === 'imageFit' || field.key === 'imageRatio') return media
    return true
  })
}

export const maxSections = 40
export const maxAmount = 100_000
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

export const newSection = (type: SectionType, id: string): Section => ({ id, type, hidden: false, settings: structuredClone(defOf(type).defaults) })

// What a new landing page starts with: the shape most single-product pages follow.
export const starterContent = (id: (n: number) => string): Content => ({
  version: 1,
  sections: (['hero', 'features', 'video', 'reviews', 'faq', 'order', 'contact'] as const).map((type, n) => newSection(type, id(n))),
})

export const isSectionLink = (raw: unknown): raw is string => typeof raw === 'string' && raw.length <= 500 && (raw === '' || /^(?:#[a-z0-9-]+|https:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d -]+)$/i.test(raw))

function readLeaf(field: Leaf, raw: unknown): string | number | null | undefined {
  switch (field.kind) {
    case 'icon':
      return raw === '' || isIconName(raw) ? raw : undefined
    case 'text':
    case 'textarea':
      return typeof raw === 'string' && raw.length <= field.max ? raw : undefined
    case 'select':
      return typeof raw === 'string' && field.options.some((o) => o.value === raw) ? raw : undefined
    case 'number':
      return Number.isInteger(raw) && (raw as number) >= field.min && (raw as number) <= field.max ? raw as number : undefined
    case 'color':
      return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw : undefined
    case 'link':
      return isSectionLink(raw) ? raw : undefined
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
    if (section.settings !== undefined && (!section.settings || typeof section.settings !== 'object' || Array.isArray(section.settings))) return null
    const given = (section.settings ?? {}) as Record<string, unknown>
    const settings: Settings = {}
    for (const field of defOf(section.type).fields) {
      if (field.kind === 'icon' && given[field.key] === undefined && defOf(section.type).defaults[field.key] === undefined) continue
      const value = given[field.key] ?? defOf(section.type).defaults[field.key] ?? null
      if (field.kind === 'list') {
        if (!Array.isArray(value) || value.length > field.max) return null
        const items: Record<string, string | null>[] = []
        for (const item of value as Record<string, unknown>[]) {
          if (!item || typeof item !== 'object') return null
          const read: Record<string, string | null> = {}
          for (const sub of field.fields) {
            if (sub.kind === 'icon' && item[sub.key] === undefined) continue
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
    const style = section.style === undefined ? undefined : readSectionStyle(section.style)
    if (style === null) return null
    sections.push({ id: section.id, type: section.type, hidden: section.hidden === true, settings, ...(style && Object.keys(style).length ? { style } : {}) })
  }
  if (doc.canvas !== undefined && (!doc.canvas || typeof doc.canvas !== 'object' || typeof doc.canvas.header !== 'boolean' || typeof doc.canvas.footer !== 'boolean')) return null
  return { version: 1, sections, ...(doc.canvas ? { canvas: { header: doc.canvas.header, footer: doc.canvas.footer } } : {}) }
}

export function readSectionStyle(raw: unknown): SectionStyle | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const result: SectionStyle = {}
  for (const field of styleFields) {
    const value = (raw as Record<string, unknown>)[field.key]
    if (value === undefined || value === '') continue
    const read = readLeaf(field, value)
    if (read === undefined || read === null) return null
    result[field.key] = read
  }
  return result
}

export const blankContent = (): Content => ({ version: 1, sections: [], canvas: { header: false, footer: false } })

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
