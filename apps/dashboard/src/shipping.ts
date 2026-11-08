import { api } from './api'

// A delivery option from Settings › Delivery.
export type ShippingRate = { id: string; name: string; note: string; price: number; active: boolean; freeOver: number | null; freeMinQty: number | null; freeProducts: { id: string; name: string }[] }

export const loadRates = (handle: string) => api<ShippingRate[]>(`/stores/${handle}/shipping-rates`)

// For showing the charge while the team builds an order. The database works it out itself (shipping_charge) when the order is saved.
export const previewCharge = (r: ShippingRate, productIds: string[], subtotal: number, quantity: number) =>
  (r.freeOver !== null && subtotal >= r.freeOver) || (r.freeMinQty !== null && quantity >= r.freeMinQty) || r.freeProducts.some((p) => productIds.includes(p.id)) ? 0 : r.price
