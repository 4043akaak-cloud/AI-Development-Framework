// Self-check for the parts that do not need a model.
//
// Deliberately not placed under tests/: the repo's vitest totals are being
// tracked by another in-flight task, and this must not move that number.
//
//   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tools/arena/selfcheck.mjs

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { parseAnswer } from './adapters.mjs'
import { assertLoopback, runPaths, sha256 } from './common.mjs'
import { buildContextPack, readSourcesFromPack } from './contextpack.mjs'
import { buildPrompt, runArena } from './arena.mjs'
import { buildVerdict, pairClaims, questionFromPrompt, renderVerdictMarkdown } from './verdict.mjs'
import { renderNote } from './obsidian.mjs'
import { checkLinks, extractWikilinks } from './linkcheck.mjs'

const checks = []
const check = (name, fn) => checks.push([name, fn])

const answerRecord = (side, overrides = {}) => ({
  side,
  adapterId: 'x',
  adapterLabel: `adapter-${side}`,
  synthetic: false,
  promptSha256: 'same',
  status: 'ok',
  answer: { recommendation: 'r', claims: [], assumptions: [] },
  ...overrides
})

check('parseAnswer rejects a missing stance', () => {
  assert.equal(parseAnswer('{"recommendation":"r","claims":[{"id":"c1","statement":"s"}]}'), null)
})

check('parseAnswer rejects empty strings', () => {
  assert.equal(parseAnswer('{"recommendation":"","claims":[{"id":"c1","statement":"s","stance":"support"}]}'), null)
  assert.equal(parseAnswer('{"recommendation":"r","claims":[{"id":"c1","statement":"","stance":"support"}]}'), null)
})

check('parseAnswer rejects non-JSON', () => {
  assert.equal(parseAnswer('sure! here is my answer'), null)
})

check('parseAnswer accepts a valid answer and fills a missing id', () => {
  const parsed = parseAnswer('{"recommendation":"r","claims":[{"statement":"s","stance":"oppose"}]}')
  assert.equal(parsed.claims[0].id, 'c1')
  assert.equal(parsed.claims[0].stance, 'oppose')
})

check('pairClaims matches near-identical statements and leaves the rest unpaired', () => {
  const a = [
    { id: 'a1', statement: '型エラーは化粧上の問題である', stance: 'support' },
    { id: 'a2', statement: 'まったく無関係な主張', stance: 'support' }
  ]
  const b = [{ id: 'b1', statement: '型エラーは化粧上の問題であるとは言えない', stance: 'oppose' }]
  const { pairs, unpairedA, unpairedB } = pairClaims(a, b)
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].a.id, 'a1')
  assert.equal(unpairedA.length, 1)
  assert.equal(unpairedB.length, 0)
})

check('buildVerdict refuses to compare when the two prompts differ', () => {
  assert.throws(
    () =>
      buildVerdict({
        runId: 'r',
        question: 'q',
        contextPackSha256: 'c',
        records: [answerRecord('a'), answerRecord('b', { promptSha256: 'different' })]
      }),
    /did not receive the same prompt/
  )
})

check('buildVerdict separates agreement from disagreement', () => {
  const log = buildVerdict({
    runId: 'r',
    question: 'q',
    contextPackSha256: 'c',
    records: [
      answerRecord('a', {
        answer: {
          recommendation: '妥当ではない',
          claims: [{ id: 'a1', statement: '影響範囲を数量で示す必要がある', stance: 'support' }],
          assumptions: []
        }
      }),
      answerRecord('b', {
        answer: {
          recommendation: '妥当である',
          claims: [{ id: 'b1', statement: '影響範囲を数量で示す必要がある', stance: 'oppose' }],
          assumptions: []
        }
      })
    ]
  })
  assert.equal(log.status, 'full')
  assert.equal(log.settled.length, 0)
  assert.ok(log.open.some((item) => item.kind === 'recommendation'))
  assert.ok(log.open.some((item) => item.kind === 'claim-pair'))
})

