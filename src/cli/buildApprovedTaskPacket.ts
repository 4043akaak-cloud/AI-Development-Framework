import { parseArgs } from 'node:util'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { AdapterPlan, AdapterRole, Approval, ApprovedTaskPacket, Capability, DispatchTarget, FixtureMode } from '../shared/jobLoopTypes'
import { extractExecutionSummary, ExecutionSummaryError, type ExecutionSummary } from './executionSummary'
import { hashJson } from '../main/jobLoop/hash'
import { buildExplicitAdapterPlan, routeAdapters } from '../main/jobLoop/adapterRegistry'
import { validateApprovedTask, TaskPacketRejectedError } from '../main/jobLoop/contracts'
import { readJson, writeJsonExclusive } from '../main/jobLoop/ledger'

const cliOptions = {
  task: { type: 'string' },
  roles: { type: 'string' },
  'explicit-adapter': { type: 'string' },
  'approval-id': { type: 'string' },
  'approved-by': { type: 'string' },
  'approved-at': { type: 'string' },
  'expires-at': { type: 'string' },
  capabilities: { type: 'string' },
  repository: { type: 'string' },
  branch: { type: 'string' },
  worktree: { type: 'string' },
  'allowed-files': { type: 'string' },
  'forbidden-changes': { type: 'string' },
  'fixture-mode': { type: 'string' },
  adapter: { type: 'string' },
  'runtime-root': { type: 'string' },
  'tasks-dir': { type: 'string' },
  write: { type: 'boolean' },
  'compare-existing': { type: 'boolean' },
  confirm: { type: 'boolean' }
} as const

const requiredOptions = ['task', 'roles', 'approval-id', 'approved-by', 'approved-at', 'expires-at', 'capabilities'] as const

