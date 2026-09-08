// Adapters used by the judgement layer.
//
// Every adapter takes the SAME prompt string and knows nothing about any other
// adapter's answer. That independence is the whole point of the arena: a critic
// who has already read the proposal is not an independent second opinion.

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { assertLoopback, sha256, writeFileEnsured } from './common.mjs'

const STANCES = new Set(['support', 'oppose', 'conditional'])

/** Validate an answer against the minimal schema. Returns null when it does not fit. */
export function parseAnswer(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  if (typeof value.recommendation !== 'string' || value.recommendation.trim() === '') return null
  if (!Array.isArray(value.claims) || value.claims.length === 0) return null

  const claims = []
  for (const [index, claim] of value.claims.entries()) {
    if (!claim || typeof claim !== 'object') return null
    if (typeof claim.statement !== 'string' || claim.statement.trim() === '') return null
    if (!STANCES.has(claim.stance)) return null
    claims.push({
      id: typeof claim.id === 'string' && claim.id ? claim.id : `c${index + 1}`,
      statement: claim.statement.trim(),
      stance: claim.stance
    })
  }

  const assumptions = Array.isArray(value.assumptions)
    ? value.assumptions.filter((item) => typeof item === 'string')
    : []

  return { recommendation: value.recommendation.trim(), claims, assumptions }
}

async function callOllama(prompt, { endpoint, model, timeoutMs }) {
  const url = assertLoopback(endpoint)

  // Streaming is not cosmetic here. Node's fetch (undici) applies a 300s
  // headersTimeout, and a non-streaming Ollama call sends no headers until the
  // whole answer is ready — so any generation slower than 5 minutes fails as
  // "fetch failed" no matter how long our own timeout is. Streaming delivers
  // headers immediately and leaves total duration under our AbortSignal.
  const response = await fetch(new URL('/api/chat', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      format: 'json',
      // Bounded: this machine generates at roughly 3 tokens/sec, so an uncapped
      // answer can outlive any sane timeout.
      // Bounded, but not so tight that a verbose small model gets its JSON cut
      // mid-object and is recorded as malformed for a reason that is ours.
      options: { temperature: 0.2, num_predict: 900 },
      messages: [{ role: 'user', content: prompt }]
    }),
    // A loopback service that answers with a redirect would otherwise carry the
    // whole prompt to wherever it points, after assertLoopback has already passed.
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!response.ok) {
    throw new Error(`ollama responded ${response.status} ${response.statusText}`)
  }

  const decoder = new TextDecoder()
  let buffered = ''
  let content = ''
  for await (const chunk of response.body) {
    buffered += decoder.decode(chunk, { stream: true })
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim() === '') continue
      const frame = JSON.parse(line)
      if (frame.error) throw new Error(`ollama error: ${frame.error}`)
      if (typeof frame.message?.content === 'string') content += frame.message.content
    }
  }
  if (buffered.trim() !== '') {
    const frame = JSON.parse(buffered)
    if (typeof frame.message?.content === 'string') content += frame.message.content
  }

  if (content.trim() === '') throw new Error('ollama returned an empty message')
  return content
}

/**
 * Deterministic stand-in for a second model.
 *
 * It is NOT an AI opinion. It exists so the disagreement-detection mechanism can
 * be exercised before a second real model is installed. Everything it produces is
 * labelled synthetic, all the way through to verdict.md.
 */
function fakeContrarian(prompt) {
  const seed = sha256(prompt).slice(0, 8)
  return JSON.stringify({
    recommendation:
      '合成応答: 現時点で「妥当」と判定するには根拠が不足しており、判断を保留すべきである。',
    claims: [
      {
        id: 'f1',
        statement: '合成応答: 提示された文脈だけでは合否を決められない。',
        stance: 'oppose'
      },
      {
        id: 'f2',
        statement: '合成応答: 判断の前に、影響範囲を数量で示す必要がある。',
        stance: 'conditional'
      },
      {
        id: 'f3',
        statement: `合成応答: この応答は決定的スタブであり実意見ではない (seed ${seed})。`,
        stance: 'oppose'
      }
    ],
    assumptions: ['合成応答: このアダプタはモデルを呼んでいない。']
  })
}

