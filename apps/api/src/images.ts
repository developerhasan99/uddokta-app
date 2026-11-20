import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns'
import { get as httpGet, type RequestOptions } from 'node:http'
import { get as httpsGet } from 'node:https'
import { BlockList, isIP } from 'node:net'
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


// Downloads an image by its web address for product import, with the server's own network kept out of reach:
// only http(s) on the default port, every resolved address checked when the connection is made (so a name that
// later points inside cannot slip through), at most 3 redirects (each checked again), 10 MB and 20 seconds.
const maxDownloadBytes = 10 * 1024 * 1024
const blockedNets = new BlockList()
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) blockedNets.addSubnet(net, prefix, 'ipv4')
// IPv4-mapped addresses are checked against the IPv4 rules by BlockList itself; NAT64 and 6to4 are refused whole.
for (const [net, prefix] of [['::', 127], ['64:ff9b::', 96], ['100::', 64], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) blockedNets.addSubnet(net, prefix, 'ipv6')
export const isPrivateAddress = (address: string) => blockedNets.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4')

export function readImageUrl(value: unknown) {
  let url: URL
  try { url = new URL(String(value)) } catch { throw fail(400, 'invalidRequest') }
  if (typeof value !== 'string' || value.length > 2000 || !['http:', 'https:'].includes(url.protocol) || url.port || url.username || url.password) throw fail(400, 'invalidRequest')
  return url
}

// Tests loosen both checks to reach a local server; the route always uses the defaults.
export function downloadImage(url: URL, { isBlocked = isPrivateAddress, checkUrl = readImageUrl } = {}, redirects = 3): Promise<Buffer> {
  const unavailable = fail(422, 'imageUnavailable')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && isBlocked(host)) return Promise.reject(unavailable)
  const checkedLookup = ((hostname: string, options: LookupOptions, done: (...args: unknown[]) => void) => {
    dnsLookup(hostname, { ...options, all: true }, (err, found: LookupAddress[]) => {
      if (err) return done(err)
      if (found.length === 0 || found.some((a) => isBlocked(a.address))) return done(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }))
      if (options.all) done(null, found)
      else done(null, found[0].address, found[0].family)
    })
  }) as unknown as RequestOptions['lookup']
  return new Promise((resolve, reject) => {
    const get = url.protocol === 'https:' ? httpsGet : httpGet
    const req = get(url, { lookup: checkedLookup, agent: false, signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'Uddokta product import', accept: 'image/*' } }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
        res.resume()
        try { resolve(downloadImage(checkUrl(new URL(res.headers.location, url).href), { isBlocked, checkUrl }, redirects - 1)) } catch { reject(unavailable) }
        return
      }
      if (status !== 200 || Number(res.headers['content-length']) > maxDownloadBytes) { res.destroy(); return reject(status === 200 ? fail(413, 'fileTooLarge') : unavailable) }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxDownloadBytes) { res.destroy(); reject(fail(413, 'fileTooLarge')) } else chunks.push(chunk)
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', () => reject(unavailable))
    })
    req.on('error', () => reject(unavailable))
  })
}
