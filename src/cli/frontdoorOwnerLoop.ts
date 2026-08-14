import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import type { ApprovedTaskPacket } from '../shared/jobLoopTypes'
import type { DecompositionPlanInput, FrontdoorRequestInput, OwnerGate } from '../shared/frontdoorTypes'
import { createLiveRelay } from '../main/liveRelay'
import { FrontdoorOrchestrator } from '../main/frontdoor/orchestrator'
import { prepareFrontdoorRunOrThrow } from '../main/frontdoor/frontdoorPrepareService'

interface FrontdoorInputFile {
  request: FrontdoorRequestInput
  plan: DecompositionPlanInput
}

export interface FrontdoorCliIO {
  readJsonFile: (filePath: string) => Promise<unknown>
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export const defaultFrontdoorCliIO: FrontdoorCliIO = {
  readJsonFile: async (filePath) => JSON.parse(await readFile(filePath, 'utf8')) as unknown,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text)
}

const frontdoorOptions = {
  'runtime-root': { type: 'string' },
  input: { type: 'string' },
  packets: { type: 'string' },
  gate: { type: 'string' },
  nodes: { type: 'string' },
  'approved-by': { type: 'string' },
  note: { type: 'string' },
  'question-id': { type: 'string' },
  'node-id': { type: 'string' },
  'answer-ref': { type: 'string' },
  decision: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean' }
} as const

type FrontdoorCommand = 'prepare' | 'inspect' | 'approve' | 'dispatch' | 'review-node' | 'answer' | 'review-result' | 'complete' | 'stop' | 'recover'

const commands: readonly FrontdoorCommand[] = ['prepare', 'inspect', 'approve', 'dispatch', 'review-node', 'answer', 'review-result', 'complete', 'stop', 'recover']

function usage(command?: string): string {
  if (command === 'approve') {
    return [
      'Usage: adf frontdoor approve --gate <intake|completion-shape|decomposition|dispatch> --run-id <run-id> [options]',
      '  --nodes <node-a,node-b> is required for --gate dispatch.',
      ''
    ].join('\n')
  }
  return [
    'Usage: adf frontdoor <command> [options]',
    '',
    'Commands:',
    '  prepare         create a Run proposal; no Owner Decision or dispatch',
    '  inspect         read the Run, hashes, Evidence, Decisions, and next action',
    '  approve         record one explicit Owner Gate decision',
    '  dispatch        execute only the previously approved Node set',
    '  review-node     record Owner continue/stop for the completed Node; continue dispatches the next Node',
    '  answer          record an explicit answer to the current Question',
    '  review-result   record the Owner review of the current Aggregate/Evidence',
    '  complete        approve completion after accepted Result review',
    '  stop            stop the Run without retry or integration',
    '  recover         mark interrupted work for Owner review; never retries',
    '',
    'Common options:',
    '  --runtime-root <path>  Runtime root (default: .adf-runtime)',
    '  --run-id <run-id>      Run to inspect or change',
    '  --approved-by <name>   Owner identity for a Decision',
    '  --note <text>          Decision or stop note',
    '  --json                 print machine-readable output',
    '  --help                 show help',
    '',
    'prepare options: --input <request-plan.json>',
    'approve options: --gate <gate> --decision <expected positive Decision> --approved-by <name>',
    'dispatch options: --packets <packets.json>',
    'review-node options: --node-id <node-id> --decision <continue|stop> [--packets <packets.json>]',
    'answer options: --question-id <id> plus --answer-ref <ref> or --note <text>',
    'review-result options: --decision <accept|follow-up|reject>',
    ''
  ].join('\n')
}

function parseNodeIds(value: string | undefined): string[] {
  if (!value) throw new Error('dispatch approval requires --nodes <node-a,node-b>')
  const values = value.split(',').map((item) => item.trim())
  if (values.some((item) => item.length === 0)) throw new Error('--nodes cannot contain empty Node IDs')
  if (new Set(values).size !== values.length) throw new Error('--nodes cannot contain duplicate Node IDs')
  return values
}

