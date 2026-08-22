import { ConversationRelay } from './jobLoop/relay'
import { AnthropicMessagesTransport } from './jobLoop/anthropicTransport'
import { OllamaLocalHttpTransport } from './jobLoop/ollamaTransport'
import type { OllamaTransportOptions } from './jobLoop/ollamaTransport'
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
  let relay: ConversationRelay

  relay = new ConversationRelay({
    runtimeRoot,
    externalTransports: { [externalAdapterId]: externalTransport, [ollamaAdapterId]: ollamaTransport },
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
      })
    ]
  })
  return relay
}
