import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import type { ApprovedTaskPacket } from '../shared/jobLoopTypes'
import type { DecompositionPlanInput, FrontdoorRequestInput, OwnerGate } from '../shared/frontdoorTypes'
import { createLiveRelay } from '../main/liveRelay'
import { FrontdoorOrchestrator } from '../main/frontdoor/orchestrator'
import { prepareFrontdoorRunOrThrow } from '../main/frontdoor/frontdoorPrepareService'
import { deriveFrontdoorChildPackets, dispatchFrontdoorRun, inspectFrontdoorReviews, materializeImplementationPacket, prepareImplementationRun, recordFrontdoorReview } from '../main/frontdoor/frontdoorService'

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

/** The service layer wraps errors for IPC; the CLI wants them thrown so the catch below reports them. */
function requireSuccess<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
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
  'candidate-id': { type: 'string' },
  'target-hash': { type: 'string' },
  'answer-ref': { type: 'string' },
  decision: { type: 'string' },
  'approval-id': { type: 'string' },
  'valid-for-hours': { type: 'string' },
  'review-file': { type: 'string' },
  'parent-run-id': { type: 'string' },
  'source-node-id': { type: 'string' },
  'allowed-files': { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean' }
} as const

type FrontdoorCommand = 'prepare' | 'inspect' | 'approve' | 'dispatch' | 'review-node' | 'answer' | 'review-result' | 'complete' | 'export-artifact' | 'stop' | 'recover' | 'list-candidates' | 'inspect-candidate' | 'review-candidate' | 'derive-packets' | 'record-review' | 'inspect-reviews' | 'prepare-implementation' | 'materialize-implementation-packet'