function relayRequest(prompt, { promptPath, rawPath }) {
  return [
    '# 手動リレー依頼',
    '',
    'この系の回答は、Owner が外部AI（ChatGPT / Claude など）へ手で渡して受け取ります。',
    'ADF はここでは何も送信していません。',
    '',
    '## 手順',
    '',
    `1. \`${promptPath}\` の**全文**をそのままコピーする（一部だけ貼らないこと）`,
    '2. 外部AIのチャット欄へ、**本文として貼り付ける**。ファイル添付にしないこと',
    '3. 返ってきた**JSONだけ**をコピーする',
    `4. \`${rawPath}\` に保存する`,
    '5. 同じ run id を指定して `--resume` 付きで再実行する',
    '',
    '## ファイル添付にしないのはなぜか',
    '',
    'このプロンプトは、それ自体が完成した依頼文である。役割の指定、出力スキーマ、文脈、問いがすべて含まれており、',
    '添えるべき指示は何もない。ファイルとして渡すと本文が空になり、相手のAIは「何をすればよいか」を訊き返してくる。',
    '本文として貼れば、そのまま実行される。',
    '',
    'どうしても添付しか使えない場合は、本文に一行だけ「添付の指示に従って回答してください」と書く。',
    'ただしその一行は下記のsha256の対象外であり、相手が受け取った入力はこのプロンプトと厳密には一致しなくなる。',
    '',
    '## 確認事項',
    '',
    `- 貼り付けたプロンプトの sha256: \`${sha256(prompt)}\``,
    '- ADF は、貼り間違い（別の問いを貼った、prompt.txt を編集した）を検出できません。ここは人の目が最後の砦です。',
    '- 相手のAIに、他方の系の回答を見せないでください。見せた時点で独立した第二意見ではなくなります。',
    '- JSON以外の前置き・後書きが混ざると `malformed` になります。推測で補完はしません。',
    ''
  ].join('\n')
}

export const ADAPTERS = {
  'ollama-local': {
    id: 'ollama-local',
    synthetic: false,
    describe: (options) => `ollama-local / ${options.model}`,
    run: (prompt, options) => callOllama(prompt, options)
  },
  'fake-contrarian': {
    id: 'fake-contrarian',
    synthetic: true,
    describe: () => 'fake-contrarian (synthetic, no model call)',
    run: async (prompt) => fakeContrarian(prompt)
  },
  /**
   * A frontier model answers, with the Owner carrying the text both ways.
   *
   * Nothing is sent from here: ADF writes a request file and stops. That keeps
   * the run inside AGENTS.md's "no external API" boundary while still putting a
   * genuinely different model on the other side of the arena — which is the one
   * thing a machine this size cannot supply on its own.
   */
  'manual-relay': {
    id: 'manual-relay',
    synthetic: false,
    manual: true,
    describe: () => 'manual-relay (Owner が外部AIへ手渡し)',
    run: async (prompt, options) => {
      try {
        const raw = await readFile(options.rawPath, 'utf8')
        if (raw.trim() !== '') return raw
      } catch {
        // No reply yet — fall through and ask for one.
      }
      await writeFileEnsured(options.requestPath, relayRequest(prompt, options))
      const pending = new Error(`awaiting the Owner's relay: see ${path.basename(options.requestPath)}`)
      pending.awaitingHuman = true
      throw pending
    }
  }
}

/**
 * Run one adapter and return a self-contained answer record.
 * Never throws: a failed side must not take the whole run down.
 */
export async function runAdapter(side, adapterId, prompt, options = {}) {
  const adapter = ADAPTERS[adapterId]
  if (!adapter) throw new Error(`unknown adapter: ${adapterId}`)

  const base = {
    side,
    adapterId,
    adapterLabel: adapter.describe(options),
    synthetic: adapter.synthetic,
    promptSha256: sha256(prompt),
    startedAt: new Date().toISOString()
  }

  try {
    const raw = await adapter.run(prompt, options)
    const parsed = parseAnswer(raw)
    if (!parsed) {
      return { ...base, finishedAt: new Date().toISOString(), status: 'malformed', raw }
    }
    return { ...base, finishedAt: new Date().toISOString(), status: 'ok', raw, answer: parsed }
  } catch (error) {
    // Tolerating a dead side is about model and network trouble. A safety
    // boundary breach is not that, and must not be reported as a slow adapter.
    if (error?.fatal) throw error
    if (error?.awaitingHuman) {
      return { ...base, finishedAt: new Date().toISOString(), status: 'awaiting-human', error: error.message }
    }
    return {
      ...base,
      finishedAt: new Date().toISOString(),
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
