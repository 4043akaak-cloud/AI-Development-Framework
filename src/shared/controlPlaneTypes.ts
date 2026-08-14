export type DataClassification = 'public' | 'project-limited' | 'secret-auth' | 'unknown'
export type Capability = 'read' | 'propose' | 'write-sandbox' | 'write-canonical' | 'external-send' | 'paid-call' | 'push' | 'merge'
export type GrantState = 'not-issued' | 'expired' | 'revoked'
export type JobState = 'not-started' | 'paused' | 'completed-evidence-only'
export type GateState = 'not-ready' | 'awaiting-owner'

export interface AdapterSnapshot { id: string; name: string; connection: 'manual' | 'planned'; dataClassification: DataClassification; status: string }
export interface CapabilityGrantSnapshot { id: string; taskId: string; scopeHash: string; capabilities: readonly Capability[]; expiresAt: string; state: GrantState; note: string }
export interface JobSnapshot { id: string; parentId?: string; taskId: string; adapterId: string; state: JobState; stopReason: string; capabilityCeiling: readonly Capability[] }
export interface ArtifactSnapshot { id: string; taskId: string; inputHash: string; type: 'implementation-evidence' | 'review-plan'; verification: string; sourceId: string }
export interface IntegrationGateSnapshot { taskId: string; state: GateState; checks: ReadonlyArray<{ label: string; complete: boolean }>; ownerDecision: string; stopCondition: string }
