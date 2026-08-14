import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket } from '../src/shared/jobLoopTypes'
import type { DecompositionNode, FrontdoorRequestInput, OrchestrationRun } from '../src/shared/frontdoorTypes'
import { buildExplicitAdapterPlan } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { readJson } from '../src/main/jobLoop/ledger'
import { runFrontdoorCli, type FrontdoorCliIO } from '../src/cli/frontdoorOwnerLoop'
import { readFrontdoorEvents } from '../src/main/frontdoor/eventLedger'

const scope = { inScope: ['proposal'], outOfScope: ['external-send', 'write-canonical', 'commit', 'push'] }
const request: FrontdoorRequestInput = {
  requestId: 'frontdoor-cli-test-001',
  source: 'test',
  objective: 'CLI Owner Loopを検証する',
  userInput: 'Fake AdapterをOwner承認付きで一周させる',
  projectRef: 'fixture://adf-cli',
  constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
  requestedOutput: 'CLIから確認可能なResult',
  contextReferences: ['fixture://goal.md'],
  scope
}
const node: DecompositionNode = {
  nodeId: 'proposal',
  objective: request.objective,
  role: 'proposal',
  adapterId: 'fake-ai-a',
  scope,
  contextReferences: ['fixture://goal.md'],
  acceptance: ['Result EnvelopeとEvidenceを返す'],
  stopConditions: ['Scope外要求'],
  capabilities: ['read', 'propose'],
  dependsOn: [],
  depth: 1
}
const gateDecisions = { intake: 'proceed', 'completion-shape': 'approve', decomposition: 'approve-selected', dispatch: 'dispatch' } as const

function inputDocument() {
  return { request, plan: { planId: 'frontdoor-cli-plan-001', requestId: request.requestId, version: 1, nodes: [node], aggregationPolicy: 'collect-all' as const } }
}

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-cli-'))
  const runtimeRoot = path.join(root, 'runtime')
  const inputPath = path.join(root, 'input.json')
  await writeFile(inputPath, `${JSON.stringify(inputDocument())}\n`, 'utf8')
  return { root, runtimeRoot, inputPath }
}

function io(): { adapter: FrontdoorCliIO; stdout: string[]; stderr: string[] } {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    stdout,
    stderr,
    adapter: {
      readJsonFile: async (filePath) => JSON.parse(await readFile(filePath, 'utf8')) as unknown,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text)
    }
  }
}

async function prepare(runtimeRoot: string, inputPath: string): Promise<{ run: OrchestrationRun; output: string[]; errors: string[] }> {
  const capture = io()
  const code = await runFrontdoorCli(['prepare', '--runtime-root', runtimeRoot, '--input', inputPath, '--json'], capture.adapter)
  expect(code).toBe(0)
  const result = JSON.parse(capture.stdout[0]) as { runId: string }
  const run = await readJson<OrchestrationRun>(path.join(runtimeRoot, 'frontdoor-runs', result.runId, 'run.json'))
  return { run, output: capture.stdout, errors: capture.stderr }
}

async function packetFile(root: string, run: Pick<OrchestrationRun, 'runId' | 'requestHash' | 'planHash'>): Promise<string> {
  const taskId = `${request.requestId}::proposal`
  const adapterPlan = buildExplicitAdapterPlan(taskId, node.adapterId, node.role, node.capabilities)
  const context = { githubTask: 'fixture://goal.md', obsidianContext: ['fixture://goal.md'], adoptedPrinciples: ['owner-approval'] }
  const packet: ApprovedTaskPacket = {
    taskId,
    objective: node.objective,
    scope: node.scope,
    scopeHash: hashJson(node.scope),
    context,
    contextHash: hashJson(context),
    acceptance: node.acceptance,
    stopConditions: node.stopConditions,
    approval: { approvalId: 'approval-frontdoor-cli-001', taskId, status: 'active', approvedBy: 'Project Owner', approvedAt: '2026-08-14T00:00:00.000Z', expiresAt: '2099-12-31T00:00:00.000Z', scopeHash: hashJson(node.scope), routingPlanHash: hashJson(adapterPlan), capabilities: node.capabilities },
    adapter: 'frontdoor-child',
    fixtureMode: 'success',
    target: { repository: 'fixture://adf-cli', branch: 'fixture/frontdoor-cli', worktree: 'fixture://frontdoor-cli', allowedFiles: ['docs/tasks/fixture.md'], forbiddenChanges: ['external-send', 'write-canonical', 'commit', 'push'] },
    adapterPlan,
    frontdoorBinding: { runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: node.nodeId }
  }
  const filePath = path.join(root, 'packets.json')
  await writeFile(filePath, `${JSON.stringify({ proposal: packet })}\n`, 'utf8')
  return filePath
}

