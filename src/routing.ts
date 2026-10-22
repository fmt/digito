export type Route =
  | { kind: 'redirect'; location: string }
  | { kind: 'page'; origin: string }
  | { kind: 'asset'; origin: string; favicon: boolean }

export const PAGES_ORIGIN = 'http://www.digito.pt'
export const ASSETS_ORIGIN = 'http://dl.digito.pt'
export const COURSES_REDIRECT = 'https://www.evolui.com/'

/** Decides what to do with a request based on its host and path. */
export function route(url: URL): Route {
  const host = url.hostname
  if (host.startsWith('cursos.')) return { kind: 'redirect', location: COURSES_REDIRECT }
  if (url.pathname === '/favicon.ico') return { kind: 'asset', origin: PAGES_ORIGIN, favicon: true }
  if (host.startsWith('dl.')) return { kind: 'asset', origin: ASSETS_ORIGIN, favicon: false }
  return { kind: 'page', origin: PAGES_ORIGIN }
}
