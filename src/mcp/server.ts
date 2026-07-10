#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { buildServer } from './build.js'

/**
 * Bin entry for the MCP server (`bkng-mcp`). All tool wiring lives in build.ts
 * so tests can import `buildServer` without side effects; this file only owns
 * the process: connect stdio, announce readiness on stderr, die loudly on a
 * fatal error.
 */

const main = async (): Promise<void> => {
  const server = buildServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stderr only — stdout is the MCP transport.
  process.stderr.write('booking-cli MCP server ready on stdio\n')
}

void main().catch((error) => {
  process.stderr.write(
    `Fatal: ${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exit(1)
})
