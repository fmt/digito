import { describe, expect, it } from 'vitest'
import { charsetFromContentType, charsetFromMeta, decodeHtml, latin1, processHtml } from '../src/html'

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))

describe('processHtml', () => {
  it('injects clarity after <head> (with or without attributes)', () => {
    expect(processHtml('<html><head><title>x</title></head></html>')).toMatch(/<head>\s*<script[^>]*>[\s\S]*clarity\.ms/)
    expect(processHtml('<HEAD lang="pt"><title>x</title>')).toMatch(/<HEAD lang="pt">\s*<script/)
  })

  it('injects mailchimp once, before </body>', () => {
    const out = processHtml('<body>hi</BODY>')
    expect(out.match(/id="mcjs"/g)).toHaveLength(1)
    expect(out.endsWith('</body>')).toBe(true)
  })

  it('upgrades dl.digito.pt links to https', () => {
    expect(processHtml('<img src="http://dl.digito.pt/a.gif">')).toContain('src="https://dl.digito.pt/a.gif"')
  })

  it('strips ads, footer and mailing-list blocks', () => {
    const out = processHtml(
      'A<!-- ini pub -->AD<!-- end pub -->B<!-- ini mailing-list -->ML<!-- end mailing-list -->C<!footer!>F<!-end footer>D',
    )
    expect(out).toContain('ABCD')
    expect(out).not.toMatch(/AD<|ML|>F</)
  })

  it('replaces the search form with Google site search', () => {
    const out = processHtml('<form action="/pesquisa/" method="post" name="pesquisa"><input name="query">')
    expect(out).toContain('action="https://www.google.pt/search" method="get"')
    expect(out).toContain('name="sitesearch" value="https://www.digito.pt"')
    expect(out).toContain('name="q"')
    expect(out).not.toContain('name="query"')
  })

  it('rewrites a legacy meta charset to utf-8', () => {
    expect(processHtml('<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">')).toContain('charset=utf-8')
    expect(processHtml('<meta charset="windows-1252">')).toContain('charset="utf-8')
  })
})

describe('charset handling', () => {
  it('reads the charset from Content-Type', () => {
    expect(charsetFromContentType('text/html; charset=ISO-8859-1')).toBe('iso-8859-1')
    expect(charsetFromContentType('text/html')).toBeNull()
    expect(charsetFromContentType(null)).toBeNull()
  })

  it('sniffs the charset from <meta>', () => {
    expect(charsetFromMeta(bytes('<meta http-equiv="x" content="text/html; charset=iso-8859-1">'))).toBe('iso-8859-1')
    expect(charsetFromMeta(bytes('<p>none</p>'))).toBeNull()
  })

  it('decodes latin-1 bytes to proper text', () => {
    const page = bytes('<p>informa\xE7\xE3o</p>')
    expect(decodeHtml(page, 'text/html; charset=iso-8859-1')).toBe('<p>informação</p>')
    expect(decodeHtml(page, 'text/html')).toBe('<p>informação</p>') // windows-1252 default
  })

  it('falls back to latin-1 for unknown charsets', () => {
    expect(decodeHtml(bytes('caf\xE9'), 'text/html; charset=nope-9000')).toBe('café')
  })

  it('latin1 handles inputs far above the spread-argument limit', () => {
    expect(latin1(new Uint8Array(1_000_000).fill(65))).toHaveLength(1_000_000)
  })
})
