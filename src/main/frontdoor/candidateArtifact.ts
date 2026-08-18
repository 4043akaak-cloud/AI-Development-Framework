import path from 'node:path'
import type { CandidateFile, ImplementationCandidate } from '../../shared/implementationTypes'
import { hashJson } from '../jobLoop/hash'

export const MAX_CANDIDATE_FILES = 8
export const MAX_CANDIDATE_FILE_BYTES = 16 * 1024
export const MAX_CANDIDATE_TOTAL_BYTES = 64 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function candidatePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || path.isAbsolute(value)) return false
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'))
  return normalized === value.replaceAll('\\', '/') && normalized !== '.' && !normalized.split('/').includes('..')
}

function containsSecretSentinel(content: string): boolean {
  return /(ANTHROPIC_API_KEY|OPENAI_API_KEY|api[_-]?key\s*[:=]|sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})/i.test(content)
}

export function candidateHash(candidate: Pick<ImplementationCandidate, 'kind' | 'baseSnapshotHash' | 'files'>): string {
  return hashJson({ kind: candidate.kind, baseSnapshotHash: candidate.baseSnapshotHash, files: candidate.files })
}

export function validateImplementationCandidate(value: unknown, allowedFiles: readonly string[]): ImplementationCandidate {
  if (!isRecord(value) || value.kind !== 'candidate-file-set' || typeof value.baseSnapshotHash !== 'string' || !Array.isArray(value.files) || typeof value.candidateHash !== 'string') {
    throw new Error('implementation candidate schema is invalid')
  }
  if (value.files.length === 0 || value.files.length > MAX_CANDIDATE_FILES) throw new Error('implementation candidate file count exceeds the approved limit')
  const allowed = new Set(allowedFiles)
  const files: CandidateFile[] = []
  let totalBytes = 0
  for (const entry of value.files) {
    if (!isRecord(entry) || !candidatePath(entry.relativePath) || typeof entry.content !== 'string' || typeof entry.contentHash !== 'string') throw new Error('implementation candidate file shape is invalid')
    if (!allowed.has(entry.relativePath)) throw new Error(`implementation candidate file is outside the approved file set: ${entry.relativePath}`)
    if (containsSecretSentinel(entry.content)) throw new Error(`implementation candidate contains a secret sentinel: ${entry.relativePath}`)
    const bytes = Buffer.byteLength(entry.content, 'utf8')
    if (bytes > MAX_CANDIDATE_FILE_BYTES) throw new Error(`implementation candidate file exceeds the size limit: ${entry.relativePath}`)
    if (files.some((file) => file.relativePath === entry.relativePath)) throw new Error(`implementation candidate contains a duplicate path: ${entry.relativePath}`)
    if (hashJson(entry.content) !== entry.contentHash) throw new Error(`implementation candidate content hash mismatch: ${entry.relativePath}`)
    totalBytes += bytes
    files.push({ relativePath: entry.relativePath, content: entry.content, contentHash: entry.contentHash })
  }
  if (totalBytes > MAX_CANDIDATE_TOTAL_BYTES) throw new Error('implementation candidate exceeds the total size limit')
  const candidate = { kind: 'candidate-file-set' as const, baseSnapshotHash: value.baseSnapshotHash, files, candidateHash: value.candidateHash }
  if (candidateHash(candidate) !== candidate.candidateHash) throw new Error('implementation candidate hash mismatch')
  return candidate
}
