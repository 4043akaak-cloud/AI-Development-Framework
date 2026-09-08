import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { hashJson } from '../jobLoop/hash'
import { readJson } from '../jobLoop/ledger'
import type { DecompositionNode, OrchestrationRun } from '../../shared/frontdoorTypes'
import { submissionScanFields, type ParticipantEvidenceCandidate, type ParticipantSubmission } from '../../shared/participantTypes'
import { assertNoCredentialShapedText } from '../../shared/secretSentinel'
import { participantAssignmentId, validateParticipantAssignment } from './participantRegistry'
import { nodeTargetHash } from './ownerGates'
import { readPlan, readProjectedRun, readRequest, readRunEvents } from './ledger'
import { assertRuntimeRootSafe, safeRuntimePath } from './pathIntegrity'

const maxSubmissions = 100
const maxText = 12_000

type RunBundle = {
  run: OrchestrationRun
  request: Awaited<ReturnType<typeof readRequest>>
  plan: Awaited<ReturnType<typeof readPlan>>
  events: Awaited<ReturnType<typeof readRunEvents>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,240}$/.test(value) || value.includes('..')) throw new Error(`invalid ${label}`)
  return value
}

function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`participant submission ${label} must be a SHA-256 hash`)
  return value
}

function boundedText(value: unknown, label: string, limit = maxText): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error(`participant submission ${label} is invalid`)
  return value
}

function approvalState(events: Awaited<ReturnType<typeof readRunEvents>>, run: OrchestrationRun, node: DecompositionNode): { ownerNodeApproved: boolean; ownerPacketDispatchApproved: boolean } {
  const targetHash = nodeTargetHash(run, { node })
  const ownerNodeApproved = events.some((event) => event.type === 'frontdoor.node-approved' && event.payload.nodeId === node.nodeId && event.payload.nodeTargetHash === targetHash)
  const ownerPacketDispatchApproved = events.some((event) => event.type === 'frontdoor.approval-bound'
    && typeof event.payload.targetHash === 'string'
    && Array.isArray(event.payload.nodeIds)
    && event.payload.nodeIds.includes(node.nodeId)
    && isRecord(event.payload.packetHashes)
    && typeof event.payload.packetHashes[node.nodeId] === 'string')
  return { ownerNodeApproved, ownerPacketDispatchApproved }
}

function validateSubmissionShape(value: unknown, participantId: string, assignmentIdFromPath: string): ParticipantSubmission {
  if (!isRecord(value)) throw new Error('participant submission must be an object')
  const submission = value as unknown as ParticipantSubmission
  if (submission.status !== 'submitted') throw new Error('participant submission status is invalid')
  if (submission.participantId !== participantId) throw new Error('participant submission participant binding mismatch')
  if (submission.assignmentId !== assignmentIdFromPath) throw new Error('participant submission assignment path mismatch')
  safeIdentifier(submission.assignmentId, 'assignmentId')
  safeIdentifier(submission.runId, 'runId')
  safeIdentifier(submission.requestId, 'requestId')
  safeIdentifier(submission.nodeId, 'nodeId')
  if (typeof submission.submissionId !== 'string' || submission.submissionId !== `submission-${hashJson([submission.participantId, submission.assignmentId, submission.targetHash]).slice(0, 24)}`) throw new Error('participant submission id binding mismatch')
  hash(submission.requestHash, 'requestHash')
  hash(submission.planHash, 'planHash')
  hash(submission.targetHash, 'targetHash')
  hash(submission.assignmentHash, 'assignmentHash')
  boundedText(submission.summary, 'summary', 2_000)
  boundedText(submission.content, 'content')
  if (!Array.isArray(submission.verification) || submission.verification.length > 20 || !submission.verification.every((entry) => isRecord(entry) && typeof entry.name === 'string' && entry.name.length <= 500 && ['pass', 'fail', 'not-run'].includes(String(entry.status)))) throw new Error('participant submission verification is invalid')
  if (!Array.isArray(submission.risks) || submission.risks.length > 20 || !submission.risks.every((risk) => typeof risk === 'string' && risk.length <= 500)) throw new Error('participant submission risks are invalid')
  if (typeof submission.createdAt !== 'string' || Number.isNaN(Date.parse(submission.createdAt))) throw new Error('participant submission createdAt is invalid')
  // Adoption-side half of the participant ingress guard. The MCP server already refuses to write
  // one, but a submission file can also predate that guard or arrive by another route, so the
  // boundary is closed here too — the same doubling `validateResultEnvelope` already has.
  assertNoCredentialShapedText('participant submission', submissionScanFields(submission))
  return submission
}

