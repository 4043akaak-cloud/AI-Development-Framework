import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { AdapterRole, ApprovedTaskPacket, Capability, JobScope } from '../shared/jobLoopTypes'
import type { DecompositionNode, DecompositionPlanInput, FrontdoorPrepareInput, FrontdoorRequestInput, OrchestrationRun } from '../shared/frontdoorTypes'
import { buildExplicitAdapterPlan } from '../main/jobLoop/adapterRegistry'
import { hashJson } from '../main/jobLoop/hash'
import { readJson, writeJsonExclusive } from '../main/jobLoop/ledger'
import { checkOllamaReadiness, defaultOllamaBaseUrl, defaultOllamaModel, OllamaLocalHttpTransport } from '../main/jobLoop/ollamaTransport'
import { createLiveRelay } from '../main/liveRelay'
import { readFrontdoorEvents, validateFrontdoorEventChain } from '../main/frontdoor/eventLedger'
import { dispatchFrontdoorRun, prepareFrontdoorRun } from '../main/frontdoor/frontdoorService'
import { FrontdoorOrchestrator } from '../main/frontdoor/orchestrator'
import type { ConversationRelay } from '../main/jobLoop/relay'
import type { AdapterResultEnvelope } from '../main/jobLoop/resultEnvelope'

const adapterId = 'ollama-local'
const contextReference = 'fixture://adf-frontdoor-ollama-two-node-e2e'
const capabilities: Capability[] = ['read', 'propose']

function scope(): JobScope {
  return {
    inScope: ['Ollama Proposal and Critic two-node local verification', 'Result and Evidence binding'],
    outOfScope: ['external-send', 'canonical-write', 'commit', 'push', 'merge', 'Work Plane']
  }
}

function node(nodeId: string, role: AdapterRole, dependsOn: string[] = []): DecompositionNode {
  return {
    nodeId,
    objective: role === 'proposal' ? '提案を作成する' : '提案を批評し、改善点を返す',
    role,
    adapterId,
    scope: scope(),
    contextReferences: [contextReference],
    acceptance: ['構造化Resultを返す'],
    stopConditions: ['Scope外要求', 'local-only境界不一致'],
    capabilities,
    dependsOn,
    depth: dependsOn.length > 0 ? 2 : 1
  }
}

export function buildFrontdoorOllamaE2eInput(requestId: string): FrontdoorPrepareInput {
  const proposal = node('proposal', 'proposal')
  const critic = node('critic', 'critic', ['proposal'])
  const request: FrontdoorRequestInput = {
    requestId,
    source: 'owner',
    objective: 'OllamaでProposalとCriticの2 Node依存実行を検証する',
    userInput: 'ADF Frontdoorの実Ollama 2 Node E2E検証',
    projectRef: 'AI-Development-Framework',
    constraints: { allowedCapabilities: capabilities, maxNodes: 2, maxDepth: 2, externalSend: false },
    requestedOutput: 'Proposal Result、Critic Result、Aggregate Evidence',
    contextReferences: [contextReference],
    scope: scope()
  }
  const plan: DecompositionPlanInput = {
    planId: `${requestId}-plan`,
    requestId,
    version: 1,
    nodes: [proposal, critic],
    aggregationPolicy: 'collect-all',
    nodeReviewPolicy: 'auto-continue-safe'
  }
  return { request, plan }
}

export function buildFrontdoorOllamaChildPacket(run: OrchestrationRun, node_: DecompositionNode): ApprovedTaskPacket {
  const taskId = `${run.requestId}::${node_.nodeId}`
  const adapterPlan = buildExplicitAdapterPlan(taskId, adapterId, node_.role, node_.capabilities)
  const packetScope = node_.scope
  const context = { githubTask: contextReference, obsidianContext: [], adoptedPrinciples: ['owner-approval', 'local-only', 'evidence-before-completion'] }
  return {
    taskId,
    objective: node_.objective,
    scope: packetScope,
    scopeHash: hashJson(packetScope),
    context,
    contextHash: hashJson(context),
    acceptance: node_.acceptance,
    stopConditions: node_.stopConditions,
    approval: {
      approvalId: `approval-${taskId}`,
      taskId,
      status: 'active',
      approvedBy: 'Frontdoor Packet Contract (Dispatch Gate required)',
      approvedAt: new Date().toISOString(),
      expiresAt: '2099-12-31T23:59:59.000Z',
      scopeHash: hashJson(packetScope),
      routingPlanHash: hashJson(adapterPlan),
      capabilities: node_.capabilities
    },
    adapter: 'frontdoor-live-local',
    fixtureMode: 'success',
    target: {
      repository: 'fixture://adf-frontdoor-ollama-two-node-e2e',
      branch: 'fixture/frontdoor-ollama-two-node-e2e',
      worktree: 'fixture://frontdoor-ollama-two-node-e2e',
      allowedFiles: [],
      forbiddenChanges: ['external-send', 'write-canonical', 'commit', 'push', 'merge']
    },
    adapterPlan,
    frontdoorBinding: { runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: node_.nodeId }
  }
}

