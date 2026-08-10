import crypto from 'node:crypto'

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue((value as Record<string, unknown>)[key])]))
  }
  return value
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

export function hashJson(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function nowIso(): string {
  return new Date().toISOString()
}
