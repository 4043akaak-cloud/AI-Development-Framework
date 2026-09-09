import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { ExecutionSummaryError, extractExecutionSummary } from './executionSummary'

/**
 * Compares what the Task documents claim against what the Runtime Ledger holds.
 *
 * ADF splits its record deliberately: GitHub keeps Tasks, approvals and verification; the Ledger
 * keeps execution state. Nothing checked that the two agreed, and they had stopped agreeing. Three
 * discrepancies were found by hand on 2026-09-08 — a Task saying a Result Review had not happened
 * when the Ledger held the decision, and two Runs driven from the Electron window that no document
 * mentioned at all.
 *
 * The asymmetry is structural rather than careless: the Ledger is appended automatically on every
 * action, while Task documents are written by hand. When the Owner drives the app directly there is
 * no agent in the loop to write anything down, so the documents fall behind and stay behind.
 *
 * Read-only, and reports rather than repairs. Which side is wrong is a judgement about intent, and
 * `docs/decisions` reserves that for the Owner.
 */

const RUN_ID = /run-[0-9a-f]{16,}/g

export interface UndocumentedRun {
  runId: string
}

export interface UnverifiableRunReference {
  runId: string
  /** Task documents citing it, repo-relative. */
  documents: string[]
}

export interface SummaryTaskIdMismatch {
  document: string
  declaredTaskId: string
}

export interface MalformedSummary {
  document: string
  details: string[]
}

export interface TaskLedgerDriftReport {
  /** In the Ledger, cited by no document. A Run nobody wrote down. */
  undocumentedRuns: UndocumentedRun[]
  /**
   * Cited by a document, absent from the Ledger. Usually a Run from a runtime that has since been
   * reset, which is ordinary history — so this is reported, never called an error.
   */
  unverifiableReferences: UnverifiableRunReference[]
  /** An Execution Summary whose taskId disagrees with the file it lives in. */
  summaryTaskIdMismatches: SummaryTaskIdMismatch[]
  /**
   * The heading is there but the block underneath cannot be read, so the Packet CLI would refuse
   * the document. Absence of a heading is not listed — most Tasks never needed a Packet.
   */
  unreadableSummaries: MalformedSummary[]
  /**
   * Documents carrying an `## ADF Execution Record` block. These are narrative records of a
   * finished Task, not Packet inputs, and the Packet CLI does not read them.
   *
   * They are listed rather than passed over in silence. Ten documents were renamed from
   * "Execution Summary" to "Execution Record" because that is what they contain; the rename also
   * removed them from the parser's view, and a report that then says "all readable" would be
   * describing documents it no longer looks at. Naming them keeps the report honest about its own
   * coverage.
   */
  executionRecords: string[]
  documentCount: number
  ledgerRunCount: number
}

export interface TaskDocument {
  /** Repo-relative, for reporting. */
  document: string
  /** The file's basename without extension, which is the Task ID by convention. */
  taskId: string
  markdown: string
}

export function collectRunReferences(documents: readonly TaskDocument[]): Map<string, string[]> {
  const references = new Map<string, string[]>()
  for (const document of documents) {
    for (const runId of new Set(document.markdown.match(RUN_ID) ?? [])) {
      references.set(runId, [...(references.get(runId) ?? []), document.document])
    }
  }
  return references
}

/**
 * Uses the canonical extractor rather than matching the block itself.
 *
 * A first pass at this used its own regex and reported seven mismatches, every one of them a prose
 * mention of the heading rather than a real block. The parser owns what a summary is; a second
 * opinion about that only manufactures findings.
 */
function inspectSummary(document: TaskDocument): { mismatch?: SummaryTaskIdMismatch; malformed?: MalformedSummary } {
  try {
    extractExecutionSummary(document.markdown, document.taskId)
    return {}
  } catch (error) {
    if (!(error instanceof ExecutionSummaryError)) throw error
    const details = error.details
    // No block at all is the normal case: most Tasks never needed a Packet.
    if (details.some((detail) => detail.startsWith('heading not found'))) return {}
    const mismatch = details.find((detail) => detail.includes('does not match the requested task'))
    if (mismatch) {
      const declared = /\("([^"]*)"\)/.exec(mismatch)?.[1] ?? '(unreadable)'
      return { mismatch: { document: document.document, declaredTaskId: declared } }
    }
    return { malformed: { document: document.document, details } }
  }
}

/** Not a Packet Execution Summary. The parser does not read these, so the report says so out loud. */
const EXECUTION_RECORD_HEADING = '## ADF Execution Record'

export function assessTaskLedgerDrift(documents: readonly TaskDocument[], ledgerRunIds: readonly string[]): TaskLedgerDriftReport {
  const references = collectRunReferences(documents)
  const ledger = new Set(ledgerRunIds)

  const summaryTaskIdMismatches: SummaryTaskIdMismatch[] = []
  const malformedSummaries: MalformedSummary[] = []
  const executionRecords: string[] = []
  for (const document of documents) {
    const { mismatch, malformed } = inspectSummary(document)
    if (mismatch) summaryTaskIdMismatches.push(mismatch)
    if (malformed) malformedSummaries.push(malformed)
    if (document.markdown.split(/\r?\n/).some((line) => line.trim() === EXECUTION_RECORD_HEADING)) executionRecords.push(document.document)
  }

  return {
    undocumentedRuns: [...ledger].filter((runId) => !references.has(runId)).sort().map((runId) => ({ runId })),
    unverifiableReferences: [...references.entries()]
      .filter(([runId]) => !ledger.has(runId))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([runId, documents]) => ({ runId, documents: [...documents].sort() })),
    summaryTaskIdMismatches,
    unreadableSummaries: malformedSummaries,
    executionRecords: executionRecords.sort(),
    documentCount: documents.length,
    ledgerRunCount: ledger.size
  }
}

