import type { CachedMetadata, Env } from './types'

/** Bump to invalidate every cached entry (e.g. after changing processHtml). */
export const CACHE_VERSION = 'v2'
export const MISS_TTL_SECONDS = 3600
const MAX_KEY_BYTES = 400
const MAX_VALUE_BYTES = 25 * 1024 * 1024

/** Namespaced KV key; very long paths are hashed to stay under KV's 512 byte key limit. */
export async function cacheKey(kind: 'page' | 'asset', host: string, pathAndQuery: string): Promise<string> {
  const key = `${CACHE_VERSION}:${kind}:${host}:${pathAndQuery}`
  if (new TextEncoder().encode(key).length <= MAX_KEY_BYTES) return key
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pathAndQuery))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${CACHE_VERSION}:${kind}:${host}:sha256:${hex}`
}

export const missKey = (key: string) => `miss:${key}`

export function readCached(env: Env, key: string) {
  return env.ARC.getWithMetadata<CachedMetadata>(key, 'stream')
}

export function writeCached(env: Env, key: string, body: Uint8Array, contentType: string): Promise<void> {
  if (body.byteLength > MAX_VALUE_BYTES) return Promise.resolve()
  return env.ARC.put(key, body, { metadata: { contentType } satisfies CachedMetadata })
}

export const isKnownMiss = async (env: Env, key: string) => (await env.ARC.get(missKey(key))) !== null

export const writeMiss = (env: Env, key: string) =>
  env.ARC.put(missKey(key), '1', { expirationTtl: MISS_TTL_SECONDS })
