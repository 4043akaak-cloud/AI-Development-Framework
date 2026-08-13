import { defaultIO, runCli } from './buildApprovedTaskPacket'

void runCli(process.argv.slice(2), defaultIO).then((code) => {
  process.exitCode = code
})