check('buildVerdict survives one dead side and marks it partial', () => {
  const log = buildVerdict({
    runId: 'r',
    question: 'q',
    contextPackSha256: 'c',
    records: [
      answerRecord('a', { status: 'failed', error: 'timeout', answer: undefined }),
      answerRecord('b', {
        answer: { recommendation: 'x', claims: [{ id: 'b1', statement: 's', stance: 'support' }], assumptions: [] }
      })
    ]
  })
  assert.equal(log.status, 'partial')
  assert.equal(log.open.length, 1)
  assert.ok(log.notes.some((note) => note.includes('failed')))
})

check('buildVerdict flags a synthetic participant', () => {
  const log = buildVerdict({
    runId: 'r',
    question: 'q',
    contextPackSha256: 'c',
    records: [answerRecord('a'), answerRecord('b', { synthetic: true })]
  })
  assert.ok(log.notes.some((note) => note.includes('合成')))
  assert.equal(log.participants.find((p) => p.side === 'b').synthetic, true)
})

check('context pack honours its budget and records the truncation', async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), 'arena-vault-'))
  await mkdir(path.join(vault, 'Projects'), { recursive: true })
  await writeFile(path.join(vault, 'Projects', 'Long.md'), 'あ'.repeat(5000), 'utf8')

  const pack = await buildContextPack(
    { id: 'budget', notes: ['Projects/Long.md'] },
    { vaultRoot: vault, maxCharsPerSource: 100, maxCharsTotal: 100 }
  )
  assert.ok(pack.includes('切り詰め'))
  assert.ok(!pack.includes('あ'.repeat(200)))
  assert.deepEqual(readSourcesFromPack(pack).notes, ['Long'])
})

check('the declared budget is never exceeded by its own bookkeeping', async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), 'arena-vault-'))
  await writeFile(path.join(vault, 'A.md'), 'あ'.repeat(5000), 'utf8')
  await writeFile(path.join(vault, 'B.md'), 'い'.repeat(5000), 'utf8')

  const pack = await buildContextPack(
    { id: 'budget', notes: ['A.md', 'B.md'] },
    { vaultRoot: vault, maxCharsPerSource: 300, maxCharsTotal: 500 }
  )
  const [, used, total] = /budget: (\d+) \/ (\d+) chars/.exec(pack).map(Number)
  assert.ok(used <= total, `budget overrun: ${used} > ${total}`)
})

check('the excerpt under review gets the budget before background notes', async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), 'arena-vault-'))
  await writeFile(path.join(vault, 'Background.md'), 'は'.repeat(5000), 'utf8')
  const subject = path.join(vault, 'subject.txt')
  await writeFile(subject, 'JUDGE_THIS_SENTENCE', 'utf8')

  const pack = await buildContextPack(
    { id: 'priority', notes: ['Background.md'], excerpts: [{ label: 'subject', path: subject }] },
    { vaultRoot: vault, maxCharsPerSource: 400, maxCharsTotal: 400 }
  )
  assert.ok(pack.includes('JUDGE_THIS_SENTENCE'), 'the excerpt was starved by background notes')
})

check('a note reference cannot escape the vault', async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), 'arena-vault-'))
  await assert.rejects(
    () => buildContextPack({ id: 'escape', notes: ['../../etc/hosts'] }, { vaultRoot: vault }),
    /escapes/
  )
})

check('a run id cannot escape the output root', () => {
  assert.throws(() => runPaths('/tmp/arena-root', '../../elsewhere'), /escapes/)
  assert.ok(runPaths('/tmp/arena-root', 'ok-run').dir.startsWith('/tmp/arena-root'))
})

check('assertLoopback accepts loopback and rejects everything else as fatal', () => {
  for (const ok of ['http://127.0.0.1:11434', 'http://localhost:1234', 'http://[::1]:8080']) {
    assert.ok(assertLoopback(ok))
  }
  for (const bad of ['https://example.com', 'http://127.0.0.1@evil.com', 'http://localhost.evil.com']) {
    assert.throws(() => assertLoopback(bad), (error) => error.fatal === true, `accepted ${bad}`)
  }
})