function argument(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  const value = index >= 0 ? args[index + 1] : undefined
  return value && !value.startsWith('--') ? value : undefined
}

export function assertLocalSendConfirmation(args: readonly string[]): void {
  if (!args.includes('--confirm-local-send')) throw new Error('--confirm-local-send is required immediately before the one local Ollama Run')
}

export async function assertFrontdoorOllamaEvidence(runtimeRoot: string, runId: string, relay: ConversationRelay): Promise<ReadonlyArray<{ nodeId: string; jobId: string; threadId: string; resultRef: string }>> {
  const frontdoor = new FrontdoorOrchestrator({ relay })
  const run = await frontdoor.getRun(runId)
  if (run.state !== 'awaiting-owner' || run.ownerGate !== 'awaiting-owner:result-review') throw new Error('Frontdoor Run is not stopped at Result Review')
  if (run.nodes.length !== 2) throw new Error('Frontdoor Ollama E2E must contain exactly two Nodes')

  const summaries: Array<{ nodeId: string; jobId: string; threadId: string; resultRef: string }> = []
  for (const record of run.nodes) {
    if (record.state !== 'completed' || record.node.adapterId !== adapterId || !record.childJobId || !record.threadId || !record.resultRef || !record.resultHash || !record.childInputHash) {
      throw new Error(`Frontdoor Node evidence is incomplete: ${record.node.nodeId}`)
    }
    const result = await readJson<AdapterResultEnvelope>(path.join(runtimeRoot, record.resultRef))
    if (result.jobId !== record.childJobId || result.taskId !== record.childTaskId || result.adapterId !== adapterId || result.role !== record.node.role || result.inputHash !== record.childInputHash || result.orchestrationRunId !== runId || result.status !== 'success' || hashJson(result) !== record.resultHash) {
      throw new Error(`Frontdoor Result binding mismatch: ${record.node.nodeId}`)
    }

    const thread = await readJson<{ jobId: string; taskId: string; state: string; turns: Array<{ adapterId: string; role: string; orchestrationRunId?: string; resultEnvelopeRef?: string; resultEnvelopeHash?: string }> }>(path.join(runtimeRoot, 'threads', record.threadId, 'thread.json'))
    const turn = thread.turns[0]
    if (thread.jobId !== record.childJobId || thread.taskId !== record.childTaskId || thread.state !== 'awaiting-owner' || !turn || turn.adapterId !== adapterId || turn.role !== record.node.role || turn.orchestrationRunId !== runId || turn.resultEnvelopeRef !== record.resultRef || turn.resultEnvelopeHash !== record.resultHash) {
      throw new Error(`Frontdoor Thread binding mismatch: ${record.node.nodeId}`)
    }

    const evidence = await readJson<{ jobId: string; turns: Array<{ adapterId: string; role: string; resultEnvelopeRef?: string }> }>(path.join(runtimeRoot, 'threads', record.threadId, 'evidence-links.json'))
    if (evidence.jobId !== record.childJobId || !evidence.turns.some((entry) => entry.adapterId === adapterId && entry.role === record.node.role && entry.resultEnvelopeRef === record.resultRef)) {
      throw new Error(`Frontdoor Evidence link mismatch: ${record.node.nodeId}`)
    }
    const callRecords = (await readFile(path.join(runtimeRoot, 'threads', record.threadId, 'external-calls.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as { adapterId?: string; role?: string; jobId?: string; status?: string; packetHash?: string })
    const successfulCall = callRecords.find((call) => call.adapterId === adapterId && call.role === record.node.role && call.jobId === record.childJobId && call.status === 'success')
    if (!successfulCall?.packetHash) {
      throw new Error(`Frontdoor external-call Ledger mismatch: ${record.node.nodeId}`)
    }
    const threadEvents = (await readFile(path.join(runtimeRoot, 'threads', record.threadId, 'thread-events.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as { type?: string; packetHash?: string })
    if (!threadEvents.some((event) => event.type === 'external.preflight-passed' && event.packetHash === successfulCall.packetHash)) throw new Error(`Frontdoor preflight/call packet hash mismatch: ${record.node.nodeId}`)

    for (const file of ['request.json', 'adapter-plan.json', 'approval.json', 'dispatch-packet.json', 'dispatch-ack.json']) {
      await readJson<unknown>(path.join(runtimeRoot, 'jobs', record.childJobId, file))
    }
    const adapterPlan = await readJson<{ selections?: Array<{ adapterId?: string; role?: string }> }>(path.join(runtimeRoot, 'jobs', record.childJobId, 'adapter-plan.json'))
    if (adapterPlan.selections?.length !== 1 || adapterPlan.selections[0]?.adapterId !== adapterId || adapterPlan.selections[0]?.role !== record.node.role) throw new Error(`Frontdoor Job adapter plan mismatch: ${record.node.nodeId}`)
    summaries.push({ nodeId: record.node.nodeId, jobId: record.childJobId, threadId: record.threadId, resultRef: record.resultRef })
  }

  const proposal = await readJson<AdapterResultEnvelope>(path.join(runtimeRoot, run.nodes.find((record) => record.node.nodeId === 'proposal')!.resultRef!))
  const critic = await readJson<AdapterResultEnvelope>(path.join(runtimeRoot, run.nodes.find((record) => record.node.nodeId === 'critic')!.resultRef!))
  const dependency = critic.dependencyResults?.find((entry) => entry.nodeId === 'proposal')
  if (!dependency || dependency.resultHash !== hashJson(proposal) || dependency.content !== proposal.content) throw new Error('Critic dependency Result content/hash is not bound to Proposal')
  return summaries
}

function requireResult<T>(result: { ok: boolean; value?: T; error?: string }, label: string): T {
  if (!result.ok || result.value === undefined) throw new Error(`${label} failed: ${result.error ?? 'unknown error'}`)
  return result.value
}

export async function runFrontdoorOllamaE2eProbe(args: readonly string[]): Promise<number> {
  const runtimeRoot = argument(args, '--runtime-root')
  const requestId = argument(args, '--request-id')
  const baseUrl = argument(args, '--base-url') ?? defaultOllamaBaseUrl
  const model = argument(args, '--model') ?? defaultOllamaModel
  const dispatch = args.includes('--dispatch')
  if (!runtimeRoot || !requestId) {
    process.stderr.write('required: --runtime-root <path> --request-id <id>\n')
    return 1
  }
  const relay = createLiveRelay(runtimeRoot, { baseUrl, model })
  const frontdoor = new FrontdoorOrchestrator({ relay })
  const input = buildFrontdoorOllamaE2eInput(requestId)
  const prepared = requireResult(await prepareFrontdoorRun(frontdoor, input), 'prepare')
  if (!prepared.reused) {
    const packets = Object.fromEntries(prepared.run.nodes.map((record) => [record.node.nodeId, buildFrontdoorOllamaChildPacket(prepared.run, record.node)]))
    for (const packet of Object.values(packets)) {
      await writeJsonExclusive(path.join(runtimeRoot, 'approved-tasks', `${packet.taskId}.json`), packet)
    }
  }

  process.stdout.write(JSON.stringify({ prepared: true, reused: prepared.reused, runId: prepared.run.runId, nodeIds: prepared.run.nodes.map((record) => record.node.nodeId), nextAction: 'Owner must approve intake, completion-shape, decomposition, and dispatch through the existing CLI/UI before --dispatch' }, null, 2) + '\n')
  if (!dispatch) return 0

  if (prepared.reused && (prepared.run.state !== 'ready-for-approval' || prepared.run.nodes.some((record) => record.attempt > 0 || record.childJobId || record.threadId || record.resultRef))) {
    process.stderr.write('stopped: this request already has an execution attempt; refusing a second local Ollama Run\n')
    return 1
  }

  try {
    assertLocalSendConfirmation(args)
  } catch (error) {
    process.stderr.write(`stopped: ${(error as Error).message}\n`)
    return 1
  }

  const transport = new OllamaLocalHttpTransport({ baseUrl, model })
  if (!transport.isLocalEndpoint()) {
    process.stderr.write('stopped: configured Ollama endpoint is not loopback\n')
    return 1
  }
  const readiness = await checkOllamaReadiness({ baseUrl, model })
  process.stdout.write(`readiness: ${JSON.stringify(readiness)}\n`)
  if (!readiness.reachable || !readiness.modelPresent) {
    process.stderr.write('stopped: Ollama is unreachable or the requested model is missing\n')
    return 1
  }

  process.stdout.write(`dispatching one local Ollama Run: ${prepared.run.runId}\n`)
  const returned = requireResult(await dispatchFrontdoorRun(frontdoor, prepared.run.runId), 'dispatch')
  // Rebuild the live graph before inspection to exercise the persisted Run/Thread/Result paths,
  // not only the in-memory Relay instance that performed the send.
  const reloadedRelay = createLiveRelay(runtimeRoot, { baseUrl, model })
  const evidence = await assertFrontdoorOllamaEvidence(runtimeRoot, prepared.run.runId, reloadedRelay)
  const events = await readFrontdoorEvents(runtimeRoot, prepared.run.runId)
  validateFrontdoorEventChain(events, prepared.run.runId)
  const reloadedFrontdoor = new FrontdoorOrchestrator({ relay: reloadedRelay })
  const inspection = await reloadedFrontdoor.inspectRun(prepared.run.runId)
  const threads = await reloadedRelay.listThreads()
  process.stdout.write(JSON.stringify({ runId: prepared.run.runId, returned, evidence, inspection, threads, eventCount: events.length }, null, 2) + '\n')
  return 0
}

const invokedDirectly = process.argv[1]?.endsWith('frontdoorOllamaE2eProbe.js') || process.argv[1]?.endsWith('frontdoorOllamaE2eProbe.ts')
if (invokedDirectly) {
  runFrontdoorOllamaE2eProbe(process.argv.slice(2)).then((code) => { process.exitCode = code }).catch((error) => {
    process.stderr.write(`${(error as Error).stack ?? String(error)}\n`)
    process.exitCode = 1
  })
}
