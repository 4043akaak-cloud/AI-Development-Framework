import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket, Capability } from '../src/shared/jobLoopTypes'
import { buildExplicitAdapterPlan } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { createLiveRelay } from '../src/main/liveRelay'
import { FrontdoorOrchestrator } from '../src/main/frontdoor/orchestrator'
import { buildMcpChildEnv, McpStdioClient, type McpStdioChild } from '../src/cli/frontdoorMcpClient'

const cliEntry = path.resolve(process.cwd(), 'out/cli/cli/bin.js')

function input(requestId: string) {
  const scope = { inScope: ['mcp-client-e2e'], outOfScope: ['external-send', 'write-canonical', 'commit', 'push'] }
  return {
    request: {
      requestId,
      source: 'test',
      objective: '実MCP clientのstdio接続を検証する',
      userInput: 'MCP clientからprepare、Owner Gate、dispatch、Result取得までを検証する',
      projectRef: 'fixture://adf-mcp-client-e2e',
      constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
      requestedOutput: 'MCP client E2E Result',
      contextReferences: ['fixture://adf-mcp-client-e2e'],
      scope
    },
    plan: {
      planId: `${requestId}-plan`,
      requestId,
      version: 1,
      nodes: [{ nodeId: 'proposal', objective: 'MCP client E2E Proposal', role: 'proposal', adapterId: 'fake-ai-a', scope, contextReferences: ['fixture://adf-mcp-client-e2e'], acceptance: ['Result'], stopConditions: ['scope外'], capabilities: ['read', 'propose'], dependsOn: [], depth: 1 }],
      aggregationPolicy: 'collect-all'
    }
  }
}

function packet(requestId: string, run: { runId: string; requestHash: string; planHash: string }): ApprovedTaskPacket {
  const document = input(requestId)
  const node = document.plan.nodes[0]
  const capabilities = node.capabilities as Capability[]
  const adapterPlan = buildExplicitAdapterPlan(`${requestId}::proposal`, 'fake-ai-a', 'proposal', capabilities)
  const context = { githubTask: 'fixture://adf-mcp-client-e2e', obsidianContext: ['fixture://adf-mcp-client-e2e'], adoptedPrinciples: ['owner-approval', 'mcp-is-not-authority'] }
  return {
    taskId: `${requestId}::proposal`,
    objective: node.objective,
    scope: node.scope,
    scopeHash: hashJson(node.scope),
    context,
    contextHash: hashJson(context),
    acceptance: node.acceptance,
    stopConditions: node.stopConditions,
    approval: { approvalId: `approval-${requestId}`, taskId: `${requestId}::proposal`, status: 'active', approvedBy: 'Project Owner', approvedAt: '2026-08-14T00:00:00.000Z', expiresAt: '2099-12-31T23:59:59.000Z', scopeHash: hashJson(node.scope), routingPlanHash: hashJson(adapterPlan), capabilities },
    adapter: 'frontdoor-child',
    fixtureMode: 'success',
    target: { repository: 'fixture://adf-mcp-client-e2e', branch: 'fixture/frontdoor', worktree: 'fixture://frontdoor', allowedFiles: [], forbiddenChanges: ['external-send', 'write-canonical', 'commit', 'push'] },
    adapterPlan,
    frontdoorBinding: { runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: node.nodeId }
  }
}

function textResult(value: unknown): Record<string, unknown> {
  const content = (value as { content?: Array<{ text?: string }> })?.content
  return JSON.parse(content?.[0]?.text ?? '{}') as Record<string, unknown>
}

async function writeApprovedPacket(runtimeRoot: string, approvedPacket: ApprovedTaskPacket): Promise<void> {
  await mkdir(path.join(runtimeRoot, 'approved-tasks'), { recursive: true })
  await writeFile(path.join(runtimeRoot, 'approved-tasks', `${approvedPacket.taskId}.json`), `${JSON.stringify(approvedPacket)}\n`, 'utf8')
}

function createClient(runtimeRoot: string): McpStdioClient {
  return new McpStdioClient({
    command: process.execPath,
    args: [cliEntry, 'mcp', '--runtime-root', runtimeRoot],
    env: buildMcpChildEnv({ ...process.env, ELECTRON_RUN_AS_NODE: '1' }),
    spawnImpl: (command, args, options) => spawn(command, args, options) as never
  })
}

class FakeMcpChild implements McpStdioChild {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  private readonly events = new Map<string, Array<(...args: unknown[]) => void>>()
  constructor(private readonly mode: 'invalid-json' | 'silent') {
    this.stdin.on('data', () => {
      if (this.mode === 'invalid-json') this.stdout.write('not-json\n')
    })
  }
  kill(): boolean {
    this.emit('close', null, 'SIGTERM')
    return true
  }
  once(event: 'error' | 'close', listener: (...args: unknown[]) => void): this {
    const listeners = this.events.get(event) ?? []
    this.events.set(event, [...listeners, listener])
    return this
  }
  on(event: 'error' | 'close', listener: (...args: unknown[]) => void): this {
    return this.once(event, listener)
  }
  private emit(event: 'error' | 'close', ...args: unknown[]): void {
    for (const listener of this.events.get(event) ?? []) listener(...args)
    this.events.delete(event)
  }
}