export async function readTaskDocuments(repoRoot: string, relativeDirectories: readonly string[]): Promise<TaskDocument[]> {
  const documents: TaskDocument[] = []
  for (const relative of relativeDirectories) {
    const directory = path.join(repoRoot, relative)
    // A missing optional directory is fine; anything else means the scan is incomplete and must
    // not be reported as agreement.
    let entries: string[]
    try {
      entries = await readdir(directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw new Error(`cannot read ${relative}: ${(error as Error).message}`)
    }
    for (const entry of entries.filter((name) => name.endsWith('.md')).sort()) {
      documents.push({
        document: path.posix.join(relative, entry),
        taskId: entry.slice(0, -'.md'.length),
        markdown: await readFile(path.join(directory, entry), 'utf8')
      })
    }
  }
  return documents
}

/**
 * `run-<id>.staging-<pid>-<time>` directories are written mid-creation and left behind by an
 * interrupted one. Counting them as Runs turns ordinary churn into "undocumented Run" findings.
 */
const RUN_DIRECTORY = /^run-[0-9a-f]+$/

/**
 * Throws rather than returning an empty inventory. Swallowing a permission error or a wrong root
 * would report every documented Run as missing and every Ledger Run as undocumented — or, if both
 * sides failed, report perfect agreement between two things it never read.
 */
export async function readLedgerRunIds(runtimeRoot: string): Promise<string[]> {
  const directory = path.join(runtimeRoot, 'frontdoor-runs')
  try {
    return (await readdir(directory)).filter((entry) => RUN_DIRECTORY.test(entry)).sort()
  } catch (error) {
    throw new Error(`cannot read the Ledger at ${directory}: ${(error as Error).message}`)
  }
}

export function formatDriftReport(report: TaskLedgerDriftReport): string {
  const lines: string[] = [`task/ledger drift: ${report.documentCount} documents, ${report.ledgerRunCount} Runs in the Ledger`, '']

  if (report.undocumentedRuns.length === 0) lines.push('  undocumented Runs: none')
  else {
    lines.push(`  undocumented Runs (in the Ledger, cited by no document): ${report.undocumentedRuns.length}`)
    for (const entry of report.undocumentedRuns) lines.push(`    - ${entry.runId}`)
  }

  if (report.unverifiableReferences.length === 0) lines.push('  unverifiable references: none')
  else {
    lines.push(`  unverifiable references (cited, absent from this Ledger — usually a reset runtime): ${report.unverifiableReferences.length}`)
    for (const entry of report.unverifiableReferences) lines.push(`    - ${entry.runId}  ${entry.documents.join(', ')}`)
  }

  if (report.summaryTaskIdMismatches.length === 0) lines.push('  Execution Summary taskId: consistent')
  else for (const entry of report.summaryTaskIdMismatches) lines.push(`    - taskId mismatch: ${entry.document} declares "${entry.declaredTaskId}"`)

  if (report.unreadableSummaries.length === 0) lines.push('  Execution Summary blocks: all readable')
  else {
    lines.push(`  unreadable Execution Summary blocks (heading present, Packet CLI would refuse): ${report.unreadableSummaries.length}`)
    for (const entry of report.unreadableSummaries) lines.push(`    - ${entry.document}: ${entry.details.join('; ')}`)
  }

  if (report.executionRecords.length > 0) {
    lines.push(`  Execution Record blocks (narrative records, not Packet inputs — not checked by this tool): ${report.executionRecords.length}`)
    for (const entry of report.executionRecords) lines.push(`    - ${entry}`)
  }

  lines.push('', 'Reported, not repaired. Which side is stale is the Owner\'s call.')
  return lines.join('\n')
}

export interface DriftCliIO {
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export const defaultDriftCliIO: DriftCliIO = {
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`)
}

/**
 * Exit code 0 even when drift is found. This reports a documentation gap, not a broken build, and
 * a check that fails the moment history contains a reset runtime would be turned off within a week.
 */
export async function runTaskLedgerDriftCli(argv: readonly string[], io: DriftCliIO = defaultDriftCliIO): Promise<number> {
  const runtimeRootIndex = argv.indexOf('--runtime-root')
  if (runtimeRootIndex === -1 || !argv[runtimeRootIndex + 1]) {
    io.stderr('usage: adf task-ledger-drift --runtime-root <path> [--repo-root <path>]')
    return 2
  }
  const repoRootIndex = argv.indexOf('--repo-root')
  const repoRoot = repoRootIndex === -1 ? process.cwd() : argv[repoRootIndex + 1]

  const documents = await readTaskDocuments(repoRoot, ['docs/tasks', 'docs/project'])
  const ledgerRunIds = await readLedgerRunIds(argv[runtimeRootIndex + 1])
  io.stdout(formatDriftReport(assessTaskLedgerDrift(documents, ledgerRunIds)))
  return 0
}
