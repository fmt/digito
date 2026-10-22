import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSnapshot, findSnapshot, retrieve, toRawSnapshotUrl } from '../src/archive'
import { route } from '../src/routing'

afterEach(() => vi.restoreAllMocks())

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const snapshot = (url: string) => ({ archived_snapshots: { closest: { available: true, url } } })

describe('toRawSnapshotUrl', () => {
  it('adds id_ and forces https', () => {
    expect(toRawSnapshotUrl('http://web.archive.org/web/20031231012345/http://www.digito.pt/a.html')).toBe(
      'https://web.archive.org/web/20031231012345id_/http://www.digito.pt/a.html',
    )
  })

  it('is idempotent', () => {
    const raw = 'https://web.archive.org/web/20031231012345id_/http://www.digito.pt/'
    expect(toRawSnapshotUrl(raw)).toBe(raw)
  })
})

describe('findSnapshot', () => {
  it('passes url and timestamp, returns the closest snapshot url', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(snapshot('http://web.archive.org/web/2003/x')))
    expect(await findSnapshot('http://www.digito.pt/a?b=1', '20031231')).toBe('http://web.archive.org/web/2003/x')
    const called = new URL(String(spy.mock.calls[0]![0]))
    expect(called.searchParams.get('url')).toBe('http://www.digito.pt/a?b=1')
    expect(called.searchParams.get('timestamp')).toBe('20031231')
  })

  it('omits timestamp when none is given', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ archived_snapshots: {} }))
    expect(await findSnapshot('http://dl.digito.pt/a.gif')).toBeNull()
    expect(String(spy.mock.calls[0]![0])).not.toContain('timestamp')
  })

  it('throws when the availability API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    await expect(findSnapshot('http://www.digito.pt/')).rejects.toThrow('503')
  })
})

describe('fetchSnapshot / retrieve', () => {
  it('returns bytes and content type, requesting the raw snapshot', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/gif' } }))
    const file = await fetchSnapshot('http://web.archive.org/web/2003/http://dl.digito.pt/a.gif')
    expect([...file!.body]).toEqual([1, 2, 3])
    expect(file!.contentType).toBe('image/gif')
    expect(String(spy.mock.calls[0]![0])).toContain('/web/2003id_/')
  })

  it('returns null on 404 and throws on other errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 404 }))
    expect(await fetchSnapshot('http://web.archive.org/web/2003/x')).toBeNull()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 500 }))
    await expect(fetchSnapshot('http://web.archive.org/web/2003/x')).rejects.toThrow('500')
  })

  it('retrieve returns null without downloading when nothing is archived', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ archived_snapshots: {} }))
    expect(await retrieve('http://www.digito.pt/none')).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('route', () => {
  const r = (u: string) => route(new URL(u))

  it('redirects cursos.* to evolui', () => {
    expect(r('https://cursos.digito.pt/x')).toEqual({ kind: 'redirect', location: 'https://www.evolui.com/' })
  })

  it('serves dl.* as assets and www.* as pages', () => {
    expect(r('https://dl.digito.pt/a.gif')).toMatchObject({ kind: 'asset', origin: 'http://dl.digito.pt', favicon: false })
    expect(r('https://www.digito.pt/a.html')).toEqual({ kind: 'page', origin: 'http://www.digito.pt' })
  })

  it('treats /favicon.ico on any host as the www favicon, but not paths merely containing "ico"', () => {
    expect(r('https://www.digito.pt/favicon.ico')).toMatchObject({ kind: 'asset', origin: 'http://www.digito.pt', favicon: true })
    expect(r('https://www.digito.pt/musica/ico.html').kind).toBe('page')
  })

  it('defaults unknown hosts (workers.dev staging) to pages', () => {
    expect(r('https://stg-digito.x.workers.dev/').kind).toBe('page')
  })
})
