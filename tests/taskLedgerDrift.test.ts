import { describe, expect, it } from 'vitest'
import { assessTaskLedgerDrift, collectRunReferences, formatDriftReport, type TaskDocument } from '../src/cli/taskLedgerDrift'

function doc(document: string, markdown: string): TaskDocument {
  return { document, taskId: document.replace(/^.*\//, '').replace(/\.md$/, ''), markdown }
}

const summaryFor = (taskId: string, fence = 'json adf-execution-summary'): string => `## ADF Execution Summary

\`\`\`${fence}
${JSON.stringify(
  {
    adfExecutionSummary: 'v1',
    taskId,
    objective: 'o',
    scope: { inScope: ['a'], outOfScope: ['b'] },
    context: { githubTask: 'docs/tasks/x.md', obsidianContext: [], adoptedPrinciples: [] },
    acceptance: ['a'],
    stopConditions: ['s']
  },
  null,
  2
)}
\`\`\`
`

describe('collectRunReferences', () => {
  it('maps each Run id to every document citing it', () => {
    const references = collectRunReferences([
      doc('docs/tasks/A.md', 'see run-1111111111111111aaaa and run-2222222222222222bbbb'),
      doc('docs/tasks/B.md', 'run-1111111111111111aaaa again, and run-1111111111111111aaaa twice')
    ])
    expect(references.get('run-1111111111111111aaaa')).toEqual(['docs/tasks/A.md', 'docs/tasks/B.md'])
    expect(references.get('run-2222222222222222bbbb')).toEqual(['docs/tasks/A.md'])
  })

  it('ignores text that only looks like a Run id', () => {
    const references = collectRunReferences([doc('docs/tasks/A.md', 'run-short and run-ZZZZZZZZZZZZZZZZZZZZ')])
    expect(references.size).toBe(0)
  })
})

describe('assessTaskLedgerDrift', () => {
  /**
   * The failure this exists for: two Runs driven from the Electron window sat in the Ledger for
   * weeks while no Task document mentioned them, and nobody could have noticed by reading either
   * side alone.
   */
  it('finds a Run the Ledger holds and no document mentions', () => {
    const report = assessTaskLedgerDrift(
      [doc('docs/tasks/A.md', 'covers run-1111111111111111aaaa')],
      ['run-1111111111111111aaaa', 'run-6aee23a0451084eaa19f']
    )
    expect(report.undocumentedRuns).toEqual([{ runId: 'run-6aee23a0451084eaa19f' }])
  })

  it('reports a cited Run missing from the Ledger without calling it an error', () => {
    const report = assessTaskLedgerDrift([doc('docs/tasks/A.md', 'run-0cf084773023ec7ae222')], [])
    expect(report.unverifiableReferences).toEqual([{ runId: 'run-0cf084773023ec7ae222', documents: ['docs/tasks/A.md'] }])
    expect(report.undocumentedRuns).toEqual([])
  })

  it('is quiet when both sides agree', () => {
    const report = assessTaskLedgerDrift([doc('docs/tasks/A.md', 'run-1111111111111111aaaa')], ['run-1111111111111111aaaa'])
    expect(report.undocumentedRuns).toEqual([])
    expect(report.unverifiableReferences).toEqual([])
    expect(report.unreadableSummaries).toEqual([])
    expect(report.summaryTaskIdMismatches).toEqual([])
  })

  /**
   * Most Tasks never needed a Packet, so a document with no summary heading is normal. Reporting
   * those would bury the real findings under sixty lines of noise.
   */
  it('says nothing about a document with no Execution Summary at all', () => {
    const report = assessTaskLedgerDrift([doc('docs/tasks/A.md', '# Task\n\nno summary here')], [])
    expect(report.unreadableSummaries).toEqual([])
    expect(report.summaryTaskIdMismatches).toEqual([])
  })

  it('accepts a well-formed summary whose taskId matches its filename', () => {
    const report = assessTaskLedgerDrift([doc('docs/tasks/ADF-X-001.md', summaryFor('ADF-X-001'))], [])
    expect(report.unreadableSummaries).toEqual([])
    expect(report.summaryTaskIdMismatches).toEqual([])
  })

  it('catches a summary declaring a different Task than the file it lives in', () => {
    const report = assessTaskLedgerDrift([doc('docs/tasks/ADF-X-001.md', summaryFor('ADF-Y-002'))], [])
    expect(report.summaryTaskIdMismatches).toEqual([{ document: 'docs/tasks/ADF-X-001.md', declaredTaskId: 'ADF-Y-002' }])
  })

  /**
   * Ten real documents carry the heading with a plain ```json fence. The Packet CLI reads only the
   * `json adf-execution-summary` info string, so it refuses all ten — a divergence between the
   * convention and the documents that nothing surfaced before.
   */
  it('catches a heading whose block the Packet CLI cannot read', () => {
    const report = assessTaskLedgerDrift([doc('docs/tasks/ADF-X-001.md', summaryFor('ADF-X-001', 'json'))], [])
    expect(report.unreadableSummaries).toHaveLength(1)
    expect(report.unreadableSummaries[0]?.document).toBe('docs/tasks/ADF-X-001.md')
    expect(report.unreadableSummaries[0]?.details.join()).toContain('adf-execution-summary')
    expect(report.summaryTaskIdMismatches).toEqual([])
  })

  it('counts both sides so an empty report is distinguishable from an empty scan', () => {
    const report = assessTaskLedgerDrift([doc('docs/tasks/A.md', '')], ['run-1111111111111111aaaa'])
    expect(report.documentCount).toBe(1)
    expect(report.ledgerRunCount).toBe(1)
  })
})

describe('formatDriftReport', () => {
  it('states plainly when there is nothing to report', () => {
    const text = formatDriftReport(assessTaskLedgerDrift([doc('docs/tasks/A.md', 'run-1111111111111111aaaa')], ['run-1111111111111111aaaa']))
    expect(text).toContain('undocumented Runs: none')
    expect(text).toContain('unverifiable references: none')
    expect(text).toContain('all readable')
  })

  it('never tells the reader which side to change', () => {
    const text = formatDriftReport(assessTaskLedgerDrift([], ['run-1111111111111111aaaa']))
    expect(text).toContain('Reported, not repaired')
  })
})
