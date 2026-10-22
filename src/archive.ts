const AVAILABILITY_API = 'https://archive.org/wayback/available'
const TIMEOUT_MS = 15_000

interface AvailabilityResponse {
  archived_snapshots?: { closest?: { url?: string; available?: boolean; status?: string } }
}

export interface ArchivedFile {
  body: Uint8Array
  contentType: string | null
}

/** Asks the Wayback availability API for the snapshot closest to `timestamp` (or the latest). */
export async function findSnapshot(targetUrl: string, timestamp?: string): Promise<string | null> {
  const query = new URLSearchParams({ url: targetUrl })
  if (timestamp) query.set('timestamp', timestamp)

  const res = await fetch(`${AVAILABILITY_API}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`archive.org availability API returned ${res.status}`)

  const closest = ((await res.json()) as AvailabilityResponse).archived_snapshots?.closest
  return closest?.available !== false && closest?.url ? closest.url : null
}

/**
 * Turns a snapshot URL into its raw form by adding the `id_` flag after the
 * timestamp, which returns the original bytes without the Wayback toolbar or
 * rewritten links. Always https.
 */
export function toRawSnapshotUrl(snapshotUrl: string): string {
  return snapshotUrl.replace(/^http:/, 'https:').replace(/(\/web\/\d+)(?:id_)?\//, '$1id_/')
}

/** Downloads a raw snapshot. Returns null when archive.org does not answer 200. */
export async function fetchSnapshot(snapshotUrl: string): Promise<ArchivedFile | null> {
  const res = await fetch(toRawSnapshotUrl(snapshotUrl), { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`archive.org snapshot returned ${res.status}`)
  return { body: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') }
}

/** Convenience: lookup + download. Null when the URL was never archived. */
export async function retrieve(targetUrl: string, timestamp?: string): Promise<ArchivedFile | null> {
  const snapshot = await findSnapshot(targetUrl, timestamp)
  return snapshot ? fetchSnapshot(snapshot) : null
}
