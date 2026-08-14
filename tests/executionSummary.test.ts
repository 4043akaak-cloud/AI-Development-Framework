import { describe, expect, it } from 'vitest'
import { extractExecutionSummary, ExecutionSummaryError } from '../src/cli/executionSummary'

const taskId = 'ADF-EXAMPLE-001'

function validBlock(overrides: Partial<Record<string, unknown>> = {}): string {
  const summary = {
    adfExecutionSummary: 'v1',
    taskId,
    objective: 'Example objective.',
    scope: { inScope: ['a'], outOfScope: ['b'] },
    context: { githubTask: 'docs/tasks/ADF-EXAMPLE-001.md', obsidianContext: [], adoptedPrinciples: ['owner-approval'] },
    acceptance: ['acceptance 1'],
    stopConditions: ['stop 1'],
    ...overrides
  }
  return JSON.stringify(summary, null, 2)
}

function docWithSummary(json: string, extra: { heading?: string; fence?: string; between?: string; secondHeading?: boolean; secondFence?: boolean; unterminated?: boolean } = {}): string {
  const heading = extra.heading ?? '## ADF Execution Summary'
  const fence = extra.fence ?? '```json adf-execution-summary'
  const between = extra.between ?? ''
  const closing = extra.unterminated ? '' : '```\n'
  let doc = `# ${taskId}\n\nSome narrative prose.\n\n${heading}\n\n${between}${fence}\n${json}\n${closing}`
  if (extra.secondHeading) doc += `\n## ADF Execution Summary\n\n${fence}\n${json}\n\`\`\`\n`
  if (extra.secondFence) doc += `\n${fence}\n${json}\n\`\`\`\n`
  return doc
}

describe('extractExecutionSummary — happy path', () => {
  it('extracts a well-formed block', () => {
    const summary = extractExecutionSummary(docWithSummary(validBlock()), taskId)
    expect(summary.taskId).toBe(taskId)
    expect(summary.scope).toEqual({ inScope: ['a'], outOfScope: ['b'] })
    expect(summary.context.obsidianContext).toEqual([])
  })

  it('allows blank lines between the heading and the fence', () => {
    const summary = extractExecutionSummary(docWithSummary(validBlock(), { between: '\n\n' }), taskId)
    expect(summary.taskId).toBe(taskId)
  })
})

describe('extractExecutionSummary — structural errors (no fallback, no guessing)', () => {
  it('rejects a document with no heading', () => {
    const doc = '# Title\n\nNo execution summary here.\n'
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(ExecutionSummaryError)
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/heading not found/)
  })

  it('rejects a duplicated heading', () => {
    const doc = docWithSummary(validBlock(), { secondHeading: true })
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/heading appears 2 times/)
  })

  it('rejects a duplicated fenced block elsewhere in the document', () => {
    const doc = docWithSummary(validBlock(), { secondFence: true })
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/appears 2 times/)
  })

  it('rejects non-blank content between the heading and the fence', () => {
    const doc = docWithSummary(validBlock(), { between: 'Some explanatory prose.\n\n' })
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/must immediately follow/)
  })

  it('rejects a heading with no fenced block anywhere', () => {
    const doc = '## ADF Execution Summary\n\nJust prose, no code block.\n'
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/no fenced block/)
  })

  it('rejects an unterminated fenced block', () => {
    const doc = docWithSummary(validBlock(), { unterminated: true })
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/not closed/)
  })

  it('rejects broken JSON without guessing at intent', () => {
    const doc = docWithSummary('{ "taskId": "ADF-EXAMPLE-001", ')
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/not valid JSON/)
  })
})

describe('extractExecutionSummary — schema errors', () => {
  it('rejects an unknown top-level key', () => {
    const doc = docWithSummary(validBlock({ unexpected: 'value' }))
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/unknown top-level keys: unexpected/)
  })

  it('rejects an unknown nested key under scope', () => {
    const doc = docWithSummary(validBlock({ scope: { inScope: [], outOfScope: [], extra: [] } }))
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/scope has unknown keys: extra/)
  })

  it('rejects a wrong type for a string-array field', () => {
    const doc = docWithSummary(validBlock({ scope: { inScope: 'not an array', outOfScope: [] } }))
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/scope.inScope must be a string array/)
  })

  it('rejects an unsupported adfExecutionSummary version', () => {
    const doc = docWithSummary(validBlock({ adfExecutionSummary: 'v2' }))
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/adfExecutionSummary must be "v1"/)
  })

  it('rejects a taskId mismatch against the requested task', () => {
    const doc = docWithSummary(validBlock({ taskId: 'ADF-OTHER-001' }))
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/does not match the requested task/)
  })

  it('rejects a non-object JSON value', () => {
    const doc = docWithSummary('[1, 2, 3]')
    expect(() => extractExecutionSummary(doc, taskId)).toThrow(/must be a JSON object/)
  })
})
