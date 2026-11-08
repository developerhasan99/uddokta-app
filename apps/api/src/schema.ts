import { orderStatusValues, type OrderFilters } from 'storefront/order-filters'
import { sql } from 'drizzle-orm'
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const roles = ['owner', 'admin', 'staff'] as const
export type Role = (typeof roles)[number]

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: createdAt(),
}, (t) => [check('users_email_lowercase', sql`${t.email} = lower(${t.email})`)])

// Kept apart from users so a user query can never select a password hash.
export const userCredentials = pgTable('user_credentials', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
})

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export const loginFailures = pgTable('login_failures', {
  email: text('email').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('login_failures_email_at').on(t.email, t.at)])

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  handle: text('handle').notNull().unique(),
  name: text('name').notNull(),
  // What buyers pay for delivery, added to every storefront order by the database.
  deliveryInside: integer('delivery_inside').notNull().default(70),
  deliveryOutside: integer('delivery_outside').notNull().default(130),
  // A style preset from storefront/src/themes.ts.
  theme: text('theme').notNull().default('fresh'),
  // Ad pixel IDs. They are written into storefront scripts, so their format is checked by the database too.
  metaPixel: text('meta_pixel').notNull().default(''),
  tiktokPixel: text('tiktok_pixel').notNull().default(''),
  // The storefront header's links: [{ label, href }], hrefs being paths in the store or https links. Empty means: list collections.
  menu: jsonb('menu').$type<{ label: string; href: string }[]>().notNull().default([]),
  // The seller's own domain, bare and lowercase ("rinafashion.com"; www is served too). Set by owners and admins.
  // Any store may claim a domain; it serves only once verified, by a TXT record proving the claimant controls its DNS, and one store holds it then.
  // Live once the domain check in domains.ts reached the store over HTTPS; the uddokta.live address then redirects to it while primary.
  domain: text('domain'),
  domainVerifiedAt: timestamp('domain_verified_at', { withTimezone: true }),
  domainLiveAt: timestamp('domain_live_at', { withTimezone: true }),
  domainPrimary: boolean('domain_primary').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [check('stores_delivery', sql`${t.deliveryInside} between 0 and 100000 and ${t.deliveryOutside} between 0 and 100000`), check('stores_handle_format', sql`${t.handle} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`), uniqueIndex('stores_verified_domain').on(t.domain).where(sql`${t.domainVerifiedAt} is not null`), check('stores_domain_format', sql`${t.domain} ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9-]{2,63}$'`)])

export const storeMembers = pgTable('store_members', {
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: roles }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.storeId, t.userId] }),
  index('store_members_user').on(t.userId),
  check('store_members_role', sql`${t.role} in ('owner', 'admin', 'staff')`),
])

export const storeInvites = pgTable('store_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  role: text('role', { enum: roles }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  index('store_invites_store').on(t.storeId),
  check('store_invites_role', sql`${t.role} in ('owner', 'admin', 'staff')`),
])

export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  alt: text('alt').notNull().default(''),
  key: text('key').notNull().unique(),
  thumbKey: text('thumb_key').notNull().unique(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  // What the seller uploaded; files are always stored as WebP. Null when it could not be worked out for older images.
  sourceFormat: text('source_format'),
  createdAt: createdAt(),
}, (t) => [
  index('media_store_created').on(t.storeId, t.createdAt),
  unique('media_store_id').on(t.storeId, t.id),
])

// Unlisted: on sale through its direct link, but left out of store listings and search.
export const productStatuses = ['draft', 'active', 'unlisted'] as const
export type ProductOption = { name: string; values: string[] }

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: text('status', { enum: productStatuses }).notNull().default('active'),
  options: jsonb('options').$type<ProductOption[]>().notNull().default([]),
  productType: text('product_type').notNull().default(''),
  brand: text('brand').notNull().default(''),
  tags: text('tags').array().notNull().default(sql`'{}'`),
  // The product's address in the store. Blank search title or description means: use the name and description.
  handle: text('handle').notNull(),
  seoTitle: text('seo_title').notNull().default(''),
  seoDescription: text('seo_description').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [
  index('products_store_created').on(t.storeId, t.createdAt),
  unique('products_store_id').on(t.storeId, t.id),
  unique('products_store_handle').on(t.storeId, t.handle),
  check('products_status', sql`${t.status} in ('draft', 'active', 'unlisted')`),
])

