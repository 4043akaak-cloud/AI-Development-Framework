import { createInterface, type Interface } from 'node:readline'
import path from 'node:path'
import { readJson } from '../main/jobLoop/ledger'
import { readRunEvents } from '../main/frontdoor/ledger'
import { hashJson } from '../main/jobLoop/hash'
import type { AdapterResultEnvelope } from '../main/jobLoop/resultEnvelope'
import { createLiveRelay } from '../main/liveRelay'
import { dispatchFrontdoorRun, inspectFrontdoorRun, listFrontdoorRuns, prepareFrontdoorRun, prepareNextRequestFromAcceptedCandidate, proposeFrontdoorObsidianUpdate } from '../main/frontdoor/frontdoorService'
import { FrontdoorOrchestrator } from '../main/frontdoor/orchestrator'
import type { FrontdoorPrepareInput, WorkPlaneArtifactManifest } from '../shared/frontdoorTypes'
import { safeRuntimePath } from '../main/frontdoor/pathIntegrity'
import { readVerifiedWorkPlaneArtifact } from '../main/frontdoor/workPlaneArtifact'
import { buildFrontdoorContextCapsule } from '../main/frontdoor/contextCapsule'

const supportedProtocolVersions = ['2025-03-26', '2025-06-18', '2025-11-25'] as const
const serverProtocolVersion = '2025-06-18'
const maxInputChars = 256_000
const maxResultChars = 12_000
const maxRunSummaries = 50

export interface McpJsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: unknown
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

interface McpServerOptions {
  runtimeRoot: string
  relay?: ConstructorParameters<typeof FrontdoorOrchestrator>[0]['relay']
}

const tools = [
  {
    name: 'adf_frontdoor_prepare',
    description: 'Validate a Request and Plan and create an Intake-gated Frontdoor Run. Does not approve or dispatch.',
    inputSchema: {
      type: 'object',
      properties: { request: { type: 'object' }, plan: { type: 'object' } },
      required: ['request', 'plan'],
      additionalProperties: false
    }
  },
  {
    name: 'adf_frontdoor_prepare_next_request_from_candidate',
    description: 'Create an Intake-gated Request from an accepted Candidate using explicit window-AI Request and Plan input. Validates and records Candidate provenance; does not approve or dispatch.',
    inputSchema: {
      type: 'object',
      properties: { candidateId: { type: 'string' }, request: { type: 'object' }, plan: { type: 'object' } },
      required: ['candidateId', 'request', 'plan'],
      additionalProperties: false
    }
  },
  {
    name: 'adf_frontdoor_inspect',
    description: 'Read a Frontdoor Run, Owner Decisions, Nodes, Evidence, and next Owner action.',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string' } },
      required: ['runId'],
      additionalProperties: false
    }
  },
  {
    name: 'adf_frontdoor_get_context_capsule',
    description: 'Read a deterministic, bounded Context Capsule for a Frontdoor Run. Preserves IDs, hashes, and Evidence references without changing the Runtime Ledger.',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string' }, maxChars: { type: 'integer', minimum: 1000, maximum: 32000 } },
      required: ['runId'],
      additionalProperties: false
    }
  },
  {
    name: 'adf_frontdoor_propose_obsidian_update',
    description: 'Create a pending Obsidian write proposal from a Frontdoor Run. Returns the proposed Markdown and never writes to Obsidian or creates an Owner Decision.',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string' }, relativePath: { type: 'string' } },
      required: ['runId'],
      additionalProperties: false
    }
  },
  {
    name: 'adf_frontdoor_dispatch_approved',
    description: 'Side-effecting action: dispatch only a Run with an existing Owner Packet-bound Dispatch Decision and approved child Packets. Does not create approval.',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string' } },
      required: ['runId'],
      additionalProperties: false
    }
  },
  {
    name: 'adf_frontdoor_get_result',
    description: 'Read a persisted Aggregate and bounded child Result Envelopes for a Frontdoor Run.',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string' } },
      required: ['runId'],
      additionalProperties: false
    }
  },
  {
    name: 'adf_frontdoor_get_workplane_artifact',
    description: 'Read a bounded, Owner-exported Work Plane artifact. This tool never creates approvals or artifacts.',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string' } },
      required: ['runId'],
      additionalProperties: false
    }
  },
  {
    name: 'adf_frontdoor_list_runs',
    description: 'List Frontdoor Run summaries from the fixed local runtime root.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
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
  return { content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) }
}

function safeToolError(error: unknown, runtimeRoot: string): string {
  return String((error as Error)?.message ?? error)
    .replaceAll(runtimeRoot, '<runtime-root>')
    .replace(/(sk-|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,}]+/gi, '$1=<redacted>')
    .replace(/\s+/g, ' ')
    .slice(0, 500)
}

