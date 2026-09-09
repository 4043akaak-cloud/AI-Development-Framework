import { describe, expect, it } from 'vitest'
import { buildPolicyProbePacket, policyProbe, policyProbes, type PolicyProbeId } from '../src/main/jobLoop/policyProbe'
import { PacketBoundaryError, assertPacketBoundary } from '../src/main/jobLoop/syntheticPacket'
import type { SyntheticPacket } from '../src/shared/externalAdapterTypes'

const base = {
  taskId: 'adf-probe-001',
  threadId: 'thread-1111111111111111',
  jobId: 'job-2222222222222222',
  role: 'proposal' as const,
  sequence: 0,
  attempt: 0,
  scopeHash: 'a'.repeat(64),
  contextHash: 'b'.repeat(64),
  createdAt: '2026-09-09T00:00:00.000Z'
}

describe('policy probes', () => {
  it('covers every clause the Adapter contract says to measure', () => {
    expect(policyProbes().map((probe) => probe.id)).toEqual([
      'capability-escalation',
      'scope-drift',
      'untrusted-instruction',
      'credential-request',
      'format-contract',
      'stop-condition'
    ])
  })

  it('records what a pass looks like, so the sheet is not filled in from memory', () => {
    for (const probe of policyProbes()) {
      expect(probe.measures.length, probe.id).toBeGreaterThan(0)
      expect(probe.passes.length, probe.id).toBeGreaterThan(0)
    }
  })

  it('refuses an unknown probe id instead of inventing one', () => {
    expect(() => policyProbe('nope' as PolicyProbeId)).toThrow(/unknown policy probe/)
  })
})

describe('buildPolicyProbePacket', () => {
  /**
   * The constraint that shaped the wording. `assertPacketBoundary` blocks `api[_-]?key`, `bearer`,
   * `authorization` and `sk-…`, so the obvious phrasing of the credential probe would have been
   * refused on the way out — a probe that cannot leave measures nothing.
   */
  it('lets every probe past ADF’s own egress check', () => {
    for (const probe of policyProbes()) {
      const packet = buildPolicyProbePacket({ ...base, probeId: probe.id })
      expect(() => assertPacketBoundary(packet), probe.id).not.toThrow()
    }
  })

  it('binds the hash to the content like the connectivity probe does', () => {
    const packet = buildPolicyProbePacket({ ...base, probeId: 'scope-drift' })
    const tampered: SyntheticPacket = { ...packet, instruction: `${packet.instruction} extra` }
    expect(() => assertPacketBoundary(tampered)).toThrow(PacketBoundaryError)
  })

  it('names the probe in the instruction so a Result can be traced back to it', () => {
    expect(buildPolicyProbePacket({ ...base, probeId: 'stop-condition' }).instruction).toContain('[stop-condition]')
  })

  it('states up front that it is synthetic, so a probe is never mistaken for real work', () => {
    const packet = buildPolicyProbePacket({ ...base, probeId: 'capability-escalation' })
    expect(packet.instruction).toContain('実プロジェクトの作業依頼ではない')
  })

  it('carries no project content beyond the identifiers it was given', () => {
    const packet = buildPolicyProbePacket({ ...base, probeId: 'credential-request' })
    const serialised = JSON.stringify(packet)
    expect(serialised).not.toContain('secondbrain')
    expect(serialised).not.toContain('AI-Development-Framework')
    expect(packet.dependencyContext).toBeUndefined()
  })

  it('produces a distinct packet per probe', () => {
    const hashes = policyProbes().map((probe) => buildPolicyProbePacket({ ...base, probeId: probe.id }).packetHash)
    expect(new Set(hashes).size).toBe(hashes.length)
  })
})

describe('packet kind allowlist', () => {
  /**
   * The egress check used to compare against one literal. Widening it to a comparison against
   * "anything the caller says" would have made adding a probe the thing that removed the boundary.
   */
  it('admits the two named kinds and nothing else', () => {
    const connectivity = { ...buildPolicyProbePacket({ ...base, probeId: 'scope-drift' }) }
    const unknown = { ...connectivity, kind: 'synthetic-anything' as SyntheticPacket['kind'] }
    expect(() => assertPacketBoundary(unknown)).toThrow(/kind is not allowed to leave ADF/)
  })

  it('still refuses a packet that smuggles a path or a URL', () => {
    const packet = buildPolicyProbePacket({ ...base, probeId: 'scope-drift' })
    for (const smuggled of ['/Users/someone/secret', 'https://example.com', '~/notes']) {
      expect(() => assertPacketBoundary({ ...packet, instruction: smuggled }), smuggled).toThrow(PacketBoundaryError)
    }
  })
})
