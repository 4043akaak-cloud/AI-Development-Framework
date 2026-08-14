import { defaultIO, runCli } from './buildApprovedTaskPacket'
import { defaultFrontdoorCliIO, runFrontdoorCli } from './frontdoorOwnerLoop'
import { runFrontdoorOllamaE2eProbe } from './frontdoorOllamaE2eProbe'
import { parseMcpRuntimeRoot, runFrontdoorMcpStdio } from './frontdoorMcpServer'
import { runFrontdoorMcpClientProbeCli } from './frontdoorMcpClientProbe'

const args = process.argv.slice(2)
const runner = args[0] === 'mcp'
  ? runFrontdoorMcpStdio(parseMcpRuntimeRoot(args.slice(1))).then(() => 0)
  : args[0] === 'frontdoor'
  ? runFrontdoorCli(args.slice(1), defaultFrontdoorCliIO)
  : args[0] === 'frontdoor-ollama-e2e'
    ? runFrontdoorOllamaE2eProbe(args.slice(1))
    : args[0] === 'mcp-client-probe'
      ? runFrontdoorMcpClientProbeCli(args.slice(1))
    : runCli(args, defaultIO)

void runner.then((code) => {
  process.exitCode = code
})