export interface CliIO {
  readTaskMarkdown: (tasksDir: string, taskId: string) => Promise<string>
  readExistingPacket: (runtimeRoot: string, taskId: string) => Promise<ApprovedTaskPacket | null>
  writePacket: (runtimeRoot: string, taskId: string, packet: ApprovedTaskPacket) => Promise<void>
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export function approvedTaskPacketPath(runtimeRoot: string, taskId: string): string {
  return path.join(runtimeRoot, 'approved-tasks', `${taskId}.json`)
}

export const defaultIO: CliIO = {
  readTaskMarkdown: (tasksDir, taskId) => readFile(path.join(tasksDir, `${taskId}.md`), 'utf8'),
  readExistingPacket: async (runtimeRoot, taskId) => {
    try {
      return await readJson<ApprovedTaskPacket>(approvedTaskPacketPath(runtimeRoot, taskId))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  },
  writePacket: (runtimeRoot, taskId, packet) => writeJsonExclusive(approvedTaskPacketPath(runtimeRoot, taskId), packet),
  stdout: (text) => {
    process.stdout.write(text)
  },
  stderr: (text) => {
    process.stderr.write(text)
  }
}

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter((item) => item.length > 0)
}

function formatComparison(generated: ApprovedTaskPacket, existing: ApprovedTaskPacket): string {
  const fields: Array<[string, unknown, unknown]> = [
    ['scopeHash', generated.scopeHash, existing.scopeHash],
    ['contextHash', generated.contextHash, existing.contextHash],
    ['scope', generated.scope, existing.scope],
    ['context', generated.context, existing.context],
    ['acceptance', generated.acceptance, existing.acceptance],
    ['stopConditions', generated.stopConditions, existing.stopConditions],
    ['adapterPlan', generated.adapterPlan, existing.adapterPlan]
  ]
  const lines = ['--- compare-existing: generated vs. existing approved Task Packet (informational only) ---']
  for (const [name, generatedValue, existingValue] of fields) {
    const same = JSON.stringify(generatedValue) === JSON.stringify(existingValue)
    lines.push(same ? `= ${name}` : `≠ ${name} (generated: ${JSON.stringify(generatedValue)} | existing: ${JSON.stringify(existingValue)})`)
  }
  lines.push('--- this comparison never blocks execution ---')
  return `${lines.join('\n')}\n`
}

/**
 * Builds one Owner-approved Task Packet from a Task document's Execution Summary block and
 * explicit CLI arguments. Never reads any other part of the Markdown, never invents approval
 * metadata, and never overwrites an existing packet. Returns a process exit code instead of
 * calling `process.exit` so tests can drive it in-process against a temp directory.
 */
export async function runCli(argv: string[], io: CliIO = defaultIO): Promise<number> {
  let values: Partial<Record<string, string | boolean>>
  try {
    const parsed = parseArgs({ args: argv, options: cliOptions, strict: true, allowPositionals: false })
    values = parsed.values as Partial<Record<string, string | boolean>>
  } catch (error) {
    io.stderr(`argument error: ${(error as Error).message}\n`)
    return 1
  }

  const missing = requiredOptions.filter((key) => !values[key])
  if (missing.length) {
    io.stderr(`missing required arguments: ${missing.map((key) => `--${key}`).join(', ')}\n`)
    return 1
  }

  const taskId = values.task as string
  const tasksDir = (values['tasks-dir'] as string) ?? 'docs/tasks'
  const runtimeRoot = (values['runtime-root'] as string) ?? '.adf-runtime'
  const roles = splitList(values.roles as string) as AdapterRole[]
  const capabilities = splitList(values.capabilities as string) as Capability[]
  const target: DispatchTarget = {
    repository: (values.repository as string) ?? `fixture://${taskId}`,
    branch: (values.branch as string) ?? `fixture/${taskId}`,
    worktree: (values.worktree as string) ?? `fixture://${taskId}-worktree`,
    allowedFiles: values['allowed-files'] ? splitList(values['allowed-files'] as string) : [`docs/tasks/${taskId}.md`],
    forbiddenChanges: values['forbidden-changes'] ? splitList(values['forbidden-changes'] as string) : ['commit', 'push']
  }
  const fixtureMode = ((values['fixture-mode'] as string) ?? 'success') as FixtureMode
  const adapterMode = (values.adapter as string) ?? 'multi-ai-routing-v1'

  let markdown: string
  try {
    markdown = await io.readTaskMarkdown(tasksDir, taskId)
  } catch (error) {
    io.stderr(`could not read Task Markdown for ${taskId} in ${tasksDir}: ${(error as Error).message}\n`)
    return 1
  }

  let summary: ExecutionSummary
  try {
    summary = extractExecutionSummary(markdown, taskId)
  } catch (error) {
    if (error instanceof ExecutionSummaryError) {
      io.stderr(`${error.message}\n`)
      return 1
    }
    throw error
  }

  if (values.confirm) {
    io.stderr(`--- Execution Summary read from ${tasksDir}/${taskId}.md ---\n${JSON.stringify(summary, null, 2)}\n--- end of Execution Summary ---\n`)
  }

  const explicitAdapter = values['explicit-adapter'] as string | undefined
  let adapterPlan: AdapterPlan
  try {
    if (explicitAdapter) {
      // One Owner-named adapter for one role, never the auto-routed fake-ai-a/-b result: see
      // ADF-OLLAMA-LIVE-CONNECTION-001's Packet/Dispatch boundary fix.
      if (roles.length !== 1) {
        io.stderr('--explicit-adapter requires exactly one --roles value (one adapter, one role, no auto-routing)\n')
        return 1
      }
      adapterPlan = buildExplicitAdapterPlan(taskId, explicitAdapter, roles[0], capabilities)
    } else {
      adapterPlan = routeAdapters(taskId, roles, capabilities)
    }
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`)
    return 1
  }

  const scopeHash = hashJson(summary.scope)
  const contextHash = hashJson(summary.context)
  const routingPlanHash = hashJson(adapterPlan)

  const approval: Approval = {
    approvalId: values['approval-id'] as string,
    taskId,
    status: 'active',
    approvedBy: values['approved-by'] as string,
    approvedAt: values['approved-at'] as string,
    expiresAt: values['expires-at'] as string,
    scopeHash,
    routingPlanHash,
    capabilities
  }

  const packet: ApprovedTaskPacket = {
    taskId,
    objective: summary.objective,
    scope: summary.scope,
    scopeHash,
    context: summary.context,
    contextHash,
    acceptance: summary.acceptance,
    stopConditions: summary.stopConditions,
    approval,
    adapter: adapterMode,
    fixtureMode,
    target,
    adapterPlan
  }

  try {
    validateApprovedTask(packet)
  } catch (error) {
    if (error instanceof TaskPacketRejectedError) {
      io.stderr(`${error.message}\n`)
      return 1
    }
    throw error
  }

  if (values['compare-existing']) {
    const existing = await io.readExistingPacket(runtimeRoot, taskId)
    io.stderr(existing ? formatComparison(packet, existing) : `--compare-existing: no existing packet found at approved-tasks/${taskId}.json\n`)
  }

  io.stdout(`${JSON.stringify(packet, null, 2)}\n`)

  if (values.write) {
    try {
      await io.writePacket(runtimeRoot, taskId, packet)
      io.stderr(`wrote ${approvedTaskPacketPath(runtimeRoot, taskId)}\n`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        io.stderr(`refusing to overwrite an existing packet at ${approvedTaskPacketPath(runtimeRoot, taskId)} (--force is not implemented)\n`)
        return 1
      }
      throw error
    }
  }

  return 0
}
