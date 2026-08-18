export type ObsidianWriteProposalStatus = 'pending-owner'

export interface ObsidianWriteProposal {
  schemaVersion: 1
  proposalId: string
  runId: string
  requestId: string
  status: ObsidianWriteProposalStatus
  target: {
    relativePath?: string
    requiresOwnerPathConfirmation: boolean
  }
  source: {
    requestHash: string
    planHash: string
    aggregateHash?: string
    capsuleId: string
  }
  markdown: string
  createdAt: string
}
