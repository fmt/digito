import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { cacheKey, missKey } from '../src/cache'

const AVAILABLE = (url: string) => new Response(JSON.stringify({ archived_snapshots: { closest: { available: true, url } } }))
const NONE = () => new Response(JSON.stringify({ archived_snapshots: {} }))

const latin1Bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))

async function call(url: string, init?: RequestInit) {
  const ctx = createExecutionContext()
  const res = await worker.fetch(new Request(url, init), env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

/** Routes the two archive.org endpoints to canned responses. */
function mockArchive(handlers: { available: () => Response; snapshot?: () => Response }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith('https://archive.org/wayback/available')) return handlers.available()
    if (url.startsWith('https://web.archive.org/')) return handlers.snapshot!()
    throw new Error('unexpected fetch ' + url)
  })
}

beforeEach(async () => {
  const { keys } = await env.ARC.list()
  await Promise.all(keys.map((k) => env.ARC.delete(k.name)))
})
afterEach(() => vi.restoreAllMocks())

describe('pages', () => {
  const page = () =>
    new Response(latin1Bytes('<html><head></head><body>informa\xE7\xE3o <!-- ini pub -->AD<!-- end pub --></body></html>'), {
      headers: { 'content-type': 'text/html; charset=ISO-8859-1' },
    })

  it('fetches from archive.org on a miss, processes, caches, and serves from KV afterwards', async () => {
    const spy = mockArchive({
      available: () => AVAILABLE('http://web.archive.org/web/20031231000000/http://www.digito.pt/a.html'),
      snapshot: page,
    })

    const first = await call('https://www.digito.pt/a.html')
    const firstBody = await first.text()
    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toBe('text/html;charset=utf-8')
    expect(firstBody).toContain('informação')
    expect(firstBody).toContain('clarity.ms')
    expect(firstBody).not.toContain('AD')
    expect(spy).toHaveBeenCalledTimes(2)

    spy.mockClear()
    const second = await call('https://www.digito.pt/a.html')
    expect(await second.text()).toBe(firstBody)
    expect(spy).not.toHaveBeenCalled()
  })

  it('looks up the latest snapshot (no timestamp) and keeps the query string', async () => {
    const spy = mockArchive({ available: NONE })
    await call('https://www.digito.pt/artigo.php?id=3')
    const lookup = new URL(String(spy.mock.calls[0]![0]))
    expect(lookup.searchParams.get('url')).toBe('http://www.digito.pt/artigo.php?id=3')
    expect(lookup.searchParams.has('timestamp')).toBe(false)
  })

  it('keeps different query strings in separate cache entries', async () => {
    mockArchive({ available: () => AVAILABLE('http://web.archive.org/web/2003/x'), snapshot: page })
    await call('https://www.digito.pt/a.php?id=1')
    const spy = mockArchive({ available: NONE })
    await call('https://www.digito.pt/a.php?id=2')
    expect(spy).toHaveBeenCalled()
  })

  it('returns 404 when not archived and negative-caches the miss', async () => {
    const spy = mockArchive({ available: NONE })
    expect((await call('https://www.digito.pt/nope.html')).status).toBe(404)
    expect(spy).toHaveBeenCalledTimes(1)

    spy.mockClear()
    expect((await call('https://www.digito.pt/nope.html')).status).toBe(404)
    expect(spy).not.toHaveBeenCalled()
    expect(await env.ARC.get(missKey(await cacheKey('page', 'http://www.digito.pt', '/nope.html')))).toBe('1')
  })

  it('does not cache archive.org failures, and answers 502', async () => {
    const spy = mockArchive({ available: () => new Response('', { status: 503 }) })
    expect((await call('https://www.digito.pt/flaky.html')).status).toBe(502)
    expect((await env.ARC.list()).keys).toHaveLength(0)

    spy.mockRestore()
    mockArchive({ available: () => AVAILABLE('http://web.archive.org/web/2003/x'), snapshot: page })
    expect((await call('https://www.digito.pt/flaky.html')).status).toBe(200)
  })

  it('serves non-HTML files found on www untouched', async () => {
    mockArchive({
      available: () => AVAILABLE('http://web.archive.org/web/2003/http://www.digito.pt/f.pdf'),
      snapshot: () => new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff]), { headers: { 'content-type': 'application/pdf' } }),
    })
    const res = await call('https://www.digito.pt/f.pdf')
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0x25, 0x50, 0x44, 0x46, 0xff])
  })
})

