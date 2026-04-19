/**
 * MCP client — connects agents to external MCP servers.
 * Supports HTTP (SSE) and stdio transports.
 *
 * Pattern from ab180/agent: agents declare mcpServers in config,
 * platform handles connection/tool discovery automatically.
 */

import type { AgentConfig, MCPServerConfig, MCPToolConfig } from '@airflux/core';
import { ToolRegistry } from '@airflux/core';
import { spawn } from 'child_process';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { getRequestContext } from '../runtime/request-context.js';
import { getUserMCPConnection } from '../store/user-mcp-store.js';

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

export interface MCPRegistrySummary {
  all: string[];
  byServer: Record<string, string[]>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: { code?: number; message: string };
  method?: string;
}

const MCP_PROTOCOL_VERSION = '2025-11-25';
const STDIO_TIMEOUT_MS = 15_000;

function applyTemplate(value: string, userVars?: Record<string, string>): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, name: string) => {
    if (name.startsWith('user.')) {
      return userVars?.[name.slice(5)] || '';
    }
    return process.env[name] || '';
  });
}

function resolveConfig(config: MCPServerConfig, userVars?: Record<string, string>): MCPServerConfig {
  return {
    ...config,
    url: config.url ? applyTemplate(config.url, userVars) : config.url,
    headers: config.headers
      ? Object.fromEntries(Object.entries(config.headers).map(([key, value]) => [key, applyTemplate(value, userVars)]))
      : config.headers,
    command: config.command?.map(part => applyTemplate(part, userVars)),
    env: config.env
      ? Object.fromEntries(Object.entries(config.env).map(([key, value]) => [key, applyTemplate(value, userVars)]))
      : config.env,
  };
}

