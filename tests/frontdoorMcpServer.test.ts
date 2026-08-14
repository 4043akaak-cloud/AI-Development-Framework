import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket, Capability } from '../src/shared/jobLoopTypes'
import { buildExplicitAdapterPlan } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { buildDecisionEnvelope, dispatchTargetHash } from '../src/main/frontdoor/ownerGates'
import { recordRunEvent } from '../src/main/frontdoor/ledger'
import { FrontdoorMcpServer, parseMcpRuntimeRoot } from '../src/cli/frontdoorMcpServer'

function input(requestId: string) {
  const scope = { inScope: ['mcp-test'], outOfScope: ['external-send', 'write-canonical'] }
  return {
    request: {
      requestId,
      source: 'codex',
      objective: 'MCP経由のFrontdoor投入を検証する',
      userInput: 'MCP fixture input',
      projectRef: 'fixture://adf-mcp',
      constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
      requestedOutput: 'Run status',
      contextReferences: ['fixture://adf-mcp'],
      scope
    },
    plan: {
      planId: `${requestId}-plan`,
      requestId,
      version: 1,
      nodes: [{ nodeId: 'proposal', objective: 'MCP fixture proposal', role: 'proposal', adapterId: 'fake-ai-a', scope, contextReferences: ['fixture://adf-mcp'], acceptance: ['Result'], stopConditions: ['out of scope'], capabilities: ['read', 'propose'], dependsOn: [], depth: 1 }],
      aggregationPolicy: 'collect-all'
    }
  }
}

function approvedPacket(requestId: string, run: { runId: string; requestHash: string; planHash: string }): ApprovedTaskPacket {
  const document = input(requestId)
  const node = document.plan.nodes[0]
  const capabilities = node.capabilities as Capability[]
  const adapterPlan = buildExplicitAdapterPlan(`${requestId}::proposal`, 'fake-ai-a', 'proposal', capabilities)
  const context = { githubTask: 'fixture://adf-mcp', obsidianContext: ['fixture://adf-mcp'], adoptedPrinciples: ['owner-approval'] }
  return {
    taskId: `${requestId}::proposal`,
    objective: node.objective,
    scope: node.scope,
    scopeHash: hashJson(node.scope),
    context,
    contextHash: hashJson(context),
    acceptance: node.acceptance,
    stopConditions: node.stopConditions,
    approval: { approvalId: `approval-${requestId}`, taskId: `${requestId}::proposal`, status: 'active', approvedBy: 'Project Owner', approvedAt: '2026-08-14T00:00:00.000Z', expiresAt: '2099-12-31T00:00:00.000Z', scopeHash: hashJson(node.scope), routingPlanHash: hashJson(adapterPlan), capabilities },
    adapter: 'frontdoor-child',
    fixtureMode: 'success',
    target: { repository: 'fixture://adf-mcp', branch: 'fixture/frontdoor', worktree: 'fixture://frontdoor', allowedFiles: ['docs/tasks/fixture.md'], forbiddenChanges: ['external-send', 'write-canonical', 'commit', 'push'] },
    adapterPlan,
    frontdoorBinding: { runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: node.nodeId }
  }
}

async function writeApprovedPacket(runtimeRoot: string, packet: ApprovedTaskPacket): Promise<void> {
  await mkdir(path.join(runtimeRoot, 'approved-tasks'), { recursive: true })
  await writeFile(path.join(runtimeRoot, 'approved-tasks', `${packet.taskId}.json`), `${JSON.stringify(packet)}\n`, 'utf8')
}

async function call(server: FrontdoorMcpServer, id: number, name: string, args: Record<string, unknown> = {}) {
  return server.handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })
}