check('runArena hands both sides the identical prompt string', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-run-'))
  const paths = runPaths(dir, 'r')
  await writeFile(path.join(dir, 'pack.md'), 'CONTEXT BODY', 'utf8')

  const { records } = await runArena({
    contextPackPath: path.join(dir, 'pack.md'),
    question: 'Q',
    sides: [
      { side: 'a', adapterId: 'fake-contrarian', options: {} },
      { side: 'b', adapterId: 'fake-contrarian', options: {} }
    ],
    paths
  })
  assert.equal(records[0].promptSha256, records[1].promptSha256)
  const onDisk = sha256(await readFile(paths.prompt, 'utf8'))
  assert.equal(records[0].promptSha256, onDisk, 'the recorded hash does not match prompt.txt')
})

check('buildVerdict rejects a hash that disagrees with prompt.txt', () => {
  assert.throws(
    () =>
      buildVerdict({
        runId: 'r',
        question: 'q',
        contextPackSha256: 'c',
        actualPromptSha256: 'what-was-really-on-disk',
        records: [answerRecord('a'), answerRecord('b')]
      }),
    /does not match prompt\.txt/
  )
})

check('a negated twin is never reported as agreement', () => {
  const claim = (id, statement) => ({ id, statement, stance: 'support' })
  const log = buildVerdict({
    runId: 'r',
    question: 'q',
    contextPackSha256: 'c',
    records: [
      answerRecord('a', {
        answer: { recommendation: 'A', claims: [claim('a1', 'この判定は妥当である')], assumptions: [] }
      }),
      answerRecord('b', {
        answer: { recommendation: 'B', claims: [claim('b1', 'この判定は妥当ではない')], assumptions: [] }
      })
    ]
  })
  assert.equal(log.settled.length, 0, '真逆の主張が確定に入った')
  const pair = log.open.find((item) => item.kind === 'claim-pair')
  assert.equal(pair.relation, 'similar-unverified')
})

check('an identical claim with an identical stance is agreement', () => {
  const claim = (id) => ({ id, statement: '影響範囲を数量で示す必要がある', stance: 'support' })
  const log = buildVerdict({
    runId: 'r',
    question: 'q',
    contextPackSha256: 'c',
    records: [
      answerRecord('a', { answer: { recommendation: 'A', claims: [claim('a1')], assumptions: [] } }),
      answerRecord('b', { answer: { recommendation: 'B', claims: [claim('b1')], assumptions: [] } })
    ]
  })
  assert.equal(log.settled.length, 1)
  assert.equal(log.settled[0].relation, 'identical')
})

check('the synthetic label survives into every rendered artefact', () => {
  const shared = { recommendation: '同じ結論', claims: [], assumptions: [] }
  const log = buildVerdict({
    runId: 'r',
    question: 'q',
    contextPackSha256: 'c',
    records: [answerRecord('a', { answer: shared }), answerRecord('b', { synthetic: true, answer: shared })]
  })
  assert.equal(log.settled.length, 1, 'expected the agreed-recommendation path')

  const markdown = renderVerdictMarkdown(log)
  const settledSection = markdown.split('## 確定')[1].split('## 未確定')[0]
  assert.ok(settledSection.includes('⚠合成'), 'verdict.md hides the synthetic side in 確定')

  const note = renderNote({ log, sources: { notes: [], excerpts: [] }, taskId: 'T' })
  const noteSettled = note.split('## 確定')[1].split('## 未確定')[0]
  assert.ok(noteSettled.includes('⚠合成'), 'the Obsidian candidate hides the synthetic side in 確定')
})

check('the generated note cites its excerpt sources, not only vault notes', () => {
  const log = buildVerdict({
    runId: 'r',
    question: 'q',
    contextPackSha256: 'c',
    records: [answerRecord('a'), answerRecord('b')]
  })
  const note = renderNote({
    log,
    sources: { notes: ['SomeNote'], excerpts: [{ label: 'todo.md', where: '/repo/todo.md:281-295' }] },
    taskId: 'T'
  })
  assert.ok(note.includes('[[SomeNote]]'))
  assert.ok(note.includes('/repo/todo.md:281-295'), 'excerpt provenance was dropped')
})

