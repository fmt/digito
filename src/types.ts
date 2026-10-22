interface WorkerEnv {
  /** KV namespace holding processed archive content. */
  ARC: KVNamespace
  /** Wayback timestamp used when looking up favicon.ico. */
  ICO_TIMESTAMP?: string
}

export type Env = WorkerEnv

export interface CachedMetadata {
  contentType: string
}

// Types `env` from "cloudflare:test" (and anything else reading Cloudflare.Env).
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}
