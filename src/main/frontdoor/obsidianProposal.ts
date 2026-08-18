import path from 'node:path'
import type { FrontdoorInspection } from '../../shared/frontdoorTypes'
import type { ObsidianWriteProposal } from '../../shared/obsidianProposalTypes'
import { hashJson } from '../jobLoop/hash'
import { ensureDir, writeJsonAtomic } from '../jobLoop/ledger'
import { assertRuntimeRootSafe, safeRuntimePath } from './pathIntegrity'
import { buildFrontdoorContextCapsule } from './contextCapsule'

function safeRelativePath(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > 500 || path.isAbsolute(value) || value.includes('..') || value.includes('\\')) throw new Error('invalid Obsidian relativePath')
  return value
}

function markdownFor(inspection: FrontdoorInspection, capsuleId: string): string {
  const lines = [
    `# ADF Phase Update`,
    '',
    `- Run: ${inspection.run.runId}`,
    `- Request: ${inspection.request.requestId}`,
    `- State: ${inspection.run.state}`,
    `- Owner Gate: ${inspection.run.ownerGate ?? 'none'}`,
    '',
    '## Objective',
    '',
    inspection.request.objective.slice(0, 800),
    '',
    '## Current Action',
    '',
    inspection.nextAction.slice(0, 500),
    '',
    '## Participants',
    ''
  ]
  for (const record of inspection.run.nodes.slice(0, 12)) {
    lines.push(`- ${record.node.nodeId}: ${record.node.adapterId} / ${record.node.role} / ${record.state}${record.resultRef ? ` — ${record.resultRef}` : ''}`)
  }
  lines.push('', '## Questions', '')
  if (inspection.openQuestions.length === 0) lines.push('- None')
  else for (const question of inspection.openQuestions.slice(0, 8)) lines.push(`- ${question.questionId}: ${question.text.slice(0, 500)}${question.blocking ? ' (blocking)' : ''}`)
  lines.push('', '## Evidence References', '')
  if (inspection.evidenceRefs.length === 0) lines.push('- None')
  else for (const ref of inspection.evidenceRefs.slice(0, 16)) lines.push(`- ${ref}`)
  lines.push('', `<!-- ADF Context Capsule: ${capsuleId} -->`, '')
  return lines.join('\n')
}

export async function proposeObsidianUpdate(runtimeRoot: string, inspection: FrontdoorInspection, options: { relativePath?: unknown; createdAt?: string } = {}): Promise<ObsidianWriteProposal> {
  const relativePath = safeRelativePath(options.relativePath)
  const capsule = buildFrontdoorContextCapsule(inspection, { maxChars: 8_000, generatedAt: options.createdAt })
  const proposalId = `obsidian-proposal-${hashJson({ runId: inspection.run.runId, requestHash: inspection.run.requestHash, planHash: inspection.run.planHash, aggregateHash: inspection.aggregateHash ?? null, relativePath: relativePath ?? null }).slice(0, 24)}`
  const proposal: ObsidianWriteProposal = {
    schemaVersion: 1,
    proposalId,
    runId: inspection.run.runId,
    requestId: inspection.request.requestId,
    status: 'pending-owner',
    target: { ...(relativePath ? { relativePath } : {}), requiresOwnerPathConfirmation: !relativePath },
    source: { requestHash: inspection.run.requestHash, planHash: inspection.run.planHash, ...(inspection.aggregateHash ? { aggregateHash: inspection.aggregateHash } : {}), capsuleId: capsule.capsuleId },
    markdown: markdownFor(inspection, capsule.capsuleId),
    createdAt: options.createdAt ?? new Date().toISOString()
  }
  await assertRuntimeRootSafe(runtimeRoot)
  const proposalDirectory = `frontdoor-runs/${inspection.run.runId}/obsidian-proposals`
  await ensureDir(path.join(runtimeRoot, proposalDirectory))
  const safeProposalDirectory = await safeRuntimePath(runtimeRoot, proposalDirectory)
  const proposalPath = path.join(safeProposalDirectory, `${proposalId}.json`)
  await writeJsonAtomic(proposalPath, proposal)
  return proposal
}
