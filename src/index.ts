import { retrieve } from './archive'
import { cacheKey, isKnownMiss, readCached, writeCached, writeMiss } from './cache'
import { decodeHtml, processHtml } from './html'
import { route, type Route } from './routing'
import type { Env } from './types'

const DEFAULT_ICO_TIMESTAMP = '20010720041445'
/** Longer URLs are rejected so they cannot be used to fill KV with junk. */
const MAX_PATH_LENGTH = 2048
const PAGE_MAX_AGE = 86_400
const ASSET_MAX_AGE = 14_400

/** 1x1 transparent GIF, served in place of missing images so layouts keep their shape. */
const PLACEHOLDER_GIF = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (c) => c.charCodeAt(0),
)

const EXTENSION_TYPES: Record<string, string> = {
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  ico: 'image/x-icon',
  css: 'text/css',
  js: 'application/javascript',
  pdf: 'application/pdf',
  zip: 'application/zip',
  swf: 'application/x-shockwave-flash',
  html: 'text/html',
  htm: 'text/html',
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return text('405 Method Not Allowed', 405, { Allow: 'GET, HEAD' })
    }

    const url = new URL(request.url)
    if (url.pathname.length + url.search.length > MAX_PATH_LENGTH) return text('414 URI Too Long', 414)
    const target = route(url)
    if (target.kind === 'redirect') return Response.redirect(target.location, 302)

    try {
      return await serveArchived(url, target, env, ctx)
    } catch (err) {
      console.error('archive error:', url.pathname, err)
      return text('502 Bad Gateway', 502)
    }
  },
} satisfies ExportedHandler<Env>

async function serveArchived(
  url: URL,
  target: Exclude<Route, { kind: 'redirect' }>,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const isPage = target.kind === 'page'
  const pathAndQuery = url.pathname + url.search
  const key = await cacheKey(isPage ? 'page' : 'asset', target.origin, pathAndQuery)

  const cached = await readCached(env, key)
  if (cached.value) {
    return respond(cached.value, cached.metadata?.contentType ?? guessType(url.pathname), isPage)
  }
  if (await isKnownMiss(env, key)) return notFound(url.pathname, isPage)

  // Pages and assets use the latest snapshot; only the favicon is pinned to an early one.
  const timestamp = target.kind === 'asset' && target.favicon ? (env.ICO_TIMESTAMP ?? DEFAULT_ICO_TIMESTAMP) : undefined

  const archived = await retrieve(target.origin + pathAndQuery, timestamp)
  if (!archived) {
    ctx.waitUntil(writeMiss(env, key))
    return notFound(url.pathname, isPage)
  }

  const contentType = archived.contentType ?? guessType(url.pathname)
  let body = archived.body
  let servedType = contentType
  if (/^text\/html/i.test(contentType)) {
    body = new TextEncoder().encode(processHtml(decodeHtml(archived.body, contentType)))
    servedType = 'text/html;charset=utf-8'
  }

  ctx.waitUntil(writeCached(env, key, body, servedType))
  return respond(body, servedType, isPage)
}

function respond(body: BodyInit, contentType: string, isPage: boolean): Response {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${isPage ? PAGE_MAX_AGE : ASSET_MAX_AGE}`,
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function notFound(pathname: string, isPage: boolean): Response {
  if (!isPage && /\.(gif|jpe?g|png|ico)$/i.test(pathname)) {
    return new Response(PLACEHOLDER_GIF, {
      status: 404,
      headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'public, max-age=300' },
    })
  }
  return text('404 Not Found', 404)
}

function text(body: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Access-Control-Allow-Origin': '*', ...extra },
  })
}

function guessType(pathname: string): string {
  const ext = pathname.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_TYPES[ext] ?? 'application/octet-stream'
}
