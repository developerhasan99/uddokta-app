import { sql } from 'drizzle-orm'
import { bigint, check, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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
  createdAt: createdAt(),
}, (t) => [index('media_store_created').on(t.storeId, t.createdAt)])
