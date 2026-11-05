// Regenerate the curated, vendored SVG subset from the already installed lucide-react package.
// Review additions here; never generate from the entire package or accept uploaded SVG markup.
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const pkgPath = require.resolve('lucide-react/package.json')
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
const categories = {
  commerce: ['কেনাকাটা', 'Commerce'], delivery: ['ডেলিভারি', 'Delivery'], trust: ['আস্থা ও মান', 'Trust & quality'], support: ['যোগাযোগ', 'Communication'], marketing: ['মার্কেটিং', 'Marketing'], food: ['খাবার ও প্রকৃতি', 'Food & nature'], lifestyle: ['জীবনযাপন', 'Lifestyle'], actions: ['সাধারণ', 'Essentials'],
}
const groups = {
  commerce: [
    ['shopping-bag', 'শপিং ব্যাগ', 'Shopping bag'], ['shopping-cart', 'শপিং কার্ট', 'Shopping cart'], ['store', 'দোকান', 'Store'], ['gift', 'উপহার', 'Gift'], ['tag', 'প্রাইস ট্যাগ', 'Price tag'], ['tags', 'অফার ট্যাগ', 'Offer tags'], ['percent', 'শতাংশ ছাড়', 'Discount percent'], ['badge-percent', 'ছাড়ের ব্যাজ', 'Discount badge'], ['credit-card', 'পেমেন্ট কার্ড', 'Credit card'], ['banknote', 'নগদ টাকা', 'Cash banknote'],
  ],
  delivery: [
    ['truck', 'ডেলিভারি ট্রাক', 'Delivery truck'], ['package', 'প্যাকেজ', 'Package'], ['package-check', 'প্যাকেজ প্রস্তুত', 'Package ready'], ['package-open', 'খোলা প্যাকেজ', 'Open package'], ['map-pin', 'ঠিকানা', 'Location pin'], ['globe', 'সারা বিশ্ব', 'Globe'], ['clock', 'সময়', 'Clock'], ['timer', 'টাইমার', 'Timer'], ['calendar-check', 'ডেলিভারির তারিখ', 'Scheduled delivery'], ['refresh-cw', 'ফেরত ও বদল', 'Returns exchange'],
  ],
  trust: [
    ['shield-check', 'সুরক্ষা ও নিশ্চয়তা', 'Protection guarantee'], ['shield', 'ঢাল', 'Shield'], ['badge-check', 'যাচাইকৃত', 'Verified badge'], ['award', 'পুরস্কার', 'Award'], ['medal', 'পদক', 'Medal'], ['trophy', 'ট্রফি', 'Trophy'], ['check', 'সঠিক চিহ্ন', 'Check'], ['circle-check', 'সঠিক বৃত্ত', 'Check circle'], ['lock-keyhole', 'নিরাপদ', 'Secure lock'], ['heart-handshake', 'আস্থা ও যত্ন', 'Trust care'],
  ],
  support: [
    ['phone', 'ফোন', 'Phone'], ['mail', 'ইমেইল', 'Email'], ['message-circle', 'চ্যাট', 'Chat message'], ['messages-square', 'কথোপকথন', 'Conversation'], ['headphones', 'গ্রাহক সহায়তা', 'Customer support'], ['user-round', 'ব্যক্তি', 'Person'], ['users-round', 'দল ও পরিবার', 'People family'], ['thumbs-up', 'পছন্দ', 'Thumbs up'], ['smile', 'হাসি', 'Smile'], ['circle-help', 'সাহায্য ও প্রশ্ন', 'Help question'],
  ],
  marketing: [
    ['megaphone', 'ঘোষণা', 'Announcement'], ['target', 'লক্ষ্য', 'Target'], ['trending-up', 'বৃদ্ধি', 'Growth trend'], ['chart-no-axes-combined', 'অগ্রগতি', 'Progress chart'], ['mouse-pointer-click', 'ক্লিক', 'Click'], ['rocket', 'শুরু ও গতি', 'Launch rocket'], ['sparkles', 'বিশেষ', 'Sparkles'], ['star', 'তারকা', 'Star'], ['flame', 'জনপ্রিয়', 'Hot flame'], ['zap', 'দ্রুত', 'Fast lightning'],
  ],
  food: [
    ['leaf', 'পাতা ও প্রাকৃতিক', 'Natural leaf'], ['sprout', 'চারা', 'Sprout'], ['wheat', 'গম ও শস্য', 'Wheat grain'], ['apple', 'আপেল ও ফল', 'Apple fruit'], ['cherry', 'চেরি', 'Cherry'], ['coffee', 'চা ও কফি', 'Tea coffee'], ['cooking-pot', 'রান্না', 'Cooking pot'], ['utensils', 'খাবার', 'Food utensils'], ['droplet', 'পানি ও তেল', 'Water oil drop'], ['flower-2', 'ফুল', 'Flower'],
  ],
  lifestyle: [
    ['heart', 'ভালোবাসা ও যত্ন', 'Love heart'], ['sun', 'সূর্য ও দিন', 'Sun daytime'], ['moon', 'চাঁদ ও রাত', 'Moon night'], ['house', 'বাড়ি', 'Home house'], ['baby', 'শিশু', 'Baby'], ['shirt', 'পোশাক', 'Clothing shirt'], ['gem', 'রত্ন', 'Gem premium'], ['eye', 'চোখ', 'Eye'], ['recycle', 'পুনর্ব্যবহার', 'Recycle'], ['battery-charging', 'শক্তি', 'Energy battery'],
  ],
  actions: [
    ['arrow-right', 'ডান তীর', 'Arrow right'], ['play', 'চালু', 'Play'], ['camera', 'ক্যামেরা', 'Camera'], ['image', 'ছবি', 'Image photo'], ['video', 'ভিডিও', 'Video'], ['download', 'ডাউনলোড', 'Download'], ['link', 'লিংক', 'Link'], ['search', 'খুঁজুন', 'Search'], ['settings-2', 'সেটিংস', 'Settings'], ['menu', 'মেনু', 'Menu'],
  ],
}
const extraKeywords = { banknote: 'cod cash on delivery ক্যাশ অন ডেলিভারি টাকা পেমেন্ট', truck: 'shipping courier কুরিয়ার ডেলিভারি', 'shield-check': 'guarantee warranty authentic original খাঁটি আসল নিরাপত্তা গ্যারান্টি', 'refresh-cw': 'refund return replacement রিটার্ন রিফান্ড', leaf: 'organic natural eco fresh অর্গানিক প্রাকৃতিক', headphones: 'hotline service support সহায়তা হটলাইন' }
const catalog = {}
const nodes = {}
const allowedTags = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'])
const allowedAttrs = new Set(['d', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'rx', 'ry', 'points', 'fill', 'fillRule', 'clipRule', 'opacity', 'transform'])
for (const [category, icons] of Object.entries(groups)) for (const [id, bn, en] of icons) {
  let modulePath = resolve(dirname(pkgPath), 'dist/esm/icons', `${id}.mjs`)
  let data
  for (let depth = 0; depth < 4; depth++) {
    data = (await import(pathToFileURL(modulePath).href)).__iconData
    if (data) break
    const alias = (await readFile(modulePath, 'utf8')).match(/export \{ default \} from '\.\/([\w-]+)\.mjs'/)
    if (!alias) break
    modulePath = resolve(dirname(modulePath), `${alias[1]}.mjs`)
  }
  if (!data) throw new Error(`No SVG data: ${id}`)
  if (data.size !== 24) throw new Error(`Unexpected viewport: ${id}`)
  catalog[id] = { label: [bn, en], category, keywords: `${id.replaceAll('-', ' ')} ${extraKeywords[id] ?? ''}`.trim() }
  nodes[id] = data.node.map(([tag, attributes]) => {
    if (!allowedTags.has(tag)) throw new Error(`Disallowed SVG element: ${tag}`)
    const { key, ...attrs } = attributes
    if (Object.keys(attrs).some((attr) => !allowedAttrs.has(attr))) throw new Error(`Unexpected SVG attribute: ${id}`)
    return [tag, attrs]
  })
}
const output = resolve(root, 'apps/storefront/src/icons')
await writeFile(resolve(output, 'catalog.ts'), `// Curated Lucide ${pkg.version} subset. Regenerate: node scripts/update-builder-icons.mjs\n// SVG shapes and licenses live alongside this manifest. No runtime library discovery.\nexport const iconCategories = ${JSON.stringify(categories, null, 2)} as const\n\nexport const iconCatalog = ${JSON.stringify(catalog, null, 2)} as const\n\nexport type IconName = keyof typeof iconCatalog\nexport type IconCategory = keyof typeof iconCategories\nexport const iconNames = Object.keys(iconCatalog) as IconName[]\nconst names = new Set<string>(iconNames)\nexport const isIconName = (value: unknown): value is IconName => typeof value === 'string' && names.has(value)\n`)
await writeFile(resolve(output, 'nodes.ts'), `// Vendored Lucide ${pkg.version} SVG shapes; see LICENSE. Generated from the reviewed subset only.\nimport type { IconName } from './catalog.ts'\nexport type IconNode = readonly [tag: 'path' | 'circle' | 'rect' | 'line' | 'polyline' | 'polygon' | 'ellipse', attrs: Readonly<Record<string, string | number>>]\nexport const iconNodes: Record<IconName, readonly IconNode[]> = ${JSON.stringify(nodes)}\n`)
await writeFile(resolve(output, 'LICENSE'), await readFile(resolve(dirname(pkgPath), 'LICENSE')))
console.log(`Generated ${Object.keys(nodes).length} curated icons from Lucide ${pkg.version}`)
