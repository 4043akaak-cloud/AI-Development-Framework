// Layer 2 — judgement layer (the arena).
//
// Input:  context-pack.md (from layer 1) + the question.
// Output: prompt.txt, answer-a.json, answer-b.json.
//
// Both adapters receive byte-identical prompts and run concurrently. Neither is
// given the other's output. This is deliberately NOT the existing Frontdoor
// proposal -> critic topology, where the critic reads the proposal first and is
// therefore anchored by it.

import { readFile } from 'node:fs/promises'

import { runAdapter } from './adapters.mjs'
import { isMain, parseArgs, sha256, writeJson, writeFileEnsured } from './common.mjs'

// The prompt has to stand on its own as a request. An earlier version opened by
// describing a role, which reads as a document rather than as something being
// asked of the reader — pasted into a chat window it drew "what would you like
// me to do with this?" instead of an answer. It now opens with the instruction.
const INSTRUCTIONS = [
  '# 依頼',
  '',
  'この文章は、そのまま実行できる依頼です。追加の指示はありません。',
  '下の「文脈」だけを根拠に、末尾の「問い」へ回答してください。',
  '',
  'あなたは独立したレビュアーです。他のレビュアーの回答は渡されていません。',
  'あなたの回答も、相手が答え終わるまで相手には見せられません。',
  '同じ問いに別のAIが独立に答え、両者の食い違いを抽出するのが目的です。',
  'ですから、無難にまとめず、根拠のある立場をはっきり書いてください。',
  '',
  '## 出力形式',
  '',
  '次のスキーマに厳密に一致するJSONだけを出力してください。前置きも後書きも不要です。',
  '',
  '{',
  '  "recommendation": "<結論を一文で>",',
  '  "claims": [',
  '    { "id": "c1", "statement": "<具体的な主張を一つ>", "stance": "support | oppose | conditional" }',
  '  ],',
  '  "assumptions": ["<回答のために置いた前提>"]',
  '}',
  '',
  '- claims は3〜6件。要約ではなく、それぞれ独立した具体的な主張にしてください。',
  '- recommendation、statement、assumptions は日本語で書いてください。',
  '- stance は support / oppose / conditional のいずれかちょうど一つ。',
  '- 文脈に書かれていないことを断定しないでください。足りなければ assumptions に書いてください。'
].join('\n')

export function buildPrompt(contextPack, question) {
  return [INSTRUCTIONS, '', '## CONTEXT', '', contextPack.trim(), '', '## QUESTION', '', question.trim(), ''].join('\n')
}

/**
 * Independence is a property of information flow, not of timing: neither side is
 * given the other's answer, whichever order they run in. So on a memory-bound
 * machine we run sequentially by default — loading two local models at once on
 * 8 GB just thrashes, and a swapping model is not a faster model.
 */
async function existingAnswer(paths, side) {
  try {
    return JSON.parse(await readFile(paths.answer(side), 'utf8'))
  } catch {
    return null
  }
}

export async function runArena({ contextPackPath, question, sides, paths, concurrent = false, resume = false }) {
  // On resume the prompt is read back rather than rebuilt. Rebuilding would
  // change its bytes — a fresh timestamp in the pack is enough — and the answers
  // already collected would then no longer match the prompt on disk.
  const prompt = resume
    ? await readFile(paths.prompt, 'utf8')
    : buildPrompt(await readFile(contextPackPath, 'utf8'), question)

  // One prompt string, shared by reference, so the two sides cannot drift apart.
  if (!resume) await writeFileEnsured(paths.prompt, prompt)

  const dispatch = async ({ side, adapterId, options }) => {
    if (resume) {
      // Anything already settled stays as it is; only a side still waiting on a
      // human gets asked again, so resuming never re-queries a model.
      const prior = await existingAnswer(paths, side)
      if (prior && prior.status !== 'awaiting-human') return prior
    }
    return runAdapter(side, adapterId, prompt, options ?? {})
  }

  let records
  if (concurrent) {
    records = await Promise.all(sides.map(dispatch))
  } else {
    records = []
    for (const side of sides) records.push(await dispatch(side))
  }

  for (const record of records) {
    await writeJson(paths.answer(record.side), record)
  }

  return { promptSha256: sha256(prompt), records }
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  const { runPaths, DEFAULT_OUT_ROOT } = await import('./common.mjs')
  const paths = runPaths(args['out-root'] ?? DEFAULT_OUT_ROOT, args.run)
  const result = await runArena({
    contextPackPath: paths.contextPack,
    question: args.question,
    sides: [
      { side: 'a', adapterId: args['adapter-a'] ?? 'ollama-local', options: { endpoint: args.endpoint ?? 'http://127.0.0.1:11434', model: args['model-a'] ?? 'llama3:latest', timeoutMs: Number(args.timeout ?? 300000) } },
      { side: 'b', adapterId: args['adapter-b'] ?? 'fake-contrarian', options: { endpoint: args.endpoint ?? 'http://127.0.0.1:11434', model: args['model-b'], timeoutMs: Number(args.timeout ?? 300000) } }
    ],
    concurrent: Boolean(args.concurrent),
    paths
  })
  for (const record of result.records) {
    process.stderr.write(`${record.side}: ${record.adapterLabel} -> ${record.status}\n`)
  }
}