const commands: readonly FrontdoorCommand[] = ['prepare', 'inspect', 'approve', 'dispatch', 'review-node', 'answer', 'review-result', 'complete', 'export-artifact', 'stop', 'recover', 'list-candidates', 'inspect-candidate', 'review-candidate', 'derive-packets', 'record-review', 'inspect-reviews', 'prepare-implementation', 'materialize-implementation-packet']


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
    '  export-artifact explicitly materialize an accepted Result into the isolated Work Plane',
    '  stop            stop the Run without retry or integration',
    '  recover         mark interrupted work for Owner review; never retries',
    '  derive-packets  derive the child Packets from the approved Plan; grants nothing on its own',
    '  record-review   record an independent review against this Run and ADF\'s reading of it',
    '  inspect-reviews show whether an independent review covers this Run as it stands',
    '  prepare-implementation          derive a child implementation Run from an accepted parent Result',
    '  materialize-implementation-packet  write the implementation child Packet for that Run',
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
    'dispatch options: [--packets <packets.json>] — omit to use the Packets in approved-tasks/',
    'review-node options: --node-id <node-id> --decision <continue|stop> [--packets <packets.json>]',
    'answer options: --question-id <id> plus --answer-ref <ref> or --note <text>',
    'review-result options: --decision <accept|follow-up|reject>',
    'derive-packets options: --approval-id <id> --approved-by <name> [--valid-for-hours <1-336>]',
    'record-review options: --review-file <review.json> --approved-by <name>',
    'prepare-implementation options: --parent-run-id <run-id> --source-node-id <node-id> --allowed-files <a,b>',
    'materialize-implementation-packet options: --approved-by <name>',
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
    nodeReview: inspection.nodeReview,
    goalAlignment: inspection.goalAlignment,
    activities: inspection.activities
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

    if (command === 'list-candidates') {
      const candidates = await orchestrator.listReviewableCandidates()
      output(io, { command, candidates }, json)
      return 0
    }

    if (command === 'inspect-candidate') {
      const candidateId = requiredString(values, 'candidate-id')
      if (!candidateId) throw new Error('inspect-candidate requires --candidate-id <id>')
      const inspection = await orchestrator.inspectCandidate(candidateId)
      output(io, { command, inspection }, json)
      return 0
    }

    if (command === 'review-candidate') {
      const candidateId = requiredString(values, 'candidate-id')
      if (!candidateId) throw new Error('review-candidate requires --candidate-id <id>')
      const decision = requiredString(values, 'decision')
      if (decision !== 'accept' && decision !== 'reject' && decision !== 'follow-up') throw new Error('review-candidate requires --decision accept|reject|follow-up')
      const approvedBy = requiredString(values, 'approved-by')
      if (!approvedBy) throw new Error('review-candidate requires --approved-by <name>')

      const inspection = await orchestrator.inspectCandidate(candidateId)
      const targetHash = requiredString(values, 'target-hash') ?? inspection.targetHash
      const envelope = await orchestrator.reviewCandidate({
        candidateId,
        approvedBy,
        decision,
        targetHash,
        note: requiredString(values, 'note') ?? undefined
      })

      output(io, { command, envelope }, json)
      return 0
    }

    if (command === 'prepare-implementation') {
      const prepared = requireSuccess(await prepareImplementationRun(orchestrator, {
        parentRunId: requiredString(values, 'parent-run-id'),
        sourceNodeId: requiredString(values, 'source-node-id'),
        allowedFiles: (requiredString(values, 'allowed-files') ?? '').split(',').map((entry) => entry.trim()).filter(Boolean),
        ...(requiredString(values, 'note') ? { objective: requiredString(values, 'note')! } : {})
      }))
      output(io, { command, prepared, nextAction: 'approve intake, completion-shape and decomposition, then materialize-implementation-packet' }, json)
      return 0
    }

    const runId = requiredString(values, 'run-id')
    if (!runId) throw new Error(`${command} requires --run-id <run-id>`)


    if (command === 'inspect') {
      output(io, await inspectRun(orchestrator, runId), json)
      return 0
    }

    const requiresOwnerIdentity = command === 'approve' || command === 'review-node' || command === 'answer' || command === 'review-result' || command === 'complete' || command === 'export-artifact' || command === 'stop' || command === 'derive-packets' || command === 'record-review' || command === 'materialize-implementation-packet'
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
      // Without --packets the Packets are read from approved-tasks/, which is where derive-packets
      // wrote them and where the UI has always read them from. Requiring the flag was the last
      // point in the CLI loop that forced the Owner to hand-assemble a file.
      const result = packetsPath
        ? await orchestrator.executeApprovedRun(runId, ensurePackets(await io.readJsonFile(path.resolve(packetsPath))))
        : requireSuccess(await dispatchFrontdoorRun(orchestrator, runId, { requirePacketBinding: true }))
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

    if (command === 'export-artifact') {
      const manifest = await orchestrator.exportWorkPlaneArtifact(runId, approvedBy!, note)
      output(io, { command, manifest, nextAction: 'inspect the manifest; repository and Obsidian integration remain separate' }, json)
      return 0
    }

    if (command === 'stop') {
      const run = await orchestrator.stopRun(runId, note ?? 'Owner stopped Frontdoor run', approvedBy!)
      output(io, { command, run }, json)
      return 0
    }

    if (command === 'derive-packets') {
      const approvalId = requiredString(values, 'approval-id')
      if (!approvalId) throw new Error('derive-packets requires --approval-id <id>')
      const rawHours = requiredString(values, 'valid-for-hours')
      const packets = requireSuccess(await deriveFrontdoorChildPackets(orchestrator, {
        runId,
        approvalId,
        approvedBy: approvedBy!,
        ...(rawHours === null || rawHours === undefined ? {} : { validForHours: Number(rawHours) })
      }))
      output(io, { command, packets, nextAction: 'approve --gate dispatch; the Decision binds these exact Packet hashes' }, json)
      return 0
    }

    if (command === 'record-review') {
      const reviewPath = requiredString(values, 'review-file')
      if (!reviewPath) throw new Error('record-review requires --review-file <review.json>')
      const review = await io.readJsonFile(path.resolve(reviewPath))
      const record = requireSuccess(await recordFrontdoorReview(orchestrator, { runId, recordedBy: approvedBy!, review }))
      output(io, { command, record, nextAction: record.outcome.doneEligible ? 'the review clears this Run; Owner completion approval is separate' : 'the review does not clear this Run' }, json)
      return record.outcome.doneEligible ? 0 : 1
    }

    if (command === 'inspect-reviews') {
      output(io, { command, ...requireSuccess(await inspectFrontdoorReviews(orchestrator, runId)) }, json)
      return 0
    }

    if (command === 'materialize-implementation-packet') {
      const packet = requireSuccess(await materializeImplementationPacket(orchestrator, runId, approvedBy!))
      output(io, { command, taskId: packet.taskId, packetPath: `approved-tasks/${packet.taskId}.json`, nextAction: 'approve --gate dispatch, then dispatch' }, json)
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