function requiredString(values: Record<string, unknown>, key: string): string | null {
  const value = values[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function output(io: FrontdoorCliIO, value: unknown, json: boolean): void {
  io.stdout(json ? `${JSON.stringify(value, null, 2)}\n` : `${JSON.stringify(value, null, 2)}\n`)
}

function errorText(error: unknown): string {
  return String((error as Error)?.message ?? error).replace(/\s+/g, ' ').slice(0, 500)
}

function isGate(value: string | null): value is OwnerGate {
  return value === 'intake' || value === 'completion-shape' || value === 'decomposition' || value === 'dispatch'
}

function isReviewDecision(value: string | null): value is 'accept' | 'follow-up' | 'reject' {
  return value === 'accept' || value === 'follow-up' || value === 'reject'
}

function ensureInput(value: unknown): FrontdoorInputFile {
  if (!value || typeof value !== 'object') throw new Error('input must be an object containing request and plan')
  const candidate = value as Partial<FrontdoorInputFile>
  if (!candidate.request || !candidate.plan) throw new Error('input must contain request and plan')
  return { request: candidate.request, plan: candidate.plan }
}

function ensurePackets(value: unknown): Readonly<Record<string, ApprovedTaskPacket>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('packets must be an object keyed by Node ID')
  return value as Readonly<Record<string, ApprovedTaskPacket>>
}

async function inspectRun(orchestrator: FrontdoorOrchestrator, runId: string): Promise<unknown> {
  const inspection = await orchestrator.inspectRun(runId)
  return {
    run: inspection.run,
    request: { requestId: inspection.request.requestId, objective: inspection.request.objective, inputHash: inspection.request.inputHash, requestedOutput: inspection.request.requestedOutput },
    plan: { planId: inspection.plan.planId, planHash: inspection.plan.planHash, nodeIds: inspection.plan.nodes.map((node) => node.nodeId) },
    decisions: inspection.decisions,
    aggregateHash: inspection.aggregateHash,
    evidence: inspection.evidenceRefs,
    questions: inspection.openQuestions,
    nextAction: inspection.nextAction,
    eventCount: inspection.eventCount,
    nodeTargetHashes: inspection.nodeTargetHashes,
    nodeReview: inspection.nodeReview
  }
}

export async function runFrontdoorCli(argv: string[], io: FrontdoorCliIO = defaultFrontdoorCliIO): Promise<number> {
  const command = argv[0]
  if (!command || command === '--help' || command === '-h') {
    io.stdout(usage())
    return 0
  }
  if (!commands.includes(command as FrontdoorCommand)) {
    io.stderr(`unknown frontdoor command: ${command}\n${usage()}`)
    return 1
  }

  let values: Record<string, unknown>
  try {
    const parsed = parseArgs({ args: argv.slice(1), options: { ...frontdoorOptions, 'run-id': { type: 'string' } }, strict: true, allowPositionals: false })
    values = parsed.values as Record<string, unknown>
  } catch (error) {
    io.stderr(`argument error: ${errorText(error)}\n`)
    return 1
  }
  if (values.help) {
    io.stdout(usage(command))
    return 0
  }

  const runtimeRoot = path.resolve(requiredString(values, 'runtime-root') ?? '.adf-runtime')
  const json = values.json === true
  const relay = createLiveRelay(runtimeRoot)
  const orchestrator = new FrontdoorOrchestrator({ relay })

  try {
    if (command === 'prepare') {
      const inputPath = requiredString(values, 'input')
      if (!inputPath) throw new Error('prepare requires --input <request-plan.json>')
      const input = ensureInput(await io.readJsonFile(path.resolve(inputPath)))
      const prepared = await prepareFrontdoorRunOrThrow(orchestrator, input)
      output(io, { command, runId: prepared.run.runId, state: prepared.run.state, requestHash: prepared.run.requestHash, planHash: prepared.run.planHash, nextAction: prepared.run.ownerGate, reused: prepared.reused }, json)
      return 0
    }

    const runId = requiredString(values, 'run-id')
    if (!runId) throw new Error(`${command} requires --run-id <run-id>`)

    if (command === 'inspect') {
      output(io, await inspectRun(orchestrator, runId), json)
      return 0
    }

    const requiresOwnerIdentity = command === 'approve' || command === 'review-node' || command === 'answer' || command === 'review-result' || command === 'complete' || command === 'stop'
    const approvedBy = requiredString(values, 'approved-by')
    if (requiresOwnerIdentity && !approvedBy) throw new Error(`${command} requires --approved-by <name>`)
    const note = requiredString(values, 'note') ?? undefined

    if (command === 'approve') {
      const gate = requiredString(values, 'gate')
      if (!isGate(gate)) throw new Error('approve requires --gate intake|completion-shape|decomposition|dispatch')
      const requestedDecision = requiredString(values, 'decision')
      const expectedDecision = gate === 'intake' ? 'proceed' : gate === 'completion-shape' ? 'approve' : gate === 'decomposition' ? 'approve-selected' : 'dispatch'
      if (requestedDecision !== expectedDecision) throw new Error(`approve --gate ${gate} requires --decision ${expectedDecision}`)
      let decision: unknown
      if (gate === 'intake') decision = await orchestrator.approveIntake(runId, approvedBy!, note)
      else if (gate === 'completion-shape') decision = await orchestrator.approveCompletionShape(runId, approvedBy!, note)
      else if (gate === 'decomposition') decision = await orchestrator.approveDecomposition(runId, approvedBy!, note)
      else {
        const nodeIds = parseNodeIds(requiredString(values, 'nodes') ?? undefined)
        decision = await orchestrator.approveDispatch(runId, nodeIds, approvedBy!, note)
      }
      output(io, { command, gate, decision }, json)
      return 0
    }

    if (command === 'dispatch') {
      const packetsPath = requiredString(values, 'packets')
      if (!packetsPath) throw new Error('dispatch requires --packets <packets.json>')
      const packets = ensurePackets(await io.readJsonFile(path.resolve(packetsPath)))
      const result = await orchestrator.executeApprovedRun(runId, packets)
      output(io, { command, runId, result }, json)
      return 0
    }

    if (command === 'review-node') {
      const nodeId = requiredString(values, 'node-id')
      if (!nodeId) throw new Error('review-node requires --node-id <node-id>')
      const decision = requiredString(values, 'decision')
      if (decision !== 'continue' && decision !== 'stop') throw new Error('review-node requires --decision continue|stop')
      const review = await orchestrator.reviewNode(runId, nodeId, approvedBy!, decision, note)
      if (decision === 'stop') {
        output(io, { command, decision: review }, json)
        return 0
      }
      const packetsPath = requiredString(values, 'packets')
      if (!packetsPath) throw new Error('review-node --decision continue requires --packets <packets.json>')
      const packets = ensurePackets(await io.readJsonFile(path.resolve(packetsPath)))
      const result = await orchestrator.executeApprovedRun(runId, packets)
      output(io, { command, decision: review, result }, json)
      return 0
    }

    if (command === 'answer') {
      const questionId = requiredString(values, 'question-id')
      if (!questionId) throw new Error('answer requires --question-id <id>')
      const question = await orchestrator.getOpenQuestion(runId, questionId)
      const answerRef = requiredString(values, 'answer-ref') ?? undefined
      if (!answerRef && !note) throw new Error('answer requires --answer-ref <ref> or --note <text>')
      const decision = await orchestrator.answerQuestion(runId, question, approvedBy!, answerRef, note)
      output(io, { command, questionId, decision, nextAction: 'inspect then Owner decides the next action' }, json)
      return 0
    }

    if (command === 'review-result') {
      const decision = requiredString(values, 'decision')
      if (!isReviewDecision(decision)) throw new Error('review-result requires --decision accept|follow-up|reject')
      const result = await orchestrator.reviewResult(runId, approvedBy!, decision, note)
      output(io, { command, decision: result, nextAction: decision === 'accept' ? 'complete' : 'inspect' }, json)
      return 0
    }

    if (command === 'complete') {
      const run = await orchestrator.completeRun(runId, approvedBy!, note)
      output(io, { command, run }, json)
      return 0
    }

    if (command === 'stop') {
      const run = await orchestrator.stopRun(runId, note ?? 'Owner stopped Frontdoor run', approvedBy!)
      output(io, { command, run }, json)
      return 0
    }

    if (command === 'recover') {
      const run = await orchestrator.recoverRun(runId)
      output(io, { command, run, nextAction: 'inspect; no automatic retry was performed' }, json)
      return 0
    }

    throw new Error(`unsupported frontdoor command: ${command}`)
  } catch (error) {
    io.stderr(`frontdoor ${command} failed: ${errorText(error)}\n`)
    return 1
  }
}