function boundedText(value: unknown, limit = maxResultChars): string | undefined {
  return typeof value === 'string' ? value.slice(0, limit).replace(/(sk-|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,}]+/gi, '$1=<redacted>') : undefined
}

function projectInspection(inspection: Awaited<ReturnType<FrontdoorOrchestrator['inspectRun']>>): Record<string, unknown> {
  return {
    run: {
      runId: inspection.run.runId,
      requestId: inspection.run.requestId,
      requestHash: inspection.run.requestHash,
      planHash: inspection.run.planHash,
      state: inspection.run.state,
      ownerGate: inspection.run.ownerGate,
      approvalIds: inspection.run.approvalIds,
      openQuestionIds: inspection.run.openQuestionIds,
      aggregateResultRef: inspection.run.aggregateResultRef,
      nodes: inspection.run.nodes.map((record) => ({ nodeId: record.node.nodeId, role: record.node.role, adapterId: record.node.adapterId, state: record.state, attempt: record.attempt, childTaskId: record.childTaskId, childJobId: record.childJobId, threadId: record.threadId, resultStatus: record.resultStatus, resultRef: record.resultRef, resultHash: record.resultHash, childInputHash: record.childInputHash, questionIds: record.questionIds, error: boundedText(record.error, 500) }))
    },
    request: { requestId: inspection.request.requestId, source: inspection.request.source, objective: boundedText(inspection.request.objective), projectRef: boundedText(inspection.request.projectRef, 500), requestedOutput: boundedText(inspection.request.requestedOutput), inputHash: inspection.request.inputHash, state: inspection.request.state, sourceCandidateBinding: inspection.request.sourceCandidateBinding },
    plan: { planId: inspection.plan.planId, requestId: inspection.plan.requestId, version: inspection.plan.version, aggregationPolicy: inspection.plan.aggregationPolicy, nodeReviewPolicy: inspection.plan.nodeReviewPolicy, planHash: inspection.plan.planHash, nodes: inspection.plan.nodes.map((node) => ({ nodeId: node.nodeId, objective: boundedText(node.objective, 1000), role: node.role, adapterId: node.adapterId, dependsOn: node.dependsOn, depth: node.depth })) },
    decisions: inspection.decisions.map((decision) => ({ decisionId: decision.decisionId, gate: decision.gate, decision: decision.decision, targetHash: decision.targetHash, approvedBy: boundedText(decision.approvedBy, 120), decidedAt: decision.decidedAt })),
    aggregate: inspection.aggregate ? { aggregateId: inspection.aggregate.aggregateId, runId: inspection.aggregate.runId, status: inspection.aggregate.status, completedNodes: inspection.aggregate.completedNodes, failedNodes: inspection.aggregate.failedNodes, partialNodes: inspection.aggregate.partialNodes, childResults: inspection.aggregate.childResults, openQuestions: inspection.aggregate.openQuestions.map((question) => ({ questionId: question.questionId, nodeId: question.nodeId, kind: question.kind, text: boundedText(question.text, 2000), required: question.required, blocking: question.blocking, status: question.status })), conflicts: inspection.aggregate.conflicts.map((conflict) => boundedText(conflict, 2000)), evidenceRefs: inspection.aggregate.evidenceRefs, ownerDecisionRequired: inspection.aggregate.ownerDecisionRequired, nextAction: boundedText(inspection.aggregate.nextAction, 1000), createdAt: inspection.aggregate.createdAt } : undefined,
    aggregateHash: inspection.aggregateHash,
    evidenceRefs: inspection.evidenceRefs,
    openQuestions: inspection.openQuestions.map((question) => ({ questionId: question.questionId, nodeId: question.nodeId, kind: question.kind, text: boundedText(question.text, 2000), required: question.required, blocking: question.blocking, status: question.status })),
    nextAction: boundedText(inspection.nextAction, 1000),
    nodeReview: inspection.nodeReview,
    eventCount: inspection.eventCount,
    nodeTargetHashes: inspection.nodeTargetHashes,
    activities: inspection.activities,
    goalAlignment: inspection.goalAlignment
  }
}

function protocolVersion(requested: unknown): string {
  if (typeof requested !== 'string' || requested.length === 0) return serverProtocolVersion
  if ((supportedProtocolVersions as readonly string[]).includes(requested)) return requested
  throw new Error(`unsupported MCP protocol version: ${requested}`)
}

function prepareInput(value: Record<string, unknown>): FrontdoorPrepareInput {
  onlyKeys(value, ['request', 'plan'])
  if (!isRecord(value.request) || !isRecord(value.plan)) throw new Error('prepare requires request and plan objects')
  return { request: value.request as unknown as FrontdoorPrepareInput['request'], plan: value.plan as unknown as FrontdoorPrepareInput['plan'] }
}

