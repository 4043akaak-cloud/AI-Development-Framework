import type { ExternalPreflight, OllamaReadiness } from '../../shared/externalAdapterTypes'

/**
 * Whether the external-send button may be enabled, independent of React so it can be unit-tested
 * without rendering. `local-http` Adapters (Ollama) require a fresh, passing readiness check in
 * addition to preflight — an Owner-explicit action, never inferred or assumed stale-valid.
 */
export function isSendEnabled(preflight: ExternalPreflight | null, readiness: OllamaReadiness | null, connection: string | undefined, busy: boolean, inFlight: boolean): boolean {
  if (busy || inFlight || !preflight?.ok) return false
  if (connection === 'local-http') return Boolean(readiness?.reachable && readiness?.modelPresent)
  return true
}
