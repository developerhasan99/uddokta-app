import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Tx } from './db.ts'
import { warehouses, warehouseStock } from './schema.ts'
import { fail } from './app.ts'

export async function firstWarehouseId(t: Tx, storeId: string) {
  const [first] = await t.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.storeId, storeId)).orderBy(asc(warehouses.createdAt), asc(warehouses.id)).limit(1)
  return first.id
}

export async function checkWarehouses(t: Tx, storeId: string, ids: string[]) {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return
  const found = await t.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.storeId, storeId), inArray(warehouses.id, wanted)))
  if (found.length !== wanted.length) throw fail(400, 'invalidRequest')
}

// Null removes the count, and a variant counted nowhere is not tracked.
export async function setStock(t: Tx, storeId: string, warehouseId: string, variantId: string, quantity: number | null) {
  if (quantity === null) {
    await t.delete(warehouseStock).where(and(eq(warehouseStock.warehouseId, warehouseId), eq(warehouseStock.variantId, variantId)))
  } else {
    await t.insert(warehouseStock).values({ storeId, warehouseId, variantId, quantity }).onConflictDoUpdate({ target: [warehouseStock.warehouseId, warehouseStock.variantId], set: { quantity } })
  }
}

export async function stockByVariant(t: Tx, variantIds: string[]) {
  const result = new Map<string, Record<string, number>>()
  if (variantIds.length === 0) return result
  const rows = await t.select().from(warehouseStock).where(inArray(warehouseStock.variantId, variantIds))
  for (const row of rows) result.set(row.variantId, { ...result.get(row.variantId), [row.warehouseId]: row.quantity })
  return result
}