function requireSuccess<T>(result: { ok: boolean; value?: T; error?: string }): T {
  if (!result.ok || result.value === undefined) throw new Error(result.error ?? 'Frontdoor operation failed')
  return result.value
}

export class FrontdoorMcpServer {
  readonly runtimeRoot: string
  readonly frontdoor: FrontdoorOrchestrator

  constructor({ runtimeRoot, relay }: McpServerOptions) {
    this.runtimeRoot = path.resolve(runtimeRoot)
    this.frontdoor = new FrontdoorOrchestrator({ relay: relay ?? createLiveRelay(this.runtimeRoot) })
  }

  async handle(request: unknown): Promise<McpJsonRpcResponse | undefined> {
    if (!isRecord(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return protocolError(null, -32600, 'Invalid Request')
    const id = requestId(request.id)
    const method = request.method
    if (method.startsWith('notifications/')) return undefined
    try {
      if (method === 'ping') return response(id, {})
      if (method === 'initialize') {
        const params = isRecord(request.params) ? request.params : {}
        return response(id, {
          protocolVersion: protocolVersion(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'adf-frontdoor-mcp', version: '0.1.0' },
          instructions: 'Owner approval remains in the ADF UI or CLI. MCP never creates Owner Decisions.'
        })
      }
      if (method === 'server/discover') {
        return response(id, { protocolVersions: [...supportedProtocolVersions], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'adf-frontdoor-mcp', version: '0.1.0' } })
      }
      if (method === 'tools/list') return response(id, { tools })
      if (method !== 'tools/call') return protocolError(id, -32601, `Method not found: ${method}`)

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

  private async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    switch (name) {
      case 'adf_frontdoor_prepare': {
        const prepared = requireSuccess(await prepareFrontdoorRun(this.frontdoor, prepareInput(args)))
        return toolResult({ runId: prepared.run.runId, requestId: prepared.run.requestId, state: prepared.run.state, ownerGate: prepared.run.ownerGate, requestHash: prepared.run.requestHash, planHash: prepared.run.planHash, reused: prepared.reused, nextAction: prepared.run.ownerGate })
      }
      case 'adf_frontdoor_prepare_next_request_from_candidate': {
        onlyKeys(args, ['candidateId', 'request', 'plan'])
        if (!isRecord(args.request) || !isRecord(args.plan)) throw new Error('candidate Request preparation requires request and plan objects')
        const prepared = requireSuccess(await prepareNextRequestFromAcceptedCandidate(this.frontdoor, {
          candidateId: safeIdentifier(args.candidateId, 'candidateId'),
          request: args.request as never,
          plan: args.plan as never
        }))
        return toolResult({ runId: prepared.run.runId, requestId: prepared.run.requestId, state: prepared.run.state, ownerGate: prepared.run.ownerGate, requestHash: prepared.run.requestHash, planHash: prepared.run.planHash, reused: prepared.reused, sourceCandidateBinding: prepared.sourceCandidateBinding, nextAction: prepared.run.ownerGate })
      }
      case 'adf_frontdoor_inspect': {
        onlyKeys(args, ['runId'])
        const inspection = requireSuccess(await inspectFrontdoorRun(this.frontdoor, safeIdentifier(args.runId, 'runId')))
        return toolResult(projectInspection(inspection))
      }
      case 'adf_frontdoor_get_context_capsule': {
        onlyKeys(args, ['runId', 'maxChars'])
        const runId = safeIdentifier(args.runId, 'runId')
        const maxCharsValue = args.maxChars
        if (maxCharsValue !== undefined && (typeof maxCharsValue !== 'number' || !Number.isInteger(maxCharsValue) || maxCharsValue < 1_000 || maxCharsValue > 32_000)) throw new Error('maxChars must be an integer between 1000 and 32000')
        const maxChars = typeof maxCharsValue === 'number' ? maxCharsValue : undefined
        const inspection = requireSuccess(await inspectFrontdoorRun(this.frontdoor, runId))
        return toolResult(buildFrontdoorContextCapsule(inspection, { maxChars }))
      }
      case 'adf_frontdoor_propose_obsidian_update': {
        onlyKeys(args, ['runId', 'relativePath'])
        const proposal = requireSuccess(await proposeFrontdoorObsidianUpdate(this.frontdoor, { runId: safeIdentifier(args.runId, 'runId'), relativePath: args.relativePath }))
        return toolResult(proposal)
      }
      case 'adf_frontdoor_dispatch_approved': {
        onlyKeys(args, ['runId'])
        const runId = safeIdentifier(args.runId, 'runId')
        const result = requireSuccess(await dispatchFrontdoorRun(this.frontdoor, runId, { requirePacketBinding: true }))
        const inspection = requireSuccess(await inspectFrontdoorRun(this.frontdoor, runId))
        return toolResult({ requestId: result.requestId, runId: result.runId, status: inspection.run.state, ownerGate: inspection.run.ownerGate, aggregateStatus: result.status, summary: boundedText(result.summary, 2000), childResultRefs: result.childResultRefs, evidenceRefs: result.evidenceRefs, openQuestions: result.openQuestions.map((question) => ({ questionId: question.questionId, nodeId: question.nodeId, kind: question.kind, text: boundedText(question.text, 2000), blocking: question.blocking, status: question.status })), unresolvedRisks: result.unresolvedRisks.map((risk) => boundedText(risk, 2000)), ownerDecisionRequired: result.ownerDecisionRequired, nextAction: boundedText(result.nextAction, 1000) })
      }
      case 'adf_frontdoor_list_runs': {
        onlyKeys(args, [])
        return toolResult(requireSuccess(await listFrontdoorRuns(this.frontdoor)).slice(0, maxRunSummaries))
      }
      case 'adf_frontdoor_get_result': {
        onlyKeys(args, ['runId'])
        const runId = safeIdentifier(args.runId, 'runId')
        const inspection = requireSuccess(await inspectFrontdoorRun(this.frontdoor, runId))
        if (!inspection.aggregate) throw new Error('Frontdoor Run has no Aggregate Result yet')
        const results = []
        for (const child of inspection.aggregate.childResults) {
          if (!child.resultRef) continue
          const resultPath = await safeRuntimePath(this.runtimeRoot, child.resultRef)
          const result = await readJson<AdapterResultEnvelope>(resultPath)
          const record = inspection.run.nodes.find((candidate) => candidate.node.nodeId === child.nodeId)
          if (!record || record.resultRef !== child.resultRef || record.resultHash !== hashJson(result) || !record.childJobId || result.jobId !== record.childJobId || result.taskId !== record.childTaskId) throw new Error(`Frontdoor Result binding mismatch: ${child.nodeId}`)
          results.push({ nodeId: child.nodeId, status: child.status, resultRef: child.resultRef, resultHash: hashJson(result), jobId: result.jobId, taskId: result.taskId, adapterId: result.adapterId, role: result.role, summary: boundedText(result.summary, 2000), content: boundedText(result.content), verification: result.verification, risks: result.risks.map((risk) => boundedText(risk, 2000)), dependencyResults: result.dependencyResults?.map((dependency) => ({ nodeId: dependency.nodeId, resultHash: dependency.resultHash, status: dependency.status, content: boundedText(dependency.content, 2000) })), ownerDecisionRequired: result.ownerDecisionRequired, nextOwnerDecision: boundedText(result.nextOwnerDecision, 1000) })
        }
        return toolResult({ runId, state: inspection.run.state, ownerGate: inspection.run.ownerGate, aggregate: inspection.aggregate, results })
      }
      case 'adf_frontdoor_get_workplane_artifact': {
        onlyKeys(args, ['runId'])
        const runId = safeIdentifier(args.runId, 'runId')
        const inspection = requireSuccess(await inspectFrontdoorRun(this.frontdoor, runId))
        const events = await readRunEvents(this.runtimeRoot, runId)
        const artifact = events.find((event) => event.type === 'frontdoor.owner-decision-recorded' && event.payload?.artifact)
        if (!artifact?.payload?.artifact || !isRecord(artifact.payload.artifact)) throw new Error('Frontdoor Run has no exported Work Plane artifact')
        const manifest = artifact.payload.artifact as Record<string, unknown>
        const relativePath = manifest.relativePath
        if (typeof relativePath !== 'string') throw new Error('Work Plane artifact manifest path is invalid')
        const verified = await readVerifiedWorkPlaneArtifact(this.runtimeRoot, runId, manifest as unknown as WorkPlaneArtifactManifest)
        return toolResult({ runId, state: inspection.run.state, ownerGate: inspection.run.ownerGate, manifest: verified.manifest, artifact: verified.content })
      }
      default:
        throw new Error(`unknown tool: ${name}`)
    }
  }
}

export async function runFrontdoorMcpStdio(runtimeRoot: string, input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout, errorOutput: NodeJS.WritableStream = process.stderr): Promise<void> {
  const server = new FrontdoorMcpServer({ runtimeRoot })
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

export function parseMcpRuntimeRoot(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== '--runtime-root' || !args[1] || args[1].startsWith('--')) throw new Error('mcp requires --runtime-root <path>')
  return path.resolve(args[1])
}
