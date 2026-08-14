import { defaultIO, runCli } from './buildApprovedTaskPacket'
import { defaultFrontdoorCliIO, runFrontdoorCli } from './frontdoorOwnerLoop'

const args = process.argv.slice(2)
const runner = args[0] === 'frontdoor'
  ? runFrontdoorCli(args.slice(1), defaultFrontdoorCliIO)
  : runCli(args, defaultIO)

void runner.then((code) => {
  process.exitCode = code
})
