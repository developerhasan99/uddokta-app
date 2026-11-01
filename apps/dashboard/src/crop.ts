// Crop maths in image pixels, kept apart from the UI so it can be tested.
export type Rect = { x: number; y: number; w: number; h: number }
export type Corner = 'nw' | 'ne' | 'sw' | 'se'

const minSize = 20
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high))

// The largest centred rectangle with this ratio (width / height); the whole image with no ratio.
export function centered(ratio: number | null, width: number, height: number): Rect {
  if (!ratio) return { x: 0, y: 0, w: width, h: height }
  const w = Math.min(width, height * ratio)
  const h = w / ratio
  return { x: (width - w) / 2, y: (height - h) / 2, w, h }
}

export function moved(rect: Rect, dx: number, dy: number, width: number, height: number): Rect {
  return { ...rect, x: clamp(rect.x + dx, 0, width - rect.w), y: clamp(rect.y + dy, 0, height - rect.h) }
}

// The corner opposite the dragged one stays put.
export function resized(rect: Rect, corner: Corner, dx: number, dy: number, ratio: number | null, width: number, height: number): Rect {
  const west = corner.includes('w')
  const north = corner.includes('n')
  const anchorX = west ? rect.x + rect.w : rect.x
  const anchorY = north ? rect.y + rect.h : rect.y
  const maxW = west ? anchorX : width - anchorX
  const maxH = north ? anchorY : height - anchorY
  let w = clamp(rect.w + (west ? -dx : dx), minSize, maxW)
  let h = clamp(rect.h + (north ? -dy : dy), minSize, maxH)
  if (ratio) {
    h = w / ratio
    if (h > maxH) {
      h = maxH
      w = h * ratio
    }
  }
  return { x: west ? anchorX - w : anchorX, y: north ? anchorY - h : anchorY, w, h }
}

export function toPixels(rect: Rect, width: number, height: number) {
  const x = Math.round(rect.x)
  const y = Math.round(rect.y)
  return { x, y, width: Math.min(Math.round(rect.w), width - x), height: Math.min(Math.round(rect.h), height - y) }
}
