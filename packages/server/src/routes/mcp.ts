import { Hono } from 'hono';
import { loadConfigOptional } from '@airflux/core';
import type { MCPServerConfig } from '@airflux/core';
import {
  deleteUserMCPConnection,
  getUserMCPConnection,
  listUserMCPConnections,
  upsertUserMCPConnection,
} from '../store/user-mcp-store.js';
import { requireTrustedUserId } from '../security/trusted-user.js';

export const mcpRoutes = new Hono();

function loadServers(): MCPServerConfig[] {
  const config = loadConfigOptional<{ servers?: MCPServerConfig[] }>('mcp-servers', { servers: [] });
  return config.servers || [];
}

mcpRoutes.get('/mcp/servers', (c) => {
  const userId = requireTrustedUserId(new Headers(c.req.raw.headers));
  if (!userId) return c.json({ success: false, error: 'Trusted user required' }, 401);
  const servers = loadServers();
  const connections = new Map(listUserMCPConnections(userId).map(item => [item.serverName, item.updatedAt]));

  return c.json({
    userId,
    servers: servers.map(server => ({
      name: server.name,
      agents: server.agents || [],
      transport: server.transport,
      auth: server.auth || { mode: 'shared', fields: [] },
      tools: server.tools || [],
      connected: connections.has(server.name),
      connectedAt: connections.get(server.name) || null,
      configured: server.auth?.mode === 'personal'
        ? !!getUserMCPConnection(userId, server.name)
        : true,
    })),
  });
});

mcpRoutes.post('/mcp/connections', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const b = body as Record<string, unknown>;
  const userId = requireTrustedUserId(new Headers(c.req.raw.headers));
  if (!userId) return c.json({ success: false, error: 'Trusted user required' }, 401);
  const serverName = typeof b.serverName === 'string' ? b.serverName : '';
  const values = typeof b.values === 'object' && b.values !== null ? b.values as Record<string, unknown> : {};

  const server = loadServers().find(item => item.name === serverName);
  if (!server) return c.json({ success: false, error: `Unknown MCP server: ${serverName}` }, 404);
  if (server.auth?.mode !== 'personal') {
    return c.json({ success: false, error: `MCP server "${serverName}" does not accept personal credentials` }, 400);
  }

  const fields = server.auth.fields || [];
  const normalized = Object.fromEntries(
    fields.map(field => [field.key, String(values[field.key] || '').trim()]),
  );
  const missing = fields
    .filter(field => field.required !== false)
    .map(field => field.key)
    .filter(key => !normalized[key]);

  if (missing.length > 0) {
    return c.json({ success: false, error: `Missing required fields: ${missing.join(', ')}` }, 400);
  }

  upsertUserMCPConnection(userId, serverName, normalized);
  return c.json({ success: true, userId, serverName });
});

mcpRoutes.delete('/mcp/connections/:serverName', (c) => {
  const userId = requireTrustedUserId(new Headers(c.req.raw.headers));
  if (!userId) return c.json({ success: false, error: 'Trusted user required' }, 401);
  const serverName = c.req.param('serverName');
  const deleted = deleteUserMCPConnection(userId, serverName);
  return c.json({ success: deleted, userId, serverName });
});
