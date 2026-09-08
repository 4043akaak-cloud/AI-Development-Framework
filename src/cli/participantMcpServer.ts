import { createInterface, type Interface } from 'node:readline'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { assertNoCredentialShapedText, maskSecrets } from '../shared/secretSentinel'
import { submissionScanFields } from '../shared/participantTypes'
import { ensureDir, readJson, writeJsonExclusive } from '../main/jobLoop/ledger'
import { hashJson } from '../main/jobLoop/hash'
import { readPlan, readProjectedRun, readRequest, readRunEvents } from '../main/frontdoor/ledger'
import { nodeTargetHash } from '../main/frontdoor/ownerGates'
import { assertNoSymlinkComponents, assertRuntimeRootSafe, safeRuntimePath } from '../main/frontdoor/pathIntegrity'
import { getParticipantProfile, participantAssignmentId, validateParticipantAssignment } from '../main/frontdoor/participantRegistry'
import type { Capability } from '../shared/jobLoopTypes'
import type { DecompositionNode, OrchestrationRun } from '../shared/frontdoorTypes'
import type { ParticipantRole, ParticipantSubmission } from '../shared/participantTypes'

const supportedProtocolVersions = ['2025-03-26', '2025-06-18', '2025-11-25'] as const
const serverProtocolVersion = '2025-06-18'
const maxInputChars = 64_000
const maxOutputChars = 24_000
const participantRoles: readonly ParticipantRole[] = ['specialist', 'reviewer', 'integrator']

interface ParticipantMcpOptions {
  runtimeRoot: string
  participantId: string
  participantRole: ParticipantRole
}

interface McpJsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

interface ParticipantAssignmentView {
  assignmentId: string
  assignmentHash: string
  runId: string
  requestId: string
  nodeId: string
  objective: string
  role: ParticipantRole
  participantId: string
  capabilities: Capability[]
  scope: DecompositionNode['scope']
  contextReferences: string[]
  acceptance: string[]
  stopConditions: string[]
  requestHash: string
  planHash: string
  targetHash: string
  nodeState: string
  ownerNodeApproved: boolean
  ownerPacketDispatchApproved: boolean
  submissionRef?: string
}

const tools = [
  {
    name: 'adf_participant_list_assignments',
    description: 'Read only the approved or pending local assignments for this runtime participant and assigned role.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'adf_participant_get_assignment',
    description: 'Read one bounded assignment, including its scope, hashes, acceptance, and Owner approval state.',
    inputSchema: { type: 'object', properties: { assignmentId: { type: 'string' } }, required: ['assignmentId'], additionalProperties: false }
  },
  {
    name: 'adf_participant_submit_result',
    description: 'Submit a bounded local result for an Owner Packet-bound dispatched assignment. Does not write Canonical repos or alter Frontdoor completion.',
    inputSchema: {
      type: 'object',
      properties: {
        assignmentId: { type: 'string' },
        requestHash: { type: 'string' },
        planHash: { type: 'string' },
        targetHash: { type: 'string' },
        assignmentHash: { type: 'string' },
        summary: { type: 'string' },
        content: { type: 'string' },
        verification: { type: 'array' },
        risks: { type: 'array' }
      },
      required: ['assignmentId', 'requestHash', 'planHash', 'targetHash', 'assignmentHash', 'summary', 'content', 'verification', 'risks'],
      additionalProperties: false
    }
  }
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requestId(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' || value === null ? value : null
}

function safeIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,240}$/.test(value) || value.includes('..')) throw new Error(`invalid ${label}`)
  return value
}

function argsObject(value: unknown): Record<string, unknown> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new Error('tool arguments must be an object')
  if (JSON.stringify(value).length > maxInputChars) throw new Error('tool arguments exceed the input limit')
  return value
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length) throw new Error(`unknown tool argument: ${unknown.join(', ')}`)
}

function response(id: string | number | null, result: unknown): McpJsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