// Every product has at least one variant, so price and stock always live here.
// ponytail: amounts are whole taka; multiply by 100 and move to poisha if sellers need fractions.
export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull(),
  productId: uuid('product_id').notNull(),
  options: text('options').array().notNull(),
  position: integer('position').notNull(),
  price: integer('price').notNull(),
  comparePrice: integer('compare_price'),
  sku: text('sku').notNull().default(''),
  barcode: text('barcode').notNull().default(''),
  // Warn when the total falls to this many or fewer. Null means no warning.
  lowStock: integer('low_stock'),
  // The total across warehouses, kept by a trigger. Null means stock is not tracked.
  stock: integer('stock'),
  // One of the product's own images. The deferred foreign key to product_media is in a custom migration.
  mediaId: uuid('media_id'),
}, (t) => [
  foreignKey({ name: 'product_variants_product', columns: [t.storeId, t.productId], foreignColumns: [products.storeId, products.id] }).onDelete('cascade'),
  unique('product_variants_store_id').on(t.storeId, t.id),
  index('product_variants_product_idx').on(t.productId, t.position),
  check('product_variants_amounts', sql`${t.price} >= 0 and ${t.comparePrice} >= 0 and ${t.stock} >= 0 and ${t.lowStock} >= 0`),
  check('product_variants_codes', sql`length(${t.sku}) <= 100 and length(${t.barcode}) <= 100`),
])

// Apart from variants so row-level security can hide buying prices from staff.
export const productVariantCosts = pgTable('product_variant_costs', {
  variantId: uuid('variant_id').primaryKey(),
  storeId: uuid('store_id').notNull(),
  cost: integer('cost').notNull(),
}, (t) => [
  foreignKey({ name: 'product_variant_costs_variant', columns: [t.storeId, t.variantId], foreignColumns: [productVariants.storeId, productVariants.id] }).onDelete('cascade'),
  check('product_variant_costs_amount', sql`${t.cost} >= 0`),
])

// The foreign key to media is in the security migration: it must be deferred, which Drizzle cannot express.
export const productMedia = pgTable('product_media', {
  storeId: uuid('store_id').notNull(),
  productId: uuid('product_id').notNull(),
  mediaId: uuid('media_id').notNull(),
  position: integer('position').notNull(),
}, (t) => [
  primaryKey({ columns: [t.productId, t.mediaId] }),
  foreignKey({ name: 'product_media_product', columns: [t.storeId, t.productId], foreignColumns: [products.storeId, products.id] }).onDelete('cascade'),
  index('product_media_media').on(t.storeId, t.mediaId),
])

// Sellers choose a collection's products by hand. The image's foreign key is in the security migration: it must be deferred.
export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  handle: text('handle').notNull(),
  seoTitle: text('seo_title').notNull().default(''),
  seoDescription: text('seo_description').notNull().default(''),
  mediaId: uuid('media_id'),
  createdAt: createdAt(),
}, (t) => [
  index('collections_store_created').on(t.storeId, t.createdAt),
  unique('collections_store_id').on(t.storeId, t.id),
  unique('collections_store_handle').on(t.storeId, t.handle),
])

export const collectionProducts = pgTable('collection_products', {
  storeId: uuid('store_id').notNull(),
  collectionId: uuid('collection_id').notNull(),
  productId: uuid('product_id').notNull(),
  position: integer('position').notNull(),
}, (t) => [
  primaryKey({ columns: [t.collectionId, t.productId] }),
  foreignKey({ name: 'collection_products_collection', columns: [t.storeId, t.collectionId], foreignColumns: [collections.storeId, collections.id] }).onDelete('cascade'),
  foreignKey({ name: 'collection_products_product', columns: [t.storeId, t.productId], foreignColumns: [products.storeId, products.id] }).onDelete('cascade'),
  index('collection_products_product_idx').on(t.storeId, t.productId),
])

// Places a store keeps stock. Every store has at least one, made with the store.
export const warehouses = pgTable('warehouses', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  address: text('address').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [
  unique('warehouses_store_name').on(t.storeId, t.name),
  unique('warehouses_store_id').on(t.storeId, t.id),
])

