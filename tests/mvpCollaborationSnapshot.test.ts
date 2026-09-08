import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ADF minimal Project Board collaboration snapshot', () => {
  it('connects the existing Runtime Thread read path to a clickable Project-level Result view', async () => {
    const source = await readFile(path.join(__dirname, '..', 'src', 'renderer', 'src', 'FrontdoorPanel.tsx'), 'utf8')

    expect(source).toContain('window.adfRelay.listThreads()')
    expect(source).toContain('window.adfRelay.getThread(threadId)')
    expect(source).toContain('aria-label="Project collaboration snapshot"')
    expect(source).toContain('aria-label="選択した協業ThreadのResult"')
    expect(source).toContain('latestThreadTurn?.content')
    expect(source).toContain('latestThreadTurn?.resultEnvelopeRef')
    expect(source).toContain('通常の作業では窓口AIがResultを読みます')
  })
})