function protocolError(id: string | number | null, code: number, message: string): McpJsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function toolResult(value: unknown, isError = false): McpToolCallResult {
  const text = JSON.stringify(value)
  return { content: [{ type: 'text', text: text.length > maxOutputChars ? `${text.slice(0, maxOutputChars)}...` : text }], ...(isError ? { isError: true } : {}) }
}

function safeToolError(error: unknown, runtimeRoot: string): string {
  return maskSecrets(String((error as Error)?.message ?? error).replaceAll(runtimeRoot, '<runtime-root>'))
    .replace(/\s+/g, ' ')
    .slice(0, 500)
}

function boundedList(values: unknown, limit: number): string[] {
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string').slice(0, limit).map((value) => value.slice(0, 500)) : []
}

function protocolVersion(requested: unknown): string {
  if (typeof requested !== 'string' || requested.length === 0) return serverProtocolVersion
  if ((supportedProtocolVersions as readonly string[]).includes(requested)) return requested
  throw new Error(`unsupported MCP protocol version: ${requested}`)
}

function nodeApproval(events: Awaited<ReturnType<typeof readRunEvents>>, run: OrchestrationRun, node: DecompositionNode): { nodeApproved: boolean; packetDispatchApproved: boolean } {
  const targetHash = nodeTargetHash(run, { node })
  const nodeApproved = events.some((event) => event.type === 'frontdoor.node-approved' && event.payload.nodeId === node.nodeId && event.payload.nodeTargetHash === targetHash)
  const packetDispatchApproved = events.some((event) => event.type === 'frontdoor.approval-bound'
    && event.payload.targetHash
    && Array.isArray(event.payload.nodeIds)
    && event.payload.nodeIds.includes(node.nodeId)
    && isRecord(event.payload.packetHashes)
    && typeof event.payload.packetHashes[node.nodeId] === 'string')
  return { nodeApproved, packetDispatchApproved }
}

export class ParticipantMcpServer {
  readonly runtimeRoot: string
  readonly participantId: string
  readonly participantRole: ParticipantRole

  constructor({ runtimeRoot, participantId, participantRole }: ParticipantMcpOptions) {
    validateParticipantAssignment(participantId, participantRole, ['read'])
    if (!participantRoles.includes(participantRole)) throw new Error(`participant MCP does not expose the frontdoor role: ${participantRole}`)
    this.runtimeRoot = path.resolve(runtimeRoot)
    this.participantId = participantId
    this.participantRole = participantRole
  }