// A variant with no rows here is not tracked. A trigger keeps product_variants.stock equal to the total, so never write that column.
export const warehouseStock = pgTable('warehouse_stock', {
  storeId: uuid('store_id').notNull(),
  warehouseId: uuid('warehouse_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  quantity: integer('quantity').notNull(),
}, (t) => [
  primaryKey({ columns: [t.warehouseId, t.variantId] }),
  foreignKey({ name: 'warehouse_stock_warehouse', columns: [t.storeId, t.warehouseId], foreignColumns: [warehouses.storeId, warehouses.id] }).onDelete('cascade'),
  foreignKey({ name: 'warehouse_stock_variant', columns: [t.storeId, t.variantId], foreignColumns: [productVariants.storeId, productVariants.id] }).onDelete('cascade'),
  index('warehouse_stock_variant_idx').on(t.variantId),
  check('warehouse_stock_quantity', sql`${t.quantity} >= 0`),
])

// Landing pages. Content is versioned JSON (see storefront/src/schema.ts); sellers edit the draft and publishing copies it.
// The revision goes up on every save, so two people editing one page cannot silently overwrite each other.
export const pages = pgTable('pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  handle: text('handle').notNull(),
  seoTitle: text('seo_title').notNull().default(''),
  seoDescription: text('seo_description').notNull().default(''),
  draft: jsonb('draft').notNull(),
  published: jsonb('published'),
  publishedMeta: jsonb('published_meta').$type<{ title: string; handle: string; seoTitle: string; seoDescription: string }>(),
  revision: integer('revision').notNull().default(1),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [
  index('pages_store_updated').on(t.storeId, t.updatedAt),
  unique('pages_store_id').on(t.storeId, t.id),
  unique('pages_store_handle').on(t.storeId, t.handle),
  uniqueIndex('pages_store_published_handle').on(t.storeId, sql`(${t.publishedMeta}->>'handle')`).where(sql`${t.published} is not null`),
])

// Images used by a page's draft or published version. The deferred foreign key to media, which blocks deleting them, is in the security migration.
export const pageMedia = pgTable('page_media', {
  storeId: uuid('store_id').notNull(),
  pageId: uuid('page_id').notNull(),
  mediaId: uuid('media_id').notNull(),
}, (t) => [
  primaryKey({ columns: [t.pageId, t.mediaId] }),
  foreignKey({ name: 'page_media_page', columns: [t.storeId, t.pageId], foreignColumns: [pages.storeId, pages.id] }).onDelete('cascade'),
  index('page_media_media').on(t.storeId, t.mediaId),
])

export const orderStatuses = orderStatusValues
export const deliveryAreas = ['inside', 'outside'] as const

// Amounts are worked out by the database when the order is placed (see place_order), never sent by the buyer.
// The foreign keys to pages, warehouses and variants are in the security migration: they set only their own column to null.
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  status: text('status', { enum: orderStatuses }).notNull().default('new'),
  customerName: text('customer_name').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  area: text('area', { enum: deliveryAreas }).notNull(),
  subtotal: integer('subtotal').notNull(),
  deliveryCharge: integer('delivery_charge').notNull(),
  discount: integer('discount').notNull().default(0),
  discountCode: text('discount_code').notNull().default(''),
  total: integer('total').notNull(),
  source: text('source').notNull(),
  pageId: uuid('page_id'),
  warehouseId: uuid('warehouse_id'),
  note: text('note').notNull().default(''),
  tags: text('tags').array().notNull().default(sql`'{}'`),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('orders_store_number').on(t.storeId, t.number),
  unique('orders_store_id').on(t.storeId, t.id),
  index('orders_store_created').on(t.storeId, t.createdAt),
  index('orders_store_phone').on(t.storeId, t.phone),
  check('orders_status', sql`${t.status} in ('new', 'hold', 'confirmed', 'packed', 'courier', 'delivered', 'returned', 'cancelled')`),
  check('orders_area', sql`${t.area} in ('inside', 'outside')`),
  check('orders_tags', sql`cardinality(${t.tags}) <= 10`),
  check('orders_amounts', sql`${t.subtotal} >= 0 and ${t.deliveryCharge} >= 0 and ${t.discount} >= 0 and ${t.discount} <= ${t.subtotal} and ${t.total} = ${t.subtotal} + ${t.deliveryCharge} - ${t.discount}`),
])

