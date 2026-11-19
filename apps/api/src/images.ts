import sharp from 'sharp'
import { fail } from './http.ts'

// Image processing on its own, with no route or app imports, so the console can use it too (media.ts imports the
// whole API app, which the console must not load).

// SVG is rasterised to WebP like everything else, so no SVG (and nothing it could script) is ever served.
const allowedFormats = ['jpeg', 'png', 'webp', 'avif', 'svg']

// Decoding here rejects anything that is not really an image, whatever its name or type claims.
// Re-encoding drops metadata such as a phone's GPS location.
export async function processImage(input: Buffer) {
  try {
    const image = sharp(input)
    const { format } = await image.metadata()
    if (!format || !allowedFormats.includes(format)) throw fail(415, 'fileNotImage')
    // Vector icons are drawn large enough to stay sharp, then scaled down like any other image.
    const load = () => (format === 'svg' ? sharp(input, { density: 600 }) : sharp(input))
    const full = await load().rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
    const thumb = await load().rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
    return { full: full.data, width: full.info.width, height: full.info.height, thumb, sourceFormat: format }
  } catch (err) {
    if (err instanceof Error && err.name === 'HTTPException') throw err
    throw fail(415, 'fileNotImage')
  }
}