function toToolName(serverName: string, toolName: string): string {
  const normalize = (value: string) => value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  return `mcp_${normalize(serverName)}_${normalize(toolName)}`;
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

async function withStdioServer<T>(
  config: MCPServerConfig,
  fn: (request: (method: string, params?: unknown) => Promise<unknown>) => Promise<T>,
): Promise<T> {
  if (!config.command || config.command.length === 0) {
    throw new Error(`MCP server ${config.name}: command required for stdio transport`);
  }

  const [bin, ...args] = config.command;
  const child = spawn(bin, args, {
    env: { ...process.env, ...(config.env || {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  let stderrBuffer = '';
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  const cleanup = () => {
    child.stdout?.removeAllListeners();
    child.stderr?.removeAllListeners();
    child.removeAllListeners();
    if (!child.killed) {
      child.kill();
    }
  };

  const rejectAll = (error: Error) => {
    for (const waiter of pending.values()) {
      waiter.reject(error);
    }
    pending.clear();
  };

  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const message = JSON.parse(trimmed) as JsonRpcResponse;
        if (typeof message.id === 'number' && pending.has(message.id)) {
          const waiter = pending.get(message.id)!;
          pending.delete(message.id);
          if (message.error) {
            waiter.reject(new Error(message.error.message));
          } else {
            waiter.resolve(message.result);
          }
        }
      } catch (e) {
        rejectAll(new Error(`Invalid MCP stdio response: ${e instanceof Error ? e.message : String(e)}`));
      }
    }
  });

  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    stderrBuffer += chunk;
  });

  child.on('error', (error) => {
    rejectAll(error instanceof Error ? error : new Error(String(error)));
  });

  child.on('close', (code) => {
    if (pending.size > 0) {
      rejectAll(new Error(`MCP stdio server exited early (${config.name}, code=${code ?? 'unknown'}): ${stderrBuffer.slice(0, 500)}`));
    }
  });

  const send = (message: unknown) => {
    child.stdin?.write(`${JSON.stringify(message)}\n`);
  };

  const request = (method: string, params?: unknown): Promise<unknown> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP stdio request timed out: ${config.name} ${method}`));
      }, STDIO_TIMEOUT_MS);

      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      send({
        jsonrpc: '2.0',
        id,
        method,
        ...(params !== undefined ? { params } : {}),
      });
    });
  };

  try {
    await request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: 'airflux-agent-platform',
        version: '0.1.0',
      },
    });
    send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    return await fn(request);
  } finally {
    cleanup();
  }
}

async function discoverStdioTools(config: MCPServerConfig): Promise<MCPTool[]> {
  try {
    const result = await withStdioServer(config, (request) => request('tools/list'));
    const data = result as { tools?: MCPTool[] };
    return data.tools || [];
  } catch (e) {
    logger.warn('MCP stdio tool discovery failed', {
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
    const resolved = resolveConfig(config);
    if (resolved.transport === 'http') {
      const tools = await discoverHttpTools(resolved);
      connections.push({
        name: resolved.name,
        transport: 'http',
        tools,
        connected: tools.length > 0,
      });
      if (tools.length > 0) {
        logger.info('MCP server connected', { server: resolved.name, tools: tools.length });
      }
    } else if (resolved.transport === 'stdio') {
      const shouldDiscover = !(resolved.auth?.mode === 'personal' && !resolved.tools?.length);
      const tools = shouldDiscover ? await discoverStdioTools(resolved) : [];
      connections.push({
        name: resolved.name,
        transport: 'stdio',
        tools,
        connected: tools.length > 0 || !!resolved.tools?.length,
      });
      logger.info('MCP stdio server registered', {
        server: resolved.name,
        discoveredTools: tools.length,
        staticTools: resolved.tools?.length || 0,
      });
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
  let userVars: Record<string, string> | undefined;
  if (config.auth?.mode === 'personal') {
    const requestContext = getRequestContext();
    if (!requestContext?.userId) {
      throw new Error(`MCP server "${config.name}" requires user context`);
    }

    userVars = getUserMCPConnection(requestContext.userId, config.name) || undefined;
    if (!userVars) {
      throw new Error(`MCP server "${config.name}" is not connected for user ${requestContext.userId}`);
    }
  }

  const resolved = resolveConfig(config, userVars);
  if (resolved.transport === 'stdio') {
    return withStdioServer(resolved, (request) =>
      request('tools/call', { name: toolName, arguments: input }),
    );
  }

  if (!resolved.url) throw new Error('MCP HTTP url required');

  const res = await fetch(resolved.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...resolved.headers,
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

export async function registerMCPToolsToRegistry(configs: MCPServerConfig[]): Promise<MCPRegistrySummary> {
  if (configs.length === 0) return { all: [], byServer: {} };

  const connections = await connectMCPServers(configs);
  const registered: string[] = [];
  const byServer: Record<string, string[]> = {};

  for (const config of configs) {
    const connection = connections.find(candidate => candidate.name === config.name);
    const tools = connection?.tools?.length
      ? connection.tools
      : (config.tools || []).map((tool: MCPToolConfig) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema || {},
        }));

    if (tools.length === 0) {
      if (config.auth?.mode === 'personal') {
        logger.warn('Personal MCP server has no static tool catalog; skipping registration', {
          server: config.name,
        });
      }
      continue;
    }

    for (const tool of tools) {
      const registryName = toToolName(config.name, tool.name);
      if (ToolRegistry.has(registryName)) {
        logger.warn('Skipping duplicate MCP tool registration', {
          tool: registryName,
          server: config.name,
        });
        continue;
      }

      ToolRegistry.register(registryName, {
        description: `[MCP:${config.name}] ${tool.description || tool.name}`,
        inputSchema: ((tool.inputSchema as z.ZodType | undefined) || z.object({}).passthrough()) as z.ZodType,
        execute: async (input: unknown) => callMCPTool(config, tool.name, input),
      });
      registered.push(registryName);
      byServer[config.name] = [...(byServer[config.name] || []), registryName];
    }
  }

  return { all: registered, byServer };
}

export function attachMCPToolsToAgents(
  agentConfigs: AgentConfig[],
  mcpConfigs: MCPServerConfig[],
  summary: MCPRegistrySummary,
): AgentConfig[] {
  if (agentConfigs.length === 0 || mcpConfigs.length === 0) return agentConfigs;

  return agentConfigs.map((agent) => {
    const injectedTools = mcpConfigs.flatMap((server) => {
      if (!server.agents?.includes(agent.name)) return [];
      return summary.byServer[server.name] || [];
    });

    if (injectedTools.length === 0) return agent;

    return {
      ...agent,
      tools: [...new Set([...(agent.tools || []), ...injectedTools])],
    };
  });
}