// Name, option and price are copied at the time of sale, so editing the product later never changes an old order.
export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull(),
  orderId: uuid('order_id').notNull(),
  variantId: uuid('variant_id'),
  productName: text('product_name').notNull(),
  variantLabel: text('variant_label').notNull(),
  price: integer('price').notNull(),
  quantity: integer('quantity').notNull(),
  // True when the sale took stock from the order's warehouse, so cancelling or a return puts exactly that back.
  stockTaken: boolean('stock_taken').notNull().default(false),
}, (t) => [
  foreignKey({ name: 'order_items_order', columns: [t.storeId, t.orderId], foreignColumns: [orders.storeId, orders.id] }).onDelete('cascade'),
  index('order_items_order_idx').on(t.orderId),
  check('order_items_amounts', sql`${t.price} >= 0 and ${t.quantity} > 0`),
])

// Numbers a store refuses storefront orders from. Typed-in orders are still allowed: the team decided to take them.
export const blockedPhones = pgTable('blocked_phones', {
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  reason: text('reason').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.storeId, t.phone] }),
  check('blocked_phones_lengths', sql`length(${t.phone}) between 1 and 20 and length(${t.reason}) <= 200`),
])

// What a buyer typed into an order form without finishing, saved once the phone number is valid, so the team can call.
// One row per number per store; deleted after 90 days.
export const checkoutDrafts = pgTable('checkout_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  name: text('name').notNull().default(''),
  address: text('address').notNull().default(''),
  productName: text('product_name').notNull().default(''),
  pageId: uuid('page_id'),
  // open: not ordered yet; ordered: an order followed; dismissed: the team dealt with it.
  status: text('status').notNull().default('open'),
  // When the team was told about this draft; set once it has sat open for a while (see notify_stale_drafts).
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('checkout_drafts_store_phone').on(t.storeId, t.phone),
  index('checkout_drafts_store_updated').on(t.storeId, t.updatedAt),
  check('checkout_drafts_status', sql`${t.status} in ('open', 'ordered', 'dismissed')`),
  check('checkout_drafts_lengths', sql`length(${t.phone}) <= 20 and length(${t.name}) <= 100 and length(${t.address}) <= 500 and length(${t.productName}) <= 300`),
])

export const callOutcomes = ['ordered', 'later', 'no_answer', 'not_interested'] as const

// The team's calls to past buyers. A buyer called recently drops off the repeat-sales list until it is due again.
export const customerCalls = pgTable('customer_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  outcome: text('outcome', { enum: callOutcomes }).notNull(),
  note: text('note').notNull().default(''),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  index('customer_calls_store_phone').on(t.storeId, t.phone, t.createdAt),
  check('customer_calls_outcome', sql`${t.outcome} in ('ordered', 'later', 'no_answer', 'not_interested')`),
  check('customer_calls_note', sql`length(${t.note}) <= 1000`),
])

// The buying price of each sale, copied when the order is placed so later price changes never rewrite old profit.
// Apart from order_items so row-level security can hide it from staff, like product_variant_costs.
export const orderItemCosts = pgTable('order_item_costs', {
  orderItemId: uuid('order_item_id').primaryKey().references(() => orderItems.id, { onDelete: 'cascade' }),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  cost: integer('cost').notNull(),
}, (t) => [check('order_item_costs_amount', sql`${t.cost} >= 0`)])

export const couriers = ['steadfast'] as const

// A store's courier login, encrypted with COURIER_KEY (see secrets.ts). The API never sends it back to the dashboard.
// Members can read the row so staff can book parcels; only owners and admins can change it (security migration).
export const courierAccounts = pgTable('courier_accounts', {
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  courier: text('courier', { enum: couriers }).notNull(),
  credentials: text('credentials').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.storeId, t.courier] }), check('courier_accounts_courier', sql`${t.courier} in ('steadfast')`)])

// The parcel booked for an order. One per order: a returned order that is sent again gets a new order.
export const shipments = pgTable('shipments', {
  orderId: uuid('order_id').primaryKey(),
  storeId: uuid('store_id').notNull(),
  courier: text('courier', { enum: couriers }).notNull(),
  consignmentId: text('consignment_id').notNull(),
  trackingCode: text('tracking_code').notNull().default(''),
  courierStatus: text('courier_status').notNull().default(''),
  createdAt: createdAt(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'shipments_order', columns: [t.storeId, t.orderId], foreignColumns: [orders.storeId, orders.id] }).onDelete('cascade'),
])

