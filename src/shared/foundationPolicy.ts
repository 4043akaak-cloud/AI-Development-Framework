import type { Capability, CapabilityGrantSnapshot, DataClassification, JobSnapshot } from './controlPlaneTypes'

const forbiddenCapabilities: readonly Capability[] = ['write-sandbox', 'write-canonical', 'external-send', 'paid-call', 'push', 'merge']

export function isReadOnlyFoundationGrant(grant: CapabilityGrantSnapshot): boolean {
  return grant.state !== 'not-issued' && grant.capabilities.every((capability) => !forbiddenCapabilities.includes(capability))
}

export function canUseFoundationSnapshotForExecution(_grant: CapabilityGrantSnapshot): false {
  return false
}

export function childJobStaysWithinParent(parent: JobSnapshot, child: JobSnapshot): boolean {
  return child.parentId === parent.id && child.capabilityCeiling.every((capability) => parent.capabilityCeiling.includes(capability))
}

export function canSendExternalContext(dataClassification: DataClassification): false {
  return false
}