  async handle(request: unknown): Promise<McpJsonRpcResponse | undefined> {
    if (!isRecord(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return protocolError(null, -32600, 'Invalid Request')
    const id = requestId(request.id)
    if (request.method.startsWith('notifications/')) return undefined
    try {
      if (request.method === 'ping') return response(id, {})
      if (request.method === 'initialize') {
        const params = isRecord(request.params) ? request.params : {}
        return response(id, {
          protocolVersion: protocolVersion(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'adf-participant-mcp', version: '0.1.0' },
          instructions: `Participant ${this.participantId} is assigned role ${this.participantRole} for the current Phase/Task only. Owner approval is required before dispatch.`
        })
      }
      if (request.method === 'server/discover') return response(id, { protocolVersions: [...supportedProtocolVersions], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'adf-participant-mcp', version: '0.1.0' } })
      if (request.method === 'tools/list') return response(id, { tools })
      if (request.method !== 'tools/call') return protocolError(id, -32601, `Method not found: ${request.method}`)
      const params = isRecord(request.params) ? request.params : {}
      if (typeof params.name !== 'string') return protocolError(id, -32602, 'tools/call requires a tool name')
      try {
        return response(id, await this.callTool(params.name, argsObject(params.arguments)))
      } catch (error) {
        return response(id, toolResult({ error: safeToolError(error, this.runtimeRoot) }, true))
      }
    } catch (error) {
      return protocolError(id, -32602, safeToolError(error, this.runtimeRoot))
    }
  }

  private async listAssignments(): Promise<ParticipantAssignmentView[]> {
    const safeRoot = await assertRuntimeRootSafe(this.runtimeRoot)
    const runsRoot = path.join(safeRoot, 'frontdoor-runs')
    let entries
    try {
      entries = await readdir(runsRoot, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const assignments: ParticipantAssignmentView[] = []
    for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
      const runId = safeIdentifier(entry.name, 'runId')
      const run = await readProjectedRun(safeRoot, runId, { repair: false })
      const request = await readRequest(safeRoot, runId)
      const plan = await readPlan(safeRoot, runId)
      if (plan.planHash !== run.planHash || request.inputHash !== run.requestHash) throw new Error(`participant assignment binding mismatch: ${runId}`)
      const events = await readRunEvents(safeRoot, runId)
      for (const record of run.nodes) {
        const node = record.node
        const assignment = node.participantAssignment
        if (!assignment || assignment.participantId !== this.participantId || assignment.role !== this.participantRole) continue
        const id = participantAssignmentId(runId, node)
        const approval = nodeApproval(events, run, node)
        const submissionRef = `participant-submissions/${this.participantId}/${id}.json`
        let existingSubmission = false
        try {
          await safeRuntimePath(safeRoot, submissionRef)
          existingSubmission = true
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        assignments.push({
          assignmentId: id,
          assignmentHash: hashJson(assignment),
          runId,
          requestId: request.requestId,
          nodeId: node.nodeId,
          objective: node.objective.slice(0, 2_000),
          role: assignment.role,
          participantId: assignment.participantId,
          capabilities: [...assignment.capabilities],
          scope: { inScope: boundedList(node.scope.inScope, 50), outOfScope: boundedList(node.scope.outOfScope, 50) },
          contextReferences: boundedList(node.contextReferences, 50),
          acceptance: boundedList(node.acceptance, 50),
          stopConditions: boundedList(node.stopConditions, 50),
          requestHash: run.requestHash,
          planHash: run.planHash,
          targetHash: nodeTargetHash(run, { node }),
          nodeState: record.state,
          ownerNodeApproved: approval.nodeApproved,
          ownerPacketDispatchApproved: approval.packetDispatchApproved,
          ...(existingSubmission ? { submissionRef } : {})
        })
      }
    }
    return assignments
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    switch (name) {
      case 'adf_participant_list_assignments':
        onlyKeys(args, [])
        return toolResult({ participantId: this.participantId, participantRole: this.participantRole, assignments: await this.listAssignments() })
      case 'adf_participant_get_assignment': {
        onlyKeys(args, ['assignmentId'])
        const id = safeIdentifier(args.assignmentId, 'assignmentId')
        const assignment = (await this.listAssignments()).find((candidate) => candidate.assignmentId === id)
        if (!assignment) throw new Error(`assignment not found for this participant and role: ${id}`)
        return toolResult(assignment)
      }
      case 'adf_participant_submit_result': {
        onlyKeys(args, ['assignmentId', 'requestHash', 'planHash', 'targetHash', 'assignmentHash', 'summary', 'content', 'verification', 'risks'])
        const id = safeIdentifier(args.assignmentId, 'assignmentId')
        const assignment = (await this.listAssignments()).find((candidate) => candidate.assignmentId === id)
        if (!assignment) throw new Error(`assignment not found for this participant and role: ${id}`)
        if (!assignment.ownerPacketDispatchApproved) throw new Error('Owner Packet-bound Dispatch approval is required before participant submission')
        if (args.requestHash !== assignment.requestHash || args.planHash !== assignment.planHash || args.targetHash !== assignment.targetHash || args.assignmentHash !== assignment.assignmentHash) throw new Error('participant submission binding hash mismatch')
        if (typeof args.summary !== 'string' || args.summary.trim().length === 0 || args.summary.length > 2_000) throw new Error('summary must be non-empty and at most 2000 characters')
        if (typeof args.content !== 'string' || args.content.length > 12_000) throw new Error('content must be at most 12000 characters')
        if (!Array.isArray(args.verification) || args.verification.length > 20 || !args.verification.every((entry) => isRecord(entry) && typeof entry.name === 'string' && ['pass', 'fail', 'not-run'].includes(String(entry.status)))) throw new Error('verification is invalid')
        if (!Array.isArray(args.risks) || args.risks.length > 20 || !args.risks.every((risk) => typeof risk === 'string')) throw new Error('risks is invalid')
        const submission: ParticipantSubmission = {
          submissionId: `submission-${hashJson([this.participantId, id, args.targetHash]).slice(0, 24)}`,
          assignmentId: id,
          participantId: this.participantId,
          participantRole: this.participantRole,
          runId: assignment.runId,
          requestId: assignment.requestId,
          nodeId: assignment.nodeId,
          requestHash: assignment.requestHash,
          planHash: assignment.planHash,
          targetHash: assignment.targetHash,
          assignmentHash: assignment.assignmentHash,
          status: 'submitted',
          summary: args.summary,
          content: args.content,
          verification: args.verification.map((entry) => ({ name: String((entry as Record<string, unknown>).name).slice(0, 500), status: (entry as Record<string, unknown>).status as 'pass' | 'fail' | 'not-run', ...((entry as Record<string, unknown>).reason ? { reason: String((entry as Record<string, unknown>).reason).slice(0, 500) } : {}) })),
          risks: args.risks.map((risk) => String(risk).slice(0, 500)),
          createdAt: new Date().toISOString()
        }
        // Ingress guard, before the submission reaches disk. `validateResultEnvelope` closes the
        // Adapter answer path; this is the same contract for the participant path.
        assertNoCredentialShapedText('participant submission', submissionScanFields(submission))
        const safeRoot = await assertRuntimeRootSafe(this.runtimeRoot)
        const directory = path.join(safeRoot, 'participant-submissions', this.participantId)
        const submissionPath = path.join(directory, `${id}.json`)
        await ensureDir(directory)
        await assertNoSymlinkComponents(safeRoot, directory)
        await assertNoSymlinkComponents(safeRoot, submissionPath)
        await writeJsonExclusive(submissionPath, submission)
        return toolResult({ accepted: true, submissionRef: `participant-submissions/${this.participantId}/${id}.json`, runId: assignment.runId, nodeId: assignment.nodeId, nextAction: 'ADF Frontdoor must ingest and bind this local submission before Result review.' })
      }
      default:
        throw new Error(`unknown tool: ${name}`)
    }
  }
}

export interface ParticipantMcpArgs {
  runtimeRoot: string
  participantId: string
  participantRole: ParticipantRole
}

export function parseParticipantMcpArgs(args: readonly string[]): ParticipantMcpArgs {
  if (args.length !== 6 || args[0] !== '--runtime-root' || !args[1] || args[1].startsWith('--') || args[2] !== '--participant-id' || !args[3] || args[3].startsWith('--') || args[4] !== '--participant-role' || !args[5] || args[5].startsWith('--')) throw new Error('participant-mcp requires --runtime-root <path> --participant-id <id> --participant-role <role>')
  if (!participantRoles.includes(args[5] as ParticipantRole)) throw new Error(`participant-mcp role must be one of: ${participantRoles.join(', ')}`)
  return { runtimeRoot: path.resolve(args[1]), participantId: args[3], participantRole: args[5] as ParticipantRole }
}

export async function runParticipantMcpStdio(options: ParticipantMcpArgs, input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout, errorOutput: NodeJS.WritableStream = process.stderr): Promise<void> {
  const server = new ParticipantMcpServer(options)
  const reader: Interface = createInterface({ input, crlfDelay: Infinity })
  const pending: Promise<void>[] = []
  reader.on('line', (line) => {
    if (!line.trim()) return
    const work = (async () => {
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        parsed = null
      }
      const result = await server.handle(parsed)
      if (result) output.write(`${JSON.stringify(result)}\n`)
    })().catch((error) => {
      errorOutput.write(`${safeToolError(error, server.runtimeRoot)}\n`)
    })
    pending.push(work)
  })
  await new Promise<void>((resolve) => reader.once('close', resolve))
  await Promise.all(pending)
}