describe('ADF-MCP-001 local Frontdoor MCP server', () => {
  it('negotiates initialize and lists only the bounded Frontdoor tools', async () => {
    const server = new FrontdoorMcpServer({ runtimeRoot: await mkdtemp(path.join(os.tmpdir(), 'adf-mcp-protocol-')) })
    const initialized = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } } })
    expect(initialized?.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } } })
    const listed = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect((listed?.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)).toEqual([
      'adf_frontdoor_prepare', 'adf_frontdoor_inspect', 'adf_frontdoor_dispatch_approved', 'adf_frontdoor_get_result', 'adf_frontdoor_list_runs'
    ])
  })

  it('prepares a Run without creating an Owner Decision or dispatch', async () => {
    const server = new FrontdoorMcpServer({ runtimeRoot: await mkdtemp(path.join(os.tmpdir(), 'adf-mcp-prepare-')) })
    const result = await call(server, 1, 'adf_frontdoor_prepare', input('mcp-prepare-001'))
    expect(result?.result).toMatchObject({ content: [{ type: 'text' }] })
    const payload = JSON.parse((result?.result as { content: Array<{ text: string }> }).content[0].text) as { state: string; ownerGate: string; runId: string }
    expect(payload.state).toBe('ready-for-approval')
    expect(payload.ownerGate).toBe('awaiting-owner:intake')
    const inspected = await call(server, 2, 'adf_frontdoor_inspect', { runId: payload.runId })
    const inspection = JSON.parse((inspected?.result as { content: Array<{ text: string }> }).content[0].text) as { decisions: unknown[]; run: { state: string } }
    expect(inspection.run.state).toBe('ready-for-approval')
    expect(inspection.decisions).toHaveLength(0)
  })

  it('returns tool errors for unknown tools, malformed arguments, missing Results, and dispatch without approved Packets', async () => {
    const server = new FrontdoorMcpServer({ runtimeRoot: await mkdtemp(path.join(os.tmpdir(), 'adf-mcp-negative-')) })
    const unknown = await call(server, 1, 'unknown_tool')
    expect(unknown?.result).toMatchObject({ isError: true })
    const malformed = await call(server, 2, 'adf_frontdoor_inspect', { runId: '../escape' })
    expect(malformed?.result).toMatchObject({ isError: true })
    const resultMissing = await call(server, 3, 'adf_frontdoor_get_result', { runId: 'missing-run' })
    expect(resultMissing?.result).toMatchObject({ isError: true })
    const prepared = await call(server, 4, 'adf_frontdoor_prepare', input('mcp-dispatch-001'))
    const runId = JSON.parse((prepared?.result as { content: Array<{ text: string }> }).content[0].text).runId as string
    const dispatch = await call(server, 5, 'adf_frontdoor_dispatch_approved', { runId })
    expect(dispatch?.result).toMatchObject({ isError: true })
  })

  it('dispatches only after the Owner Decision is bound to the approved Packet hash', async () => {
    const server = new FrontdoorMcpServer({ runtimeRoot: await mkdtemp(path.join(os.tmpdir(), 'adf-mcp-approved-')) })
    const requestId = 'mcp-approved-001'
    const prepared = await call(server, 1, 'adf_frontdoor_prepare', input(requestId))
    const runId = JSON.parse((prepared?.result as { content: Array<{ text: string }> }).content[0].text).runId as string
    const run = await server.frontdoor.getRun(runId)
    const packet = approvedPacket(requestId, run)
    await writeApprovedPacket(server.runtimeRoot, packet)
    await server.frontdoor.approveIntake(runId)
    await server.frontdoor.approveCompletionShape(runId)
    await server.frontdoor.approveDecomposition(runId)
    await server.frontdoor.approveDispatch(runId, ['proposal'])

    const dispatched = await call(server, 2, 'adf_frontdoor_dispatch_approved', { runId })
    const result = JSON.parse((dispatched?.result as { content: Array<{ text: string }> }).content[0].text) as { status: string; runId: string }
    expect(result).toMatchObject({ status: 'complete', runId })

    const persisted = await call(server, 3, 'adf_frontdoor_get_result', { runId })
    expect(persisted?.result).toMatchObject({ content: [{ type: 'text' }] })
    expect(JSON.parse((persisted?.result as { content: Array<{ text: string }> }).content[0].text).results[0].adapterId).toBe('fake-ai-a')
  })

  it('rejects a legacy non-Packet-bound Dispatch Decision before any child send', async () => {
    const server = new FrontdoorMcpServer({ runtimeRoot: await mkdtemp(path.join(os.tmpdir(), 'adf-mcp-legacy-')) })
    const requestId = 'mcp-legacy-001'
    const prepared = await call(server, 1, 'adf_frontdoor_prepare', input(requestId))
    const runId = JSON.parse((prepared?.result as { content: Array<{ text: string }> }).content[0].text).runId as string
    const run = await server.frontdoor.getRun(runId)
    await writeApprovedPacket(server.runtimeRoot, approvedPacket(requestId, run))
    const decision = buildDecisionEnvelope(run, 'dispatch', 'dispatch', dispatchTargetHash(run, ['proposal']), 'Project Owner', '2026-08-14T00:00:00.000Z')
    await recordRunEvent(server.runtimeRoot, runId, 'frontdoor.owner-decision-recorded', { decision })

    const rejected = await call(server, 2, 'adf_frontdoor_dispatch_approved', { runId })
    const body = JSON.parse((rejected?.result as { content: Array<{ text: string }> }).content[0].text) as { error: string }
    expect(rejected?.result).toMatchObject({ isError: true })
    expect(body.error).toContain('Packet-bound Owner Decision')
    expect(await server.frontdoor.relay.listThreads()).toEqual([])
  })

  it('rejects arbitrary runtime roots from tool arguments and invalid server args', async () => {
    const server = new FrontdoorMcpServer({ runtimeRoot: await mkdtemp(path.join(os.tmpdir(), 'adf-mcp-root-')) })
    const result = await call(server, 1, 'adf_frontdoor_prepare', { ...input('mcp-root-001'), runtimeRoot: '/tmp/other' })
    expect(result?.result).toMatchObject({ isError: true })
    expect(() => parseMcpRuntimeRoot([])).toThrow('mcp requires --runtime-root')
    expect(() => parseMcpRuntimeRoot(['--runtime-root', '/tmp/runtime', '--extra'])).toThrow('mcp requires --runtime-root')
  })
})