describe('assets', () => {
  const gif = new Uint8Array([71, 73, 70, 56, 57, 97, 200, 255])

  it('caches binary assets byte-for-byte with their content type', async () => {
    const spy = mockArchive({
      available: () => AVAILABLE('http://web.archive.org/web/2005/http://dl.digito.pt/a.gif'),
      snapshot: () => new Response(gif, { headers: { 'content-type': 'image/gif' } }),
    })
    const first = await call('https://dl.digito.pt/a.gif')
    expect([...new Uint8Array(await first.arrayBuffer())]).toEqual([...gif])
    expect(new URL(String(spy.mock.calls[0]![0])).searchParams.has('timestamp')).toBe(false)

    spy.mockClear()
    const second = await call('https://dl.digito.pt/a.gif')
    expect(second.headers.get('content-type')).toBe('image/gif')
    expect([...new Uint8Array(await second.arrayBuffer())]).toEqual([...gif])
    expect(spy).not.toHaveBeenCalled()
  })

  it('uses the favicon timestamp for /favicon.ico', async () => {
    const spy = mockArchive({ available: NONE })
    await call('https://www.digito.pt/favicon.ico')
    const lookup = new URL(String(spy.mock.calls[0]![0]))
    expect(lookup.searchParams.get('url')).toBe('http://www.digito.pt/favicon.ico')
    expect(lookup.searchParams.get('timestamp')).toBe(env.ICO_TIMESTAMP)
  })

  it('serves a placeholder gif for missing images, plain 404 otherwise', async () => {
    mockArchive({ available: NONE })
    const img = await call('https://dl.digito.pt/missing.gif')
    expect(img.status).toBe(404)
    expect(img.headers.get('content-type')).toBe('image/gif')
    expect(new TextDecoder().decode((await img.arrayBuffer()).slice(0, 3))).toBe('GIF')

    const doc = await call('https://dl.digito.pt/missing.zip')
    expect(doc.status).toBe(404)
    expect(doc.headers.get('content-type')).toContain('text/plain')
  })

  it('does not mix page and asset entries that share a path', async () => {
    mockArchive({
      available: () => AVAILABLE('http://web.archive.org/web/2003/x'),
      snapshot: () => new Response('<html><body>page</body></html>', { headers: { 'content-type': 'text/html' } }),
    })
    await call('https://www.digito.pt/same')
    const spy = mockArchive({ available: NONE })
    await call('https://dl.digito.pt/same')
    expect(spy).toHaveBeenCalled()
  })
})

describe('routing and methods', () => {
  it('redirects cursos.digito.pt without touching archive.org or KV', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const res = await call('https://cursos.digito.pt/anything')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://www.evolui.com/')
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects non-GET/HEAD methods', async () => {
    const res = await call('https://www.digito.pt/', { method: 'POST' })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
  })

  it('rejects absurdly long URLs without touching KV or archive.org', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect((await call('https://www.digito.pt/' + 'a'.repeat(3000))).status).toBe(414)
    expect(spy).not.toHaveBeenCalled()
  })

  it('hashes very long cache keys under the KV limit', async () => {
    const key = await cacheKey('page', 'http://www.digito.pt', '/' + 'a'.repeat(2000))
    expect(new TextEncoder().encode(key).length).toBeLessThan(512)
    expect(key).toContain('sha256:')
  })
})