export const discountKinds = ['percent', 'amount'] as const

// Coupon codes buyers type at checkout. place_order checks and applies them; codes are stored in capitals.
export const discounts = pgTable('discounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  kind: text('kind', { enum: discountKinds }).notNull(),
  value: integer('value').notNull(),
  minSubtotal: integer('min_subtotal').notNull().default(0),
  maxUses: integer('max_uses'),
  uses: integer('uses').notNull().default(0),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [
  unique('discounts_store_code').on(t.storeId, t.code),
  check('discounts_kind', sql`${t.kind} in ('percent', 'amount')`),
  check('discounts_code', sql`${t.code} ~ '^[A-Z0-9]{2,30}$'`),
  check('discounts_value', sql`${t.value} > 0 and (${t.kind} = 'amount' or ${t.value} <= 100) and ${t.minSubtotal} >= 0 and (${t.maxUses} is null or ${t.maxUses} > 0) and ${t.uses} >= 0`),
])

// Opaque checkout receipts also hold the idempotency result. Public reads expose only number and total.
export const checkoutReceipts = pgTable('checkout_receipts', {
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  token: uuid('token').notNull(),
  fingerprint: text('fingerprint').notNull(),
  number: integer('number').notNull(),
  total: integer('total').notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.token] })])

// Personal saved order filters sync between devices and remain tenant-isolated.
export const orderViews = pgTable('order_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  filters: jsonb('filters').$type<OrderFilters>().notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('order_views_name').on(t.storeId, t.userId, sql`lower(${t.name})`),
  check('order_views_name_length', sql`char_length(btrim(${t.name})) between 1 and 80`),
])

// Who did what to an order, written by database triggers so no change can skip it. user_id is empty for the buyer or the system.
// The name is copied at the time, so the log still reads right after someone leaves the team.
export const orderEventKinds = ['placed', 'status', 'edited', 'contact', 'note', 'tags', 'shipped', 'comment'] as const
export const orderEvents = pgTable('order_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull(),
  orderId: uuid('order_id').notNull(),
  userId: uuid('user_id'),
  userName: text('user_name').notNull().default(''),
  kind: text('kind', { enum: orderEventKinds }).notNull(),
  data: jsonb('data').notNull().default({}),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ name: 'order_events_order', columns: [t.storeId, t.orderId], foreignColumns: [orders.storeId, orders.id] }).onDelete('cascade'),
  index('order_events_order_idx').on(t.orderId, t.createdAt),
  check('order_events_kind', sql`${t.kind} in ('placed', 'status', 'edited', 'contact', 'note', 'tags', 'shipped', 'comment')`),
  check('order_events_comment', sql`${t.kind} <> 'comment' or length(${t.data}->>'text') between 1 and 2000`),
])

// What the team hears about, one row per member, written only by database triggers (see the notifications migrations),
// so storefront orders, courier tracking and the team are all covered. Nobody is told about their own action.
// data is a snapshot taken at the time (order number, buyer's name, product), so it reads the same later. Kept 90 days.
export const notificationKinds = ['order_new', 'checkout_draft', 'order_delivered', 'order_returned', 'low_stock', 'member_joined'] as const
export type NotificationKind = (typeof notificationKinds)[number]
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: notificationKinds }).notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  readAt: timestamp('read_at', { withTimezone: true }),
}, (t) => [
  index('notifications_user_store_created').on(t.userId, t.storeId, t.createdAt),
  index('notifications_store_created').on(t.storeId, t.createdAt),
  index('notifications_unread').on(t.userId, t.storeId).where(sql`${t.readAt} is null`),
  check('notifications_kind', sql`${t.kind} in ('order_new', 'checkout_draft', 'order_delivered', 'order_returned', 'low_stock', 'member_joined')`),
])

// Each member's own choices per store. No row means the default from notification_default() in the database.
export const notificationSettings = pgTable('notification_settings', {
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: notificationKinds }).notNull(),
  enabled: boolean('enabled').notNull(),
}, (t) => [
  primaryKey({ columns: [t.storeId, t.userId, t.kind] }),
  check('notification_settings_kind', sql`${t.kind} in ('order_new', 'checkout_draft', 'order_delivered', 'order_returned', 'low_stock', 'member_joined')`),
])
