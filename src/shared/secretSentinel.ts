/**
 * One place that decides what "credential-shaped text" means inside ADF.
 *
 * Before this module the same intent lived in two shapes: a fail-closed detector for Work Plane
 * candidates (`candidateArtifact.ts`) and a display-time mask repeated across the Owner-facing
 * projections. They were written separately, so the detector and the mask disagreed about what
 * counted as a credential. The set below is the union of both, which keeps every previous
 * rejection a rejection and every previous mask identical.
 *
 * The patterns match a *shape*, not a verified secret. A hit means ADF must stop and let the Owner
 * look, never that a credential is definitely present.
 */

export interface SecretPattern {
  /** Stable name recorded in Ledgers and errors. The matched text is never recorded. */
  readonly name: string
  readonly pattern: RegExp
}

/**
 * Union of the previous `containsSecretSentinel` set and the display-mask set. Patterns are
 * non-global on purpose: `test()` against a global regex carries `lastIndex` between calls.
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'anthropic-api-key', pattern: /ANTHROPIC_API_KEY/i },
  { name: 'openai-api-key', pattern: /OPENAI_API_KEY/i },
  { name: 'api-key-assignment', pattern: /api[_-]?key\s*[:=]/i },
  // Case-insensitive on purpose: the sentinel this replaced applied `/i` across its whole
  // alternation, so `SK-…` was a hit there. Dropping the flag here would have narrowed detection.
  { name: 'sk-credential', pattern: /sk-[A-Za-z0-9_-]{12,}/i },
  { name: 'bearer-credential', pattern: /Bearer\s+[A-Za-z0-9._-]{12,}/i },
  { name: 'credential-assignment', pattern: /(?:sk-|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,}]+/i }
]

/**
 * The assignment form the projections used to redact inline. Kept as the first pass so everything
 * that was masked before is still masked in the same shape.
 */
const ASSIGNMENT_SOURCE = '(sk-|api[_-]?key|token|secret|password)\\s*[:=]\\s*[^\\s,}]+'

export class CredentialShapedTextError extends Error {
  readonly code = 'CREDENTIAL_SHAPED_TEXT'
  /** `"content (api-key-assignment)"` entries. Deliberately never the matched text. */
  readonly fields: string[]
  readonly source: string
  constructor(source: string, fields: string[]) {
    super(`${source} contains credential-shaped text: ${fields.join(', ')}`)
    this.source = source
    this.fields = fields
  }
}

/**
 * The single gate every inbound boundary calls before externally-authored text is persisted or
 * adopted. Callers pass the fields they have already type-checked; a non-string here is a caller
 * bug, not something to skip quietly, so it is reported rather than ignored.
 */
export function assertNoCredentialShapedText(source: string, fields: Record<string, unknown>): void {
  const found: string[] = []
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue
    if (typeof value !== 'string') {
      found.push(`${field} (not-a-string)`)
      continue
    }
    for (const name of detectSecrets(value)) found.push(`${field} (${name})`)
  }
  if (found.length) throw new CredentialShapedTextError(source, [...new Set(found)].sort())
}

/** Names of every pattern that matched. Returns names only — never the text that matched. */
export function detectSecrets(value: string): string[] {
  return SECRET_PATTERNS.filter((entry) => entry.pattern.test(value)).map((entry) => entry.name)
}

export function containsSecret(value: string): boolean {
  return SECRET_PATTERNS.some((entry) => entry.pattern.test(value))
}

/**
 * Redacts credential-shaped text.
 *
 * The inline version this replaced only matched assignments — `api_key=…`. A bare `sk-abcdef…` or
 * `Bearer abcdef…` passed straight through it. That was tolerable while masking was cosmetic, but
 * `safeErrorText` now relies on it as a *storage* boundary: recovery error text is written to the
 * event Ledger and to an error file, and refusing it there is not an option, since dropping the
 * record of a failure at the moment one occurs is worse. So the mask has to actually mask.
 *
 * Every pattern the detector rejects on is redacted here, not just the assignment form. The output
 * is therefore no longer byte-identical to the old inline mask — it redacts strictly more.
 */
export function maskSecrets(value: string): string {
  let masked = value.replace(new RegExp(ASSIGNMENT_SOURCE, 'gi'), '$1=<redacted>')
  for (const entry of SECRET_PATTERNS) {
    if (entry.name === 'credential-assignment' || entry.name === 'api-key-assignment') continue
    masked = masked.replace(new RegExp(entry.pattern.source, `g${entry.pattern.flags.includes('i') ? 'i' : ''}`), '<redacted>')
  }
  return masked
}
