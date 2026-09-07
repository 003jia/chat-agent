// dsh-custom-wallpaper host half: owns the wallpaper configuration file and
// serves the local wallpaper image to the browser (a browser cannot read the
// local filesystem, so the host reads the file and streams it back).
//
// The configuration deliberately avoids the dsh settings seam: dsh-host-apiproxy
// serves a hard-coded WEB_SETTINGS_NAMESPACES list, and a third-party namespace
// answers "settings-not-exposed" even when registered. Instead this plugin
// stores its config in ~/.dsh/custom-wallpaper.json and exposes GET/POST
// /custom-wallpaper/config routes plus GET /custom-wallpaper/image?path=...
// for local images. The settings card in the browser talks to these routes.

import { readFile, writeFile, stat, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, extname, resolve } from 'node:path'

/** Wallpaper configuration file (user-owned, next to settings.yaml). */
const CONFIG_PATH = join(homedir(), '.dsh', 'custom-wallpaper.json')

/** Defaults applied when the config file is missing or partial. */
const DEFAULT_CONFIG = {
  enabled: false,
  image: '',
  scrim: 0.35,
  blur: 0,
  size: 'cover',
}

/** Image extensions the local-image route will serve. */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg', '.ico'])

/** Upper bound for a local wallpaper file (20 MiB). */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** Media type per image extension (fallback octet-stream). */
function mediaTypeOf(path) {
  switch (extname(path).toLowerCase()) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    case '.avif': return 'image/avif'
    case '.bmp': return 'image/bmp'
    case '.svg': return 'image/svg+xml'
    case '.ico': return 'image/x-icon'
    default: return 'application/octet-stream'
  }
}

/** Write a JSON response with the given status. */
function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Read the wallpaper config, merging defaults for missing fields. */
async function readConfig() {
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'))
    return { ...DEFAULT_CONFIG, ...raw }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/** Validate one config value; returns the normalized value or throws. */
function normalizeConfig(value) {
  if (typeof value !== 'object' || value === null) throw new Error('config must be an object')
  const out = { ...DEFAULT_CONFIG }
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== 'boolean') throw new Error('enabled must be a boolean')
    out.enabled = value.enabled
  }
  if (value.image !== undefined) {
    if (typeof value.image !== 'string') throw new Error('image must be a string')
    if (value.image.length > 4096) throw new Error('image is too long')
    out.image = value.image
  }
  if (value.scrim !== undefined) {
    const scrim = Number(value.scrim)
    if (!Number.isFinite(scrim) || scrim < 0 || scrim > 1) throw new Error('scrim must be between 0 and 1')
    out.scrim = scrim
  }
  if (value.blur !== undefined) {
    const blur = Number(value.blur)
    if (!Number.isFinite(blur) || blur < 0 || blur > 40) throw new Error('blur must be between 0 and 40')
    out.blur = blur
  }
  if (value.size !== undefined) {
    if (value.size !== 'cover' && value.size !== 'contain') throw new Error('size must be cover or contain')
    out.size = value.size
  }
  return out
}

/** Parse the request body as JSON (bounded). */
function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolvePromise, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > limit) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolvePromise(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

/** Handler for the /custom-wallpaper prefix routes. */
async function handleCustomWallpaper(ctx, req, res, url) {
  if (url.pathname === '/custom-wallpaper/config') {
    if (req.method === 'GET') {
      json(res, 200, { ok: true, value: await readConfig() })
      return
    }
    if (req.method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const value = normalizeConfig(body.value ?? body)
        await mkdir(join(homedir(), '.dsh'), { recursive: true })
        await writeFile(CONFIG_PATH, JSON.stringify(value, null, 2), 'utf8')
        json(res, 200, { ok: true, value })
      } catch (error) {
        json(res, 400, { ok: false, code: 'invalid-config', message: error.message })
      }
      return
    }
    json(res, 405, { ok: false, code: 'method-not-allowed', message: 'use GET or POST' })
    return
  }
  if (url.pathname === '/custom-wallpaper/image') {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, code: 'method-not-allowed', message: 'use GET' })
      return
    }
    const path = url.searchParams.get('path')
    if (!path) {
      json(res, 400, { ok: false, code: 'missing-path', message: 'path query parameter is required' })
      return
    }
    const extension = extname(path).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(extension)) {
      json(res, 400, { ok: false, code: 'unsupported-extension', message: 'unsupported image extension' })
      return
    }
    try {
      const filePath = resolve(path)
      const info = await stat(filePath)
      if (!info.isFile()) {
        json(res, 404, { ok: false, code: 'not-a-file', message: 'path is not a file' })
        return
      }
      if (info.size > MAX_IMAGE_BYTES) {
        json(res, 413, { ok: false, code: 'too-large', message: 'image exceeds 20 MiB' })
        return
      }
      const data = await readFile(filePath)
      res.writeHead(200, {
        'content-type': mediaTypeOf(filePath),
        'content-length': data.byteLength,
        'cache-control': 'private, max-age=3600',
      })
      res.end(data)
    } catch {
      json(res, 404, { ok: false, code: 'not-found', message: 'image not found' })
    }
    return
  }
  json(res, 404, { ok: false, code: 'not-found', message: 'unknown route' })
}

/** Services required by the host half (cordis waits for them before apply). */
export const inject = ['webServer']

/** Plugin entry: mount the config and image routes on the shared webserver. */
export function apply(ctx) {
  const webserver = ctx.get('webServer')
  if (webserver === undefined) return
  ctx.effect(() => webserver.register({
    kind: 'prefix',
    path: '/custom-wallpaper',
    handler: (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      handleCustomWallpaper(ctx, req, res, url).catch((error) => {
        json(res, 500, { ok: false, code: 'internal', message: error.message })
      })
    },
  }), 'custom-wallpaper: routes')
}
