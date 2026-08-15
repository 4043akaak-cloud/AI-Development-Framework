import { access, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { ApprovedTaskPacket } from '../../shared/jobLoopTypes'
import type { FrontdoorInspection, FrontdoorPlanProposal, FrontdoorPrepareResult, FrontdoorRequestInput, FrontdoorRunSummary, OwnerDecisionEnvelope, OwnerGate, OrchestrationRun, WorkPlaneArtifactManifest } from '../../shared/frontdoorTypes'
import type { RelayResult } from '../../shared/threadTypes'
import { readJson } from '../jobLoop/ledger'
import { FrontdoorOrchestrator } from './orchestrator'
import { prepareFrontdoorRunOrThrow } from './frontdoorPrepareService'
import type { FrontdoorPlanner } from './planner'
import { createFrontdoorRequest } from './intake'

export interface FrontdoorApprovalInput {
  runId: unknown
  gate: unknown
  approvedBy: unknown
  note?: unknown
  nodeIds?: unknown
}

export interface FrontdoorAnswerInput {
  runId: unknown
  questionId: unknown
  approvedBy: unknown
  answerRef?: unknown
  note?: unknown
}

export interface FrontdoorReviewInput {
  runId: unknown
  approvedBy: unknown
  decision: unknown
  note?: unknown
}

export interface FrontdoorNodeReviewInput {
  runId: unknown
  nodeId: unknown
  approvedBy: unknown
  decision: unknown
  note?: unknown
}

export interface FrontdoorNodeReviewResult {
  decision: OwnerDecisionEnvelope
  execution?: Awaited<ReturnType<FrontdoorOrchestrator['executeApprovedRun']>>
}

export interface FrontdoorCompletionInput {
  runId: unknown
  approvedBy: unknown
  note?: unknown
}

export interface FrontdoorArtifactExportInput {
  runId: unknown
  approvedBy: unknown
  note?: unknown
}

export interface FrontdoorStopInput {
  runId: unknown
  approvedBy: unknown
  note?: unknown
}

export function prepareFrontdoorRun(orchestrator: FrontdoorOrchestrator, input: unknown): Promise<RelayResult<FrontdoorPrepareResult>> {
  return guard(() => prepareFrontdoorRunOrThrow(orchestrator, input))
}

export function proposeFrontdoorPlan(planner: FrontdoorPlanner, input: unknown): Promise<RelayResult<FrontdoorPlanProposal>> {
  return guard(async () => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('planner input must be a Request object')
    return planner.propose(createFrontdoorRequest(input as FrontdoorRequestInput))
  })
}

function guard<T>(run: () => Promise<T>): Promise<RelayResult<T>> {
  return run().then((value) => ({ ok: true, value }), (error) => ({ ok: false, error: safeError(error) }))
}

function safeError(error: unknown): string {
  return String((error as Error)?.message ?? error).replace(/\s+/g, ' ').slice(0, 500)
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,240}$/.test(value) || value.includes('..')) throw new Error(`invalid ${label}`)
  return value
}

function owner(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 120) throw new Error('approvedBy is required')
  return value.trim()
}

function note(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.length > 400) throw new Error('invalid note')
  return value
}

function gate(value: unknown): OwnerGate {
  if (value === 'intake' || value === 'completion-shape' || value === 'decomposition' || value === 'dispatch') return value
  throw new Error('invalid approval gate')
}

function nodeIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string')) throw new Error('dispatch requires a non-empty nodeIds array')
  const ids = value.map((entry) => identifier(entry, 'nodeId'))
  if (new Set(ids).size !== ids.length) throw new Error('dispatch nodeIds must be unique')
  return ids
}

function reviewDecision(value: unknown): 'accept' | 'follow-up' | 'reject' {
  if (value === 'accept' || value === 'follow-up' || value === 'reject') return value
  throw new Error('invalid result review decision')
}

function nodeReviewDecision(value: unknown): 'continue' | 'stop' {
  if (value === 'continue' || value === 'stop') return value
  throw new Error('invalid Node review decision')
}

function packetPath(runtimeRoot: string, taskId: string): string {
  const file = path.join(runtimeRoot, 'approved-tasks', `${taskId}.json`)
  if (path.basename(file) !== `${taskId}.json`) throw new Error(`invalid child Task Packet identifier: ${taskId}`)
  return file
}

