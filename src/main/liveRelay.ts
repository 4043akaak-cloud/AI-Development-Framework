import { ConversationRelay } from './jobLoop/relay'
import { AnthropicMessagesTransport } from './jobLoop/anthropicTransport'
import { OllamaLocalHttpTransport } from './jobLoop/ollamaTransport'
import type { OllamaTransportOptions } from './jobLoop/ollamaTransport'
import { OpenAICompatibleTransport } from './jobLoop/openAiCompatibleTransport'
import { LocalOpenAICompatibleTransport } from './jobLoop/localOpenAiCompatibleTransport'
import { ExternalConversationAdapter } from './jobLoop/externalAdapter'
import { FakeCriticConversationAdapter, FakeImplementationConversationAdapter, FakeProposalConversationAdapter } from './jobLoop/conversationAdapters'

/**
 * Builds the live Provider-neutral Relay registration used by Electron Main and local
 * verification probes. Constructing this graph does not read credentials or contact a provider;
 * network access remains inside an explicit readiness check or send.
 */
export function createLiveRelay(runtimeRoot: string, ollamaOptions: Pick<OllamaTransportOptions, 'baseUrl' | 'model' | 'fetchImpl'> = {}): ConversationRelay {
  const externalAdapterId = 'claude-external'
  const externalTransport = new AnthropicMessagesTransport()
  const ollamaAdapterId = 'ollama-local'
  const ollamaTransport = new OllamaLocalHttpTransport(ollamaOptions)
  const lmStudioAdapterId = 'lmstudio-local'
  const lmStudioTransport = new LocalOpenAICompatibleTransport({
    providerId: 'lmstudio',
    baseUrl: process.env.LM_STUDIO_BASE_URL?.trim() || 'http://127.0.0.1:1234',
    // ADF never selects a local model implicitly. The model must be selected in LM Studio and
    // supplied by the Owner through the process environment before readiness can pass.
    model: process.env.LM_STUDIO_MODEL?.trim() || ''
  })
  const deepSeekAdapterId = 'deepseek-external'
  const deepSeekTransport = new OpenAICompatibleTransport({
    providerId: 'deepseek',
    baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4-flash',
    credentialVariable: 'DEEPSEEK_API_KEY'
  })
  const zaiAdapterId = 'zai-external'
  const zaiTransport = new OpenAICompatibleTransport({
    providerId: 'zai',
    baseUrl: process.env.ZAI_BASE_URL?.trim() || 'https://api.z.ai/api/paas/v4',
    model: process.env.ZAI_MODEL?.trim() || 'glm-5.3',
    credentialVariable: 'ZAI_API_KEY'
  })
  const qwenAdapterId = 'qwen-external'
  const qwenTransport = new OpenAICompatibleTransport({
    providerId: 'qwen',
    baseUrl: process.env.QWEN_BASE_URL?.trim() || process.env.DASHSCOPE_BASE_URL?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.QWEN_MODEL?.trim() || 'qwen3.7-plus',
    credentialVariable: 'DASHSCOPE_API_KEY'
  })
  const openRouterAdapterId = 'openrouter-free'
  const openRouterTransport = new OpenAICompatibleTransport({
    providerId: 'openrouter',
    baseUrl: process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
    // `openrouter/free` is only a preparation fallback. It selects a changing free model; the
    // first real send must set OPENROUTER_MODEL to one exact `:free` model for reproducibility.
    model: process.env.OPENROUTER_MODEL?.trim() || 'openrouter/free',
    credentialVariable: 'OPENROUTER_API_KEY'
  })
  let relay: ConversationRelay

  relay = new ConversationRelay({
    runtimeRoot,
    externalTransports: {
      [externalAdapterId]: externalTransport,
      [ollamaAdapterId]: ollamaTransport,
      [lmStudioAdapterId]: lmStudioTransport,
      [deepSeekAdapterId]: deepSeekTransport,
      [zaiAdapterId]: zaiTransport,
      [qwenAdapterId]: qwenTransport,
      [openRouterAdapterId]: openRouterTransport
    },
    adapters: [
      new FakeProposalConversationAdapter(),
      new FakeCriticConversationAdapter(),
      new FakeImplementationConversationAdapter(),
      new ExternalConversationAdapter(externalAdapterId, 'proposal', externalTransport, {
        authorise: (request) => relay.externalHooks(externalAdapterId, externalTransport).authorise(request),
        recordCall: (record) => relay.externalHooks(externalAdapterId, externalTransport).recordCall(record),
        now: () => new Date()
      }),
      new ExternalConversationAdapter(ollamaAdapterId, ['proposal', 'critic'], ollamaTransport, {
        authorise: (request) => relay.externalHooks(ollamaAdapterId, ollamaTransport).authorise(request),
        recordCall: (record) => relay.externalHooks(ollamaAdapterId, ollamaTransport).recordCall(record),
        now: () => new Date()
      }),
      new ExternalConversationAdapter(lmStudioAdapterId, ['proposal', 'critic', 'review'], lmStudioTransport, {
        authorise: (request) => relay.externalHooks(lmStudioAdapterId, lmStudioTransport).authorise(request),
        recordCall: (record) => relay.externalHooks(lmStudioAdapterId, lmStudioTransport).recordCall(record),
        now: () => new Date()
      }),
      new ExternalConversationAdapter(deepSeekAdapterId, ['proposal', 'critic', 'review'], deepSeekTransport, {
        authorise: (request) => relay.externalHooks(deepSeekAdapterId, deepSeekTransport).authorise(request),
        recordCall: (record) => relay.externalHooks(deepSeekAdapterId, deepSeekTransport).recordCall(record),
        now: () => new Date()
      }),
      new ExternalConversationAdapter(zaiAdapterId, ['proposal', 'critic', 'review'], zaiTransport, {
        authorise: (request) => relay.externalHooks(zaiAdapterId, zaiTransport).authorise(request),
        recordCall: (record) => relay.externalHooks(zaiAdapterId, zaiTransport).recordCall(record),
        now: () => new Date()
      }),
      new ExternalConversationAdapter(qwenAdapterId, ['proposal', 'critic', 'review'], qwenTransport, {
        authorise: (request) => relay.externalHooks(qwenAdapterId, qwenTransport).authorise(request),
        recordCall: (record) => relay.externalHooks(qwenAdapterId, qwenTransport).recordCall(record),
        now: () => new Date()
      }),
      new ExternalConversationAdapter(openRouterAdapterId, ['proposal', 'critic', 'review'], openRouterTransport, {
        authorise: (request) => relay.externalHooks(openRouterAdapterId, openRouterTransport).authorise(request),
        recordCall: (record) => relay.externalHooks(openRouterAdapterId, openRouterTransport).recordCall(record),
        now: () => new Date()
      })
    ]
  })
  return relay
}