async function command(args: string[]) {
  const capture = io()
  const code = await runFrontdoorCli(args, capture.adapter)
  return { code, stdout: capture.stdout, stderr: capture.stderr }
}

describe('Frontdoor Owner Loop CLI', () => {
  it('shows help and rejects unknown or incomplete commands', async () => {
    const help = await command([])
    expect(help.code).toBe(0)
    expect(help.stdout[0]).toContain('prepare')
    const unknown = await command(['unknown'])
    expect(unknown.code).toBe(1)
    expect(unknown.stderr.join('')).toContain('unknown frontdoor command')
    const missing = await command(['prepare'])
    expect(missing.code).toBe(1)
    expect(missing.stderr.join('')).toContain('--input')
    const implicitOwner = await command(['approve', '--runtime-root', '/tmp/adf-no-run', '--run-id', 'run-missing', '--gate', 'intake', '--decision', 'proceed'])
    expect(implicitOwner.code).toBe(1)
    expect(implicitOwner.stderr.join('')).toContain('--approved-by')
    const ignoredDecision = await command(['approve', '--runtime-root', '/tmp/adf-no-run', '--run-id', 'run-missing', '--gate', 'intake', '--decision', 'reject', '--approved-by', 'Project Owner'])
    expect(ignoredDecision.code).toBe(1)
    expect(ignoredDecision.stderr.join('')).toContain('requires --decision proceed')
  })

  it('prepare creates only a proposal and no Owner Decision, dispatch, or thread', async () => {
    const fixture = await setup()
    const prepared = await prepare(fixture.runtimeRoot, fixture.inputPath)
    const events = await readFrontdoorEvents(fixture.runtimeRoot, prepared.run.runId)
    expect(events.map((event) => event.type)).toEqual(['frontdoor.run-created', 'frontdoor.owner-gate-opened'])
    await expect(stat(path.join(fixture.runtimeRoot, 'threads'))).rejects.toThrow()
  })

  it('inspect is read-only and exposes hashes, decisions, evidence, and next action', async () => {
    const fixture = await setup()
    const prepared = await prepare(fixture.runtimeRoot, fixture.inputPath)
    const runPath = path.join(fixture.runtimeRoot, 'frontdoor-runs', prepared.run.runId, 'run.json')
    const before = await readFile(runPath, 'utf8')
    const inspected = await command(['inspect', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--json'])
    expect(inspected.code).toBe(0)
    const view = JSON.parse(inspected.stdout[0]) as { run: OrchestrationRun; plan: { planHash: string }; evidence: string[]; nextAction: string }
    expect(view.run.requestHash).toBe(prepared.run.requestHash)
    expect(view.plan.planHash).toBe(prepared.run.planHash)
    expect(view.evidence).toEqual([])
    expect(view.nextAction).toContain('intake')
    expect(await readFile(runPath, 'utf8')).toBe(before)
  })

  it('requires all preceding Owner Gates before dispatch and records each separately', async () => {
    const fixture = await setup()
    const prepared = await prepare(fixture.runtimeRoot, fixture.inputPath)
    const packets = await packetFile(fixture.root, prepared.run)
    const rejected = await command(['dispatch', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--packets', packets])
    expect(rejected.code).toBe(1)
    expect(rejected.stderr.join('')).toMatch(/matching Owner Decision|approved Intake/)
    for (const gate of ['intake', 'completion-shape', 'decomposition'] as const) {
      const approved = await command(['approve', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--gate', gate, '--decision', gateDecisions[gate], '--approved-by', 'Project Owner'])
      expect(approved.code).toBe(0)
    }
    const dispatchApproval = await command(['approve', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--gate', 'dispatch', '--decision', 'dispatch', '--nodes', 'proposal', '--approved-by', 'Project Owner'])
    expect(dispatchApproval.code).toBe(0)
    const events = await readFrontdoorEvents(fixture.runtimeRoot, prepared.run.runId)
    const decisions = events.filter((event) => event.type === 'frontdoor.owner-decision-recorded')
    expect(decisions.map((event) => (event.payload.decision as { gate: string }).gate)).toEqual(['intake', 'completion-shape', 'decomposition', 'dispatch'])
  })

  it('runs the complete Fake Adapter loop through separate CLI commands', async () => {
    const fixture = await setup()
    const prepared = await prepare(fixture.runtimeRoot, fixture.inputPath)
    const packets = await packetFile(fixture.root, prepared.run)
    for (const gate of ['intake', 'completion-shape', 'decomposition'] as const) {
      expect((await command(['approve', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--gate', gate, '--decision', gateDecisions[gate], '--approved-by', 'Project Owner'])).code).toBe(0)
    }
    expect((await command(['approve', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--gate', 'dispatch', '--decision', 'dispatch', '--nodes', 'proposal', '--approved-by', 'Project Owner'])).code).toBe(0)
    const dispatched = await command(['dispatch', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--packets', packets, '--json'])
    expect(dispatched.code).toBe(0)
    expect(JSON.parse(dispatched.stdout[0]).result.status).toBe('complete')
    const reviewed = await command(['review-result', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--decision', 'accept', '--approved-by', 'Project Owner'])
    expect(reviewed.code).toBe(0)
    const completed = await command(['complete', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--approved-by', 'Project Owner'])
    expect(completed.code).toBe(0)
    expect(JSON.parse(completed.stdout[0]).run.state).toBe('complete')
  })

  it('rejects review-free completion, duplicate dispatch, and answer without explicit content', async () => {
    const fixture = await setup()
    const prepared = await prepare(fixture.runtimeRoot, fixture.inputPath)
    const packets = await packetFile(fixture.root, prepared.run)
    for (const gate of ['intake', 'completion-shape', 'decomposition'] as const) await command(['approve', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--gate', gate, '--decision', gateDecisions[gate], '--approved-by', 'Project Owner'])
    await command(['approve', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--gate', 'dispatch', '--decision', 'dispatch', '--nodes', 'proposal', '--approved-by', 'Project Owner'])
    expect((await command(['dispatch', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--packets', packets])).code).toBe(0)
    expect((await command(['complete', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId])).code).toBe(1)
    expect((await command(['dispatch', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--packets', packets])).code).toBe(1)
    const noQuestion = await command(['answer', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--question-id', 'missing', '--approved-by', 'Project Owner'])
    expect(noQuestion.code).toBe(1)
  })

  it('stop is explicit and does not make a later dispatch possible', async () => {
    const fixture = await setup()
    const prepared = await prepare(fixture.runtimeRoot, fixture.inputPath)
    const stopped = await command(['stop', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--approved-by', 'Project Owner', '--note', 'Owner stop'])
    expect(stopped.code).toBe(0)
    expect(JSON.parse(stopped.stdout[0]).run.state).toBe('cancelled')
    const events = await readFrontdoorEvents(fixture.runtimeRoot, prepared.run.runId)
    expect(events.some((event) => event.type === 'frontdoor.owner-decision-recorded' && (event.payload.decision as { decision?: string }).decision === 'stop')).toBe(true)
    const packets = await packetFile(fixture.root, prepared.run)
    const dispatch = await command(['dispatch', '--runtime-root', fixture.runtimeRoot, '--run-id', prepared.run.runId, '--packets', packets])
    expect(dispatch.code).toBe(1)
    expect(dispatch.stderr.join('')).toMatch(/not ready|cancelled/)
  })
})