async function packetsForRun(orchestrator: FrontdoorOrchestrator, run: OrchestrationRun): Promise<Readonly<Record<string, ApprovedTaskPacket>>> {
  const packets: Record<string, ApprovedTaskPacket> = {}
  for (const record of run.nodes) {
    const taskId = record.childTaskId
    try {
      packets[record.node.nodeId] = await readJson<ApprovedTaskPacket>(packetPath(orchestrator.runtimeRoot, taskId))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Owner-approved child Packet is missing: approved-tasks/${taskId}.json`)
      throw error
    }
  }
  return packets
}

async function packetsReady(orchestrator: FrontdoorOrchestrator, run: OrchestrationRun): Promise<boolean> {
  try {
    await Promise.all(run.nodes.map((record) => access(packetPath(orchestrator.runtimeRoot, record.childTaskId))))
    return true
  } catch {
    return false
  }
}

async function runIds(orchestrator: FrontdoorOrchestrator): Promise<string[]> {
  try {
    const entries = await readdir(path.join(orchestrator.runtimeRoot, 'frontdoor-runs'), { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory() && /^[A-Za-z0-9._:-]{1,240}$/.test(entry.name) && !entry.name.includes('..')).map((entry) => entry.name).sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export function listFrontdoorRuns(orchestrator: FrontdoorOrchestrator): Promise<RelayResult<FrontdoorRunSummary[]>> {
  return guard(async () => {
    const summaries: FrontdoorRunSummary[] = []
    for (const runId of await runIds(orchestrator)) {
      const inspection = await orchestrator.inspectRun(runId)
      summaries.push({
        runId,
        requestId: inspection.request.requestId,
        objective: inspection.request.objective,
        state: inspection.run.state,
        ownerGate: inspection.run.ownerGate,
        updatedAt: inspection.run.updatedAt,
        nodeCount: inspection.run.nodes.length,
        openQuestionCount: inspection.openQuestions.length,
        packetsReady: await packetsReady(orchestrator, inspection.run)
      })
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  })
}

export function inspectFrontdoorRun(orchestrator: FrontdoorOrchestrator, runId: unknown): Promise<RelayResult<FrontdoorInspection>> {
  return guard(() => orchestrator.inspectRun(identifier(runId, 'runId')))
}

export function approveFrontdoorRun(orchestrator: FrontdoorOrchestrator, input: FrontdoorApprovalInput): Promise<RelayResult<OwnerDecisionEnvelope>> {
  return guard(async () => {
    const runId = identifier(input.runId, 'runId')
    const approvedBy = owner(input.approvedBy)
    const selectedGate = gate(input.gate)
    const safeNote = note(input.note)
    if (selectedGate === 'intake') return orchestrator.approveIntake(runId, approvedBy, safeNote)
    if (selectedGate === 'completion-shape') return orchestrator.approveCompletionShape(runId, approvedBy, safeNote)
    if (selectedGate === 'decomposition') return orchestrator.approveDecomposition(runId, approvedBy, safeNote)
    return orchestrator.approveDispatch(runId, nodeIds(input.nodeIds), approvedBy, safeNote)
  })
}

export function dispatchFrontdoorRun(orchestrator: FrontdoorOrchestrator, runId: unknown, options: { requirePacketBinding?: boolean } = {}): Promise<RelayResult<Awaited<ReturnType<FrontdoorOrchestrator['executeApprovedRun']>>>> {
  return guard(async () => {
    const run = await orchestrator.getRun(identifier(runId, 'runId'))
    return orchestrator.executeApprovedRun(run.runId, await packetsForRun(orchestrator, run), options)
  })
}

export function answerFrontdoorQuestion(orchestrator: FrontdoorOrchestrator, input: FrontdoorAnswerInput): Promise<RelayResult<OwnerDecisionEnvelope>> {
  return guard(async () => {
    const runId = identifier(input.runId, 'runId')
    const questionId = identifier(input.questionId, 'questionId')
    const answerRef = input.answerRef === undefined || input.answerRef === null ? undefined : identifier(input.answerRef, 'answerRef')
    const safeNote = note(input.note)
    if (!answerRef && !safeNote) throw new Error('answer requires answerRef or note')
    return orchestrator.answerQuestion(runId, await orchestrator.getOpenQuestion(runId, questionId), owner(input.approvedBy), answerRef, safeNote)
  })
}

export function reviewFrontdoorResult(orchestrator: FrontdoorOrchestrator, input: FrontdoorReviewInput): Promise<RelayResult<OwnerDecisionEnvelope>> {
  return guard(() => orchestrator.reviewResult(identifier(input.runId, 'runId'), owner(input.approvedBy), reviewDecision(input.decision), note(input.note)))
}

export function reviewFrontdoorNode(orchestrator: FrontdoorOrchestrator, input: FrontdoorNodeReviewInput): Promise<RelayResult<FrontdoorNodeReviewResult>> {
  return guard(async () => {
    const runId = identifier(input.runId, 'runId')
    const nodeId = identifier(input.nodeId, 'nodeId')
    const decision = await orchestrator.reviewNode(runId, nodeId, owner(input.approvedBy), nodeReviewDecision(input.decision), note(input.note))
    if (decision.decision === 'stop') return { decision }
    const execution = await dispatchFrontdoorRun(orchestrator, runId)
    if (!execution.ok) throw new Error(`Node review continued, but next Node dispatch failed: ${execution.error}`)
    return { decision, execution: execution.value }
  })
}

export function completeFrontdoorRun(orchestrator: FrontdoorOrchestrator, input: FrontdoorCompletionInput): Promise<RelayResult<OrchestrationRun>> {
  return guard(() => orchestrator.completeRun(identifier(input.runId, 'runId'), owner(input.approvedBy), note(input.note)))
}

export function exportFrontdoorArtifact(orchestrator: FrontdoorOrchestrator, input: FrontdoorArtifactExportInput): Promise<RelayResult<WorkPlaneArtifactManifest>> {
  return guard(() => orchestrator.exportWorkPlaneArtifact(identifier(input.runId, 'runId'), owner(input.approvedBy), note(input.note)))
}

export function stopFrontdoorRun(orchestrator: FrontdoorOrchestrator, input: FrontdoorStopInput): Promise<RelayResult<OrchestrationRun>> {
  return guard(() => orchestrator.stopRun(identifier(input.runId, 'runId'), note(input.note) ?? 'Owner stopped Frontdoor run', owner(input.approvedBy)))
}

export function recoverFrontdoorRun(orchestrator: FrontdoorOrchestrator, runId: unknown): Promise<RelayResult<OrchestrationRun>> {
  return guard(() => orchestrator.recoverRun(identifier(runId, 'runId')))
}