check('manual relay asks for a reply, then uses it on resume without re-querying', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-relay-'))
  const paths = runPaths(dir, 'r')
  await writeFile(path.join(dir, 'pack.md'), 'CONTEXT BODY', 'utf8')

  const sides = [
    { side: 'a', adapterId: 'fake-contrarian', options: {} },
    {
      side: 'b',
      adapterId: 'manual-relay',
      options: { promptPath: paths.prompt, requestPath: paths.request('b'), rawPath: paths.raw('b') }
    }
  ]
  const first = await runArena({ contextPackPath: path.join(dir, 'pack.md'), question: 'Q', sides, paths })
  assert.equal(first.records[1].status, 'awaiting-human')

  const request = await readFile(paths.request('b'), 'utf8')
  assert.ok(request.includes(first.records[1].promptSha256), 'the request omits the prompt hash')

  const promptBefore = await readFile(paths.prompt, 'utf8')
  await writeFile(
    paths.raw('b'),
    '{"recommendation":"外部AIの結論","claims":[{"id":"x1","statement":"外部AIの主張","stance":"oppose"}],"assumptions":[]}',
    'utf8'
  )

  const second = await runArena({ contextPackPath: path.join(dir, 'pack.md'), question: 'Q', sides, paths, resume: true })
  assert.equal(second.records[1].status, 'ok')
  assert.equal(second.records[1].answer.recommendation, '外部AIの結論')
  assert.equal(await readFile(paths.prompt, 'utf8'), promptBefore, 'resume rewrote the prompt')
  assert.equal(second.records[0].finishedAt, first.records[0].finishedAt, 'resume re-queried a settled side')
  assert.equal(second.records[1].promptSha256, first.records[1].promptSha256)
})

check('an unfinished relay never reaches a write-back candidate', () => {
  const log = buildVerdict({
    runId: 'r',
    question: 'q',
    contextPackSha256: 'c',
    records: [
      answerRecord('a'),
      answerRecord('b', { status: 'awaiting-human', answer: undefined, error: 'awaiting the Owner' })
    ]
  })
  assert.equal(log.status, 'awaiting-human', 'an unfinished run was reported as a result')
  assert.ok(log.notes.some((note) => note.includes('手動リレー待ち')))
})

check('questionFromPrompt recovers the question from the prompt on disk', () => {
  const prompt = buildPrompt('CTX', '本当に妥当か。')
  assert.equal(questionFromPrompt(prompt), '本当に妥当か。')
  assert.throws(() => questionFromPrompt('no marker here'), /no ## QUESTION/)
})

check('linkcheck catches a broken wikilink', async () => {
  const vault = await mkdtemp(path.join(os.tmpdir(), 'arena-vault-'))
  await writeFile(path.join(vault, 'Real.md'), '# real', 'utf8')
  const note = path.join(vault, 'note-under-test.md')
  await writeFile(note, 'see [[Real]] and [[Missing]]', 'utf8')

  const report = await checkLinks({ notePaths: [note], vaultRoot: vault })
  assert.equal(report.pass, false)
  assert.equal(report.broken.length, 1)
  assert.equal(report.broken[0].link, 'Missing')
})

check('extractWikilinks handles aliases and headings', () => {
  assert.deepEqual(extractWikilinks('[[A|alias]] [[B#head]] [[C]]'), ['A', 'B', 'C'])
})

let failed = 0
for (const [name, fn] of checks) {
  try {
    await fn()
    process.stdout.write(`  ok   ${name}\n`)
  } catch (error) {
    failed += 1
    process.stdout.write(`  FAIL ${name}\n         ${error.message}\n`)
  }
}
process.stdout.write(`\n${checks.length - failed}/${checks.length} passed\n`)
process.exitCode = failed === 0 ? 0 : 1