describe('ADF-MCP-CLIENT-E2E-001 stdio MCP client', () => {
  it('connects to the real local MCP process and completes a Fake Owner-gated roundtrip', async () => {
    if (!existsSync(cliEntry)) throw new Error('compiled CLI is missing; run tsc -p tsconfig.cli.json before the MCP client E2E test')
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-mcp-client-e2e-'))
    const requestId = 'mcp-client-e2e-001'
    const client = createClient(runtimeRoot)
    const ownerRelay = createLiveRelay(runtimeRoot)
    const owner = new FrontdoorOrchestrator({ relay: ownerRelay })
    try {
      const initialized = await client.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'adf-client-e2e-test', version: '1' } }) as { protocolVersion?: string }
      expect(initialized.protocolVersion).toBe('2025-06-18')

      const listed = await client.request('tools/list') as { tools: Array<{ name: string }> }
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        'adf_frontdoor_prepare', 'adf_frontdoor_prepare_next_request_from_candidate', 'adf_frontdoor_inspect', 'adf_frontdoor_get_context_capsule', 'adf_frontdoor_propose_obsidian_update', 'adf_frontdoor_dispatch_approved', 'adf_frontdoor_get_result', 'adf_frontdoor_get_workplane_artifact', 'adf_frontdoor_list_runs'
      ])

      const prepared = textResult(await client.request('tools/call', { name: 'adf_frontdoor_prepare', arguments: input(requestId) })) as { runId: string; ownerGate: string }
      expect(prepared.ownerGate).toBe('awaiting-owner:intake')
      const run = await owner.getRun(prepared.runId)
      expect(await ownerRelay.listThreads()).toEqual([])

      const capsule = textResult(await client.request('tools/call', { name: 'adf_frontdoor_get_context_capsule', arguments: { runId: prepared.runId, maxChars: 4_000 } })) as { runId: string; compression: { mode: string; actualChars: number; maxChars: number }; source: { requestHash: string; planHash: string } }
      expect(capsule).toMatchObject({ runId: prepared.runId, compression: { mode: 'deterministic', maxChars: 4_000 }, source: { requestHash: run.requestHash, planHash: run.planHash } })
      expect(capsule.compression.actualChars).toBeLessThanOrEqual(4_000)

      await writeApprovedPacket(runtimeRoot, packet(requestId, run))
      const blocked = textResult(await client.request('tools/call', { name: 'adf_frontdoor_dispatch_approved', arguments: { runId: prepared.runId } }))
      expect(blocked.error).toContain('Packet-bound Owner Decision')
      expect(await owner.getRun(prepared.runId)).toMatchObject({ state: 'ready-for-approval', approvalIds: [] })

      await owner.approveIntake(prepared.runId, 'Project Owner')
      await owner.approveCompletionShape(prepared.runId, 'Project Owner')
      await owner.approveDecomposition(prepared.runId, 'Project Owner')
      await owner.approveDispatch(prepared.runId, ['proposal'], 'Project Owner')

      const dispatched = textResult(await client.request('tools/call', { name: 'adf_frontdoor_dispatch_approved', arguments: { runId: prepared.runId } }))
      expect(dispatched).toMatchObject({ runId: prepared.runId, status: 'awaiting-owner', ownerGate: 'awaiting-owner:result-review', aggregateStatus: 'complete' })

      const persisted = textResult(await client.request('tools/call', { name: 'adf_frontdoor_get_result', arguments: { runId: prepared.runId } }))
      expect(persisted).toMatchObject({ runId: prepared.runId })
      expect((persisted.results as Array<{ adapterId: string; status: string }>)[0]).toMatchObject({ adapterId: 'fake-ai-a', status: 'success' })

      const inspected = textResult(await client.request('tools/call', { name: 'adf_frontdoor_inspect', arguments: { runId: prepared.runId } }))
      expect(inspected.decisions).toHaveLength(4)
      const runs = textResult(await client.request('tools/call', { name: 'adf_frontdoor_list_runs', arguments: {} })) as unknown as Array<{ runId: string; packetsReady: boolean }>
      expect(runs).toEqual(expect.arrayContaining([expect.objectContaining({ runId: prepared.runId, packetsReady: true })]))
      expect(client.stderrText).toBe('')
    } finally {
      await client.close()
    }
    expect(client.isClosed).toBe(true)
  })

  it('fails closed when stdout is not JSON-RPC and does not treat raw output as a response', async () => {
    const client = new McpStdioClient({ command: 'fixture', args: [], timeoutMs: 30, spawnImpl: () => new FakeMcpChild('invalid-json') })
    await expect(client.request('ping')).rejects.toThrow('non-JSON stdout')
    await client.close()
    expect(client.isClosed).toBe(true)
  })

  it('fails closed on response timeout and terminates the child process during close', async () => {
    const client = new McpStdioClient({ command: 'fixture', args: [], timeoutMs: 20, spawnImpl: () => new FakeMcpChild('silent') })
    await expect(client.request('ping')).rejects.toThrow('timed out')
    await client.close()
    expect(client.isClosed).toBe(true)
  })

  it('passes only the MCP child environment allowlist', () => {
    const env = buildMcpChildEnv({ PATH: '/bin', HOME: '/tmp/home', ELECTRON_RUN_AS_NODE: '1', ANTHROPIC_API_KEY: 'secret', OLLAMA_API_KEY: 'secret' })
    expect(env).toEqual({ PATH: '/bin', HOME: '/tmp/home', ELECTRON_RUN_AS_NODE: '1' })
  })
})
