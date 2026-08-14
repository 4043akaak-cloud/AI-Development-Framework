export interface ExecutionSummary {
  adfExecutionSummary: 'v1'
  taskId: string
  objective: string
  scope: { inScope: string[]; outOfScope: string[] }
  context: { githubTask: string; obsidianContext: string[]; adoptedPrinciples: string[] }
  acceptance: string[]
  stopConditions: string[]
}

export class ExecutionSummaryError extends Error {
  readonly code = 'EXECUTION_SUMMARY_REJECTED'
  readonly details: string[]
  constructor(details: string[]) {
    super(`Execution Summary rejected: ${details.join('; ')}`)
    this.details = details
  }
}

const headingText = '## ADF Execution Summary'
const fenceInfoString = 'json adf-execution-summary'
const fenceOpen = `\`\`\`${fenceInfoString}`

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * Locates the single `## ADF Execution Summary` heading and the single fenced JSON block that
 * must follow it (blank lines only in between). Never falls back to any other part of the
 * Markdown — this function is the only thing the CLI reads from a Task document.
 */
function locateBlock(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const headingIndexes: number[] = []
  lines.forEach((line, index) => {
    if (line.trim() === headingText) headingIndexes.push(index)
  })
  if (headingIndexes.length === 0) throw new ExecutionSummaryError([`heading not found: "${headingText}"`])
  if (headingIndexes.length > 1) throw new ExecutionSummaryError([`heading appears ${headingIndexes.length} times, expected exactly once: "${headingText}"`])

  // Every fenced block anywhere in the document that claims this info string, so a duplicate
  // placed elsewhere (not immediately after the heading) is still caught as an error.
  const fenceInfoLines: number[] = []
  lines.forEach((line, index) => {
    if (line.trim() === fenceOpen) fenceInfoLines.push(index)
  })
  if (fenceInfoLines.length === 0) throw new ExecutionSummaryError([`no fenced block with info string "${fenceInfoString}" found`])
  if (fenceInfoLines.length > 1) throw new ExecutionSummaryError([`fenced block with info string "${fenceInfoString}" appears ${fenceInfoLines.length} times, expected exactly once`])

  const headingIndex = headingIndexes[0]
  const fenceStart = fenceInfoLines[0]
  for (let index = headingIndex + 1; index < fenceStart; index += 1) {
    if (lines[index].trim() !== '') {
      throw new ExecutionSummaryError([`the fenced block must immediately follow the "${headingText}" heading (only blank lines allowed in between); found non-blank content at line ${index + 1}`])
    }
  }

  let fenceEnd = -1
  for (let index = fenceStart + 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '```') {
      fenceEnd = index
      break
    }
  }
  if (fenceEnd === -1) throw new ExecutionSummaryError(['fenced block is not closed (no matching ``` found before end of file)'])

  return lines.slice(fenceStart + 1, fenceEnd).join('\n')
}

function assertShape(value: unknown): asserts value is ExecutionSummary {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ExecutionSummaryError(['execution summary must be a JSON object'])
  }
  const errors: string[] = []
  const obj = value as Record<string, unknown>

  const topLevelKeys = ['adfExecutionSummary', 'taskId', 'objective', 'scope', 'context', 'acceptance', 'stopConditions']
  const unknownTop = Object.keys(obj).filter((key) => !topLevelKeys.includes(key))
  if (unknownTop.length) errors.push(`unknown top-level keys: ${unknownTop.join(', ')}`)

  if (obj.adfExecutionSummary !== 'v1') errors.push(`adfExecutionSummary must be "v1", got ${JSON.stringify(obj.adfExecutionSummary)}`)
  if (typeof obj.taskId !== 'string' || obj.taskId.length === 0) errors.push('taskId must be a non-empty string')
  if (typeof obj.objective !== 'string' || obj.objective.length === 0) errors.push('objective must be a non-empty string')

  if (typeof obj.scope !== 'object' || obj.scope === null || Array.isArray(obj.scope)) {
    errors.push('scope must be an object')
  } else {
    const scope = obj.scope as Record<string, unknown>
    const unknownScope = Object.keys(scope).filter((key) => !['inScope', 'outOfScope'].includes(key))
    if (unknownScope.length) errors.push(`scope has unknown keys: ${unknownScope.join(', ')}`)
    if (!isStringArray(scope.inScope)) errors.push('scope.inScope must be a string array')
    if (!isStringArray(scope.outOfScope)) errors.push('scope.outOfScope must be a string array')
  }

  if (typeof obj.context !== 'object' || obj.context === null || Array.isArray(obj.context)) {
    errors.push('context must be an object')
  } else {
    const context = obj.context as Record<string, unknown>
    const unknownContext = Object.keys(context).filter((key) => !['githubTask', 'obsidianContext', 'adoptedPrinciples'].includes(key))
    if (unknownContext.length) errors.push(`context has unknown keys: ${unknownContext.join(', ')}`)
    if (typeof context.githubTask !== 'string' || context.githubTask.length === 0) errors.push('context.githubTask must be a non-empty string')
    if (!isStringArray(context.obsidianContext)) errors.push('context.obsidianContext must be a string array')
    if (!isStringArray(context.adoptedPrinciples)) errors.push('context.adoptedPrinciples must be a string array')
  }

  if (!isStringArray(obj.acceptance)) errors.push('acceptance must be a string array')
  if (!isStringArray(obj.stopConditions)) errors.push('stopConditions must be a string array')

  if (errors.length) throw new ExecutionSummaryError(errors)
}

/**
 * The only function that reads a Task Markdown document. It extracts exactly the fenced
 * `adf-execution-summary` block and validates its shape — it never reads, summarizes, or infers
 * from any other part of the document.
 */
export function extractExecutionSummary(markdown: string, expectedTaskId: string): ExecutionSummary {
  const raw = locateBlock(markdown)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new ExecutionSummaryError([`fenced block is not valid JSON: ${(error as Error).message}`])
  }
  assertShape(parsed)
  if (parsed.taskId !== expectedTaskId) {
    throw new ExecutionSummaryError([`taskId in Execution Summary ("${parsed.taskId}") does not match the requested task ("${expectedTaskId}")`])
  }
  return parsed
}
