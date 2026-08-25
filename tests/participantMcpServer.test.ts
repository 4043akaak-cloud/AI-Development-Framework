import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FrontdoorMcpServer } from '../src/cli/frontdoorMcpServer'
import { parseParticipantMcpArgs, ParticipantMcpServer } from '../src/cli/participantMcpServer'

function input(requestId: string) {
  const scope = { inScope: ['participant-mcp-test'], outOfScope: ['external-send', 'write-canonical'] }
  return {
    request: {
      requestId,
      source: 'test' as const,
      objective: '参加者入口を検証する',
      userInput: 'Cursorは今回のTaskではspecialistとして扱う',
      projectRef: 'fixture://participant-mcp',
      constraints: { allowedCapabilities: ['read', 'propose'] as const, maxNodes: 1, maxDepth: 1, externalSend: false as const },
      requestedOutput: 'bounded participant assignment',
      contextReferences: ['fixture://participant-mcp'],
      scope
    },
    plan: {
      planId: `${requestId}-plan`,
      requestId,
      version: 1,
      nodes: [{
        nodeId: 'specialist',
        objective: '専門参加者の割当を確認する',
        role: 'proposal' as const,
        adapterId: 'fake-ai-a',
        scope,
        contextReferences: ['fixture://participant-mcp'],
        acceptance: ['割当が読める'],
        stopConditions: ['scope外'],
        capabilities: ['read', 'propose'] as const,
        dependsOn: [],
        depth: 1,
        participantAssignment: { participantId: 'cursor', role: 'specialist' as const, capabilities: ['read', 'propose'] as const }
      }],
      aggregationPolicy: 'collect-all' as const
    }
  }
}

function textOf(result: Awaited<ReturnType<ParticipantMcpServer['handle']>>) {
  return JSON.parse((result?.result as { content: Array<{ text: string }> }).content[0].text) as Record<string, unknown>
}

describe('ADF generic participant MCP boundary', () => {
  it('uses a generic participant endpoint and does not expose Frontdoor tools', async () => {
    const server = new ParticipantMcpServer({ runtimeRoot: await mkdtemp(path.join(os.tmpdir(), 'adf-participant-mcp-protocol-')), participantId: 'cursor', participantRole: 'specialist' })
    const initialized = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    expect(initialized?.result).toMatchObject({ serverInfo: { name: 'adf-participant-mcp' } })
    const listed = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect((listed?.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)).toEqual([
      'adf_participant_list_assignments', 'adf_participant_get_assignment', 'adf_participant_submit_result'
    ])
  })

  it('reads a Phase/Task assignment without treating Cursor as a permanent Frontdoor', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-participant-mcp-assignment-'))
    const frontdoor = new FrontdoorMcpServer({ runtimeRoot })
    const prepared = await frontdoor.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'adf_frontdoor_prepare', arguments: input('participant-assignment-001') } })
    const preparedBody = textOf(prepared as never) as { runId: string }
    const participant = new ParticipantMcpServer({ runtimeRoot, participantId: 'cursor', participantRole: 'specialist' })
    const listed = textOf(await participant.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'adf_participant_list_assignments', arguments: {} } })) as { participantId: string; participantRole: string; assignments: Array<Record<string, unknown>> }
    expect(listed).toMatchObject({ participantId: 'cursor', participantRole: 'specialist' })
    expect(listed.assignments).toHaveLength(1)
    expect(listed.assignments[0]).toMatchObject({ runId: preparedBody.runId, nodeId: 'specialist', participantId: 'cursor', role: 'specialist', ownerNodeApproved: false, ownerPacketDispatchApproved: false })
    expect(String(listed.assignments[0].targetHash)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects a Result before Owner Packet-bound Dispatch approval', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-participant-mcp-submit-'))
    const frontdoor = new FrontdoorMcpServer({ runtimeRoot })
    await frontdoor.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'adf_frontdoor_prepare', arguments: input('participant-submit-001') } })
    const participant = new ParticipantMcpServer({ runtimeRoot, participantId: 'cursor', participantRole: 'specialist' })
    const listed = textOf(await participant.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'adf_participant_list_assignments', arguments: {} } })) as { assignments: Array<Record<string, unknown>> }
    const assignment = listed.assignments[0]
    const rejected = await participant.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
      name: 'adf_participant_submit_result',
      arguments: { assignmentId: assignment.assignmentId, requestHash: assignment.requestHash, planHash: assignment.planHash, targetHash: assignment.targetHash, assignmentHash: assignment.assignmentHash, summary: 'not dispatched', content: 'not dispatched', verification: [], risks: [] }
    } })
    expect(rejected?.result).toMatchObject({ isError: true })
    expect(JSON.stringify(rejected)).toContain('Packet-bound Dispatch')
  })

  it('parses only non-frontdoor participant roles', () => {
    expect(parseParticipantMcpArgs(['--runtime-root', '/tmp/runtime', '--participant-id', 'cursor', '--participant-role', 'specialist'])).toMatchObject({ participantId: 'cursor', participantRole: 'specialist' })
    expect(() => parseParticipantMcpArgs(['--runtime-root', '/tmp/runtime', '--participant-id', 'cursor', '--participant-role', 'frontdoor'])).toThrow(/participant-mcp role/)
  })
})
