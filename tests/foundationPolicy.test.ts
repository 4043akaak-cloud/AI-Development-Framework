import { describe, expect, it } from 'vitest'
import { canSendExternalContext, canUseFoundationSnapshotForExecution, childJobStaysWithinParent, isReadOnlyFoundationGrant } from '../src/shared/foundationPolicy'
import type { CapabilityGrantSnapshot, JobSnapshot } from '../src/shared/controlPlaneTypes'

const grant: CapabilityGrantSnapshot = { id: 'g', taskId: 'T', scopeHash: 'h', capabilities: ['read', 'propose'], expiresAt: '2026-08-04', state: 'expired', note: 'display' }
const parent: JobSnapshot = { id: 'parent', taskId: 'T', adapterId: 'a', state: 'paused', stopReason: 'stop', capabilityCeiling: ['read', 'propose'] }

describe('read-only foundation policy', () => {
  it('never turns a display grant into executable authority', () => expect(canUseFoundationSnapshotForExecution(grant)).toBe(false))
  it('accepts only read/propose as display-only grant capabilities', () => {
    expect(isReadOnlyFoundationGrant(grant)).toBe(true)
    expect(isReadOnlyFoundationGrant({ ...grant, capabilities: ['external-send'] })).toBe(false)
    expect(isReadOnlyFoundationGrant({ ...grant, state: 'not-issued' })).toBe(false)
  })
  it('rejects child jobs that exceed the parent capability ceiling or lineage', () => {
    expect(childJobStaysWithinParent(parent, { ...parent, id: 'child', parentId: 'parent' })).toBe(true)
    expect(childJobStaysWithinParent(parent, { ...parent, id: 'child', parentId: 'other' })).toBe(false)
    expect(childJobStaysWithinParent(parent, { ...parent, id: 'child', parentId: 'parent', capabilityCeiling: ['write-canonical'] })).toBe(false)
  })
  it('never permits external context sends from this MVP', () => {
    expect(canSendExternalContext('public')).toBe(false)
    expect(canSendExternalContext('project-limited')).toBe(false)
    expect(canSendExternalContext('secret-auth')).toBe(false)
    expect(canSendExternalContext('unknown')).toBe(false)
  })
})