async function verifySubmission(runtimeRoot: string, submissionRef: string, participantId: string, assignmentIdFromPath: string, runCache: Map<string, RunBundle>): Promise<ParticipantEvidenceCandidate> {
  const submission = validateSubmissionShape(await readJson<unknown>(await safeRuntimePath(runtimeRoot, submissionRef)), participantId, assignmentIdFromPath)
  let bundle = runCache.get(submission.runId)
  if (!bundle) {
    const run = await readProjectedRun(runtimeRoot, submission.runId, { repair: false })
    const [request, plan, events] = await Promise.all([readRequest(runtimeRoot, submission.runId), readPlan(runtimeRoot, submission.runId), readRunEvents(runtimeRoot, submission.runId)])
    if (request.inputHash !== run.requestHash || plan.planHash !== run.planHash) throw new Error(`participant evidence binding mismatch: ${submission.runId}`)
    bundle = { run, request, plan, events }
    runCache.set(submission.runId, bundle)
  }
  const record = bundle.run.nodes.find((candidate) => candidate.node.nodeId === submission.nodeId)
  if (!record?.node.participantAssignment) throw new Error(`participant evidence Node assignment not found: ${submission.nodeId}`)
  const assignment = record.node.participantAssignment
  if (assignment.participantId !== participantId || assignment.role !== submission.participantRole) throw new Error(`participant evidence role binding mismatch: ${submission.nodeId}`)
  validateParticipantAssignment(assignment.participantId, assignment.role, assignment.capabilities)
  if (participantAssignmentId(submission.runId, record.node) !== submission.assignmentId) throw new Error(`participant evidence assignmentId mismatch: ${submission.nodeId}`)
  if (hashJson(assignment) !== submission.assignmentHash) throw new Error(`participant evidence assignment hash mismatch: ${submission.nodeId}`)
  if (submission.requestId !== bundle.request.requestId || submission.requestHash !== bundle.run.requestHash || submission.planHash !== bundle.run.planHash) throw new Error(`participant evidence Request/Plan binding mismatch: ${submission.nodeId}`)
  const targetHash = nodeTargetHash(bundle.run, record)
  if (submission.targetHash !== targetHash) throw new Error(`participant evidence target hash mismatch: ${submission.nodeId}`)
  const approvals = approvalState(bundle.events, bundle.run, record.node)
  if (!approvals.ownerPacketDispatchApproved) throw new Error(`participant evidence has no Owner Packet-bound Dispatch: ${submission.nodeId}`)
  const submissionHash = hashJson(submission)
  return {
    evidenceId: `participant-evidence-${hashJson([submission.runId, submission.nodeId, submission.submissionId]).slice(0, 24)}`,
    submissionRef,
    evidenceHash: submissionHash,
    status: 'awaiting-owner-review',
    runId: submission.runId,
    requestId: submission.requestId,
    nodeId: submission.nodeId,
    participantId: submission.participantId,
    participantRole: submission.participantRole,
    requestHash: submission.requestHash,
    planHash: submission.planHash,
    targetHash: submission.targetHash,
    assignmentHash: submission.assignmentHash,
    summary: submission.summary,
    content: submission.content,
    verification: submission.verification,
    risks: submission.risks,
    createdAt: submission.createdAt,
    ownerNodeApproved: approvals.ownerNodeApproved,
    ownerPacketDispatchApproved: approvals.ownerPacketDispatchApproved
  }
}

export async function listParticipantEvidence(runtimeRoot: string, runId?: string): Promise<ParticipantEvidenceCandidate[]> {
  const safeRoot = await assertRuntimeRootSafe(runtimeRoot)
  if (runId !== undefined) safeIdentifier(runId, 'runId')
  const submissionsRoot = path.join(safeRoot, 'participant-submissions')
  let participants
  try {
    participants = await readdir(submissionsRoot, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const runCache = new Map<string, RunBundle>()
  const verified: ParticipantEvidenceCandidate[] = []
  for (const participantEntry of participants.filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const participantId = safeIdentifier(participantEntry.name, 'participantId')
    const participantDirectory = path.join(submissionsRoot, participantId)
    const files = await readdir(participantDirectory, { withFileTypes: true })
    for (const file of files.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).sort((left, right) => left.name.localeCompare(right.name))) {
      const assignmentId = safeIdentifier(file.name.slice(0, -'.json'.length), 'assignmentId')
      const submissionRef = `participant-submissions/${participantId}/${file.name}`
      const candidate = await verifySubmission(safeRoot, submissionRef, participantId, assignmentId, runCache)
      if (runId === undefined || candidate.runId === runId) verified.push(candidate)
      if (verified.length > maxSubmissions) throw new Error(`participant evidence exceeds the limit of ${maxSubmissions}`)
    }
  }
  return verified.sort((left, right) => `${left.runId}:${left.nodeId}`.localeCompare(`${right.runId}:${right.nodeId}`))
}
