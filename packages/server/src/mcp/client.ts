/**
 * MCP client — connects agents to external MCP servers.
 * Supports HTTP (SSE) and stdio transports.
 *
 * Pattern from ab180/agent: agents declare mcpServers in config,
 * platform handles connection/tool discovery automatically.
 */

import type { MCPServerConfig } from '@airflux/core';
import { logger } from '../lib/logger.js';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface MCPConnection {
  name: string;
  transport: string;
  tools: MCPTool[];
  connected: boolean;
}

/**
 * Discover tools from an MCP server via HTTP transport.
 * Calls the server's tools/list endpoint.
 */
async function discoverHttpTools(config: MCPServerConfig): Promise<MCPTool[]> {
  if (!config.url) throw new Error(`MCP server ${config.name}: url required for http transport`);

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { result?: { tools?: MCPTool[] } };
    return data.result?.tools || [];
  } catch (e) {
    logger.warn('MCP server tool discovery failed', {
      server: config.name,
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

/**
 * Connect to MCP servers declared in agent config.
 * Returns connection info with discovered tools.
 */
export async function connectMCPServers(configs: MCPServerConfig[]): Promise<MCPConnection[]> {
  const connections: MCPConnection[] = [];

  for (const config of configs) {
    if (config.transport === 'http') {
      const tools = await discoverHttpTools(config);
      connections.push({
        name: config.name,
        transport: 'http',
        tools,
        connected: tools.length > 0,
      });
      if (tools.length > 0) {
        logger.info('MCP server connected', { server: config.name, tools: tools.length });
      }
    } else if (config.transport === 'stdio') {
      // stdio transport requires spawning a child process
      // Placeholder for future implementation
      connections.push({
        name: config.name,
        transport: 'stdio',
        tools: [],
        connected: false,
      });
      logger.info('MCP stdio server registered (lazy connect)', { server: config.name });
    }
  }

  return connections;
}

/**
 * Call a tool on an MCP server via HTTP.
 */
export async function callMCPTool(
  config: MCPServerConfig,
  toolName: string,
  input: unknown,
): Promise<unknown> {
  if (!config.url) throw new Error('MCP HTTP url required');

  const res = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: input },
      id: Date.now(),
    }),
  });

  if (!res.ok) throw new Error(`MCP tool call failed: HTTP ${res.status}`);
  const data = await res.json() as { result?: unknown; error?: { message: string } };
  if (data.error) throw new Error(`MCP tool error: ${data.error.message}`);
  return data.result;
}
