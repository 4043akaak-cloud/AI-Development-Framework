import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { proposeObsidianUpdate } from '../src/main/frontdoor/obsidianProposal'
import type { FrontdoorInspection } from '../src/shared/frontdoorTypes'

function inspection(): FrontdoorInspection {
  return {
    run: { runId: 'run-obsidian-001', requestId: 'request-obsidian-001', requestHash: 'a'.repeat(64), planHash: 'b'.repeat(64), state: 'ready-for-approval', ownerGate: 'awaiting-owner:intake', nodes: [], approvalIds: [], openQuestionIds: [], createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z' },
    request: { requestId: 'request-obsidian-001', source: 'codex', objective: 'Obsidian proposal objective', userInput: 'input', projectRef: 'project://adf', constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false }, requestedOutput: 'summary', contextReferences: ['obsidian://adf'], scope: { inScope: [], outOfScope: [] }, state: 'ready-for-decomposition', receivedAt: '2026-08-18T00:00:00.000Z', inputHash: 'c'.repeat(64) },
    plan: { planId: 'plan-obsidian-001', requestId: 'request-obsidian-001', version: 1, nodes: [], aggregationPolicy: 'collect-all', planHash: 'b'.repeat(64) },
    decisions: [], evidenceRefs: [], openQuestions: [], nextAction: 'awaiting-owner:intake', eventCount: 1, nodeTargetHashes: {}, activities: []
  }
}

describe('Obsidian write proposal', () => {
  it('persists a pending proposal under Runtime only', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-obsidian-proposal-'))
    const proposal = await proposeObsidianUpdate(runtimeRoot, inspection(), { relativePath: 'Projects/AI-Development-Framework/update.md', createdAt: '2026-08-18T00:00:00.000Z' })
    const stored = JSON.parse(await readFile(path.join(runtimeRoot, 'frontdoor-runs', inspection().run.runId, 'obsidian-proposals', `${proposal.proposalId}.json`), 'utf8')) as typeof proposal
    expect(stored).toEqual(proposal)
    expect(proposal.status).toBe('pending-owner')
    expect(proposal.markdown).toContain('Obsidian proposal objective')
  })

  it('requires path confirmation when no target path is supplied', async () => {
    const proposal = await proposeObsidianUpdate(await mkdtemp(path.join(os.tmpdir(), 'adf-obsidian-proposal-path-')), inspection())
    expect(proposal.target).toEqual({ requiresOwnerPathConfirmation: true })
  })
})
