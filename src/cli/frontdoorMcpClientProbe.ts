import path from 'node:path'
import { buildMcpChildEnv, McpStdioClient } from './frontdoorMcpClient'

function argument(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  const value = index >= 0 ? args[index + 1] : undefined
  return value && !value.startsWith('--') ? value : undefined
}

function fixtureInput(requestId: string): Record<string, unknown> {
  const scope = { inScope: ['mcp-client-probe'], outOfScope: ['external-send', 'write-canonical', 'commit', 'push'] }
  return {
    request: {
      requestId,
      source: 'test',
      objective: 'MCP clientのstdio接続を検証する',
      userInput: 'prepareからinspectまでをMCP client経由で検証する',
      projectRef: 'fixture://adf-mcp-client',
      constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
      requestedOutput: 'MCP client接続結果',
      contextReferences: ['fixture://adf-mcp-client'],
      scope
    },
    plan: {
      planId: `${requestId}-plan`,
      requestId,
      version: 1,
      nodes: [{ nodeId: 'proposal', objective: 'MCP client接続を確認する', role: 'proposal', adapterId: 'fake-ai-a', scope, contextReferences: ['fixture://adf-mcp-client'], acceptance: ['Result'], stopConditions: ['scope外'], capabilities: ['read', 'propose'], dependsOn: [], depth: 1 }],
      aggregationPolicy: 'collect-all'
    }
  }
}

function serverEntry(): string {
  return path.resolve(__dirname, 'bin.js')
}

export interface FrontdoorMcpClientProbeOptions {
  runtimeRoot: string
  requestId: string
  command?: string
  serverScript?: string
  env?: NodeJS.ProcessEnv
}

export async function runFrontdoorMcpClientProbe(options: FrontdoorMcpClientProbeOptions): Promise<{ runId: string; toolNames: string[]; stderr: string }> {
  const client = new McpStdioClient({
    command: options.command ?? process.execPath,
    args: [options.serverScript ?? serverEntry(), 'mcp', '--runtime-root', path.resolve(options.runtimeRoot)],
    env: options.env ?? buildMcpChildEnv({ ...process.env, ELECTRON_RUN_AS_NODE: '1' })
  })
  try {
    const initialized = await client.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'adf-frontdoor-client-probe', version: '0.1.0' } }) as { protocolVersion?: string }
    if (initialized.protocolVersion !== '2025-06-18') throw new Error('MCP initialize negotiation returned an unexpected protocol version')
    const listed = await client.request('tools/list') as { tools?: Array<{ name?: string }> }
    const toolNames = (listed.tools ?? []).map((tool) => tool.name).filter((name): name is string => Boolean(name))
    const prepared = await client.request('tools/call', { name: 'adf_frontdoor_prepare', arguments: fixtureInput(options.requestId) }) as { content?: Array<{ text?: string }> }
    const body = JSON.parse(prepared.content?.[0]?.text ?? '{}') as { runId?: string }
    if (!body.runId) throw new Error('MCP prepare response did not contain a runId')
    await client.request('tools/call', { name: 'adf_frontdoor_inspect', arguments: { runId: body.runId } })
    await client.request('tools/call', { name: 'adf_frontdoor_list_runs', arguments: {} })
    return { runId: body.runId, toolNames, stderr: client.stderrText }
  } finally {
    await client.close()
  }
}

export async function runFrontdoorMcpClientProbeCli(args: readonly string[]): Promise<number> {
  const runtimeRoot = argument(args, '--runtime-root')
  const requestId = argument(args, '--request-id')
  if (!runtimeRoot || !requestId) {
    process.stderr.write('required: --runtime-root <path> --request-id <id>\n')
    return 1
  }
  try {
    const result = await runFrontdoorMcpClientProbe({ runtimeRoot, requestId })
    process.stdout.write(`${JSON.stringify({ ...result, nextAction: 'Owner approval remains outside MCP; no Dispatch was attempted' }, null, 2)}\n`)
    return 0
  } catch (error) {
    process.stderr.write(`mcp-client-probe failed: ${String((error as Error)?.message ?? error)}\n`)
    return 1
  }
}
