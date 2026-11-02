import { sql } from 'drizzle-orm'
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

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
  createdAt: createdAt(),
}, (t) => [check('stores_handle_format', sql`${t.handle} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)])

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
  // The total across warehouses, kept by a trigger. Null means stock is not tracked.
  stock: integer('stock'),
  // One of the product's own images. The deferred foreign key to product_media is in a custom migration.
  mediaId: uuid('media_id'),
}, (t) => [
  foreignKey({ name: 'product_variants_product', columns: [t.storeId, t.productId], foreignColumns: [products.storeId, products.id] }).onDelete('cascade'),
  unique('product_variants_store_id').on(t.storeId, t.id),
  index('product_variants_product_idx').on(t.productId, t.position),
  check('product_variants_amounts', sql`${t.price} >= 0 and ${t.comparePrice} >= 0 and ${t.stock} >= 0`),
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
