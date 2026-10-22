import { clarity, mailchimp } from './snippets'

const ADS_AND_FOOTERS =
  /<!-- ini pub -->[\s\S]*?<!-- end pub -->|<!-- ini pub minibanner 120x60 -->[\s\S]*?<!-- end pub minibanner 120x60 -->|<!footer!>[\s\S]*?<!-end footer>|<!-- ini mailing-list -->[\s\S]*?<!-- end mailing-list -->/g

const SEARCH_FORM = /<form action="\/pesquisa\/" method="post" name="pesquisa">/g
const GOOGLE_SEARCH_FORM =
  '<form action="https://www.google.pt/search" method="get" name="pesquisa"><input type="hidden" name="sitesearch" value="https://www.digito.pt">'

/**
 * Rewrites an archived digito.pt page: strips ads/footers, swaps the search
 * form for Google site search, upgrades asset links to https and injects the
 * analytics snippets. Input must already be a decoded (UTF-16) string.
 */
export function processHtml(html: string): string {
  return html
    .replace(/(<meta[^>]*?charset\s*=\s*["']?)[\w-]+/gi, '$1utf-8')
    .replace(/<head(\s[^>]*)?>/i, (head) => head + clarity)
    .replace(/http:\/\/dl\.digito\.pt/g, 'https://dl.digito.pt')
    .replace(ADS_AND_FOOTERS, '')
    .replace(SEARCH_FORM, GOOGLE_SEARCH_FORM)
    .replace(/name="query"/g, 'name="q"')
    .replace(/<\/body>/i, mailchimp + '</body>')
}

/** Extracts `charset=` from a Content-Type header value. */
export function charsetFromContentType(contentType: string | null): string | null {
  return contentType?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]?.toLowerCase() ?? null
}

/** Sniffs a `<meta charset>` declaration from the first KiB of a document. */
export function charsetFromMeta(bytes: Uint8Array): string | null {
  const head = latin1(bytes.subarray(0, 1024))
  return head.match(/<meta[^>]*?charset\s*=\s*["']?([\w-]+)/i)?.[1]?.toLowerCase() ?? null
}

/** Decodes bytes using the response charset, then the meta charset, then windows-1252. */
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  const charset = charsetFromContentType(contentType) ?? charsetFromMeta(bytes) ?? 'windows-1252'
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return latin1(bytes)
  }
}

/** Byte-per-char decode, chunked to stay clear of the argument-count limit. */
export function latin1(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return out
}
