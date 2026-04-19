import { describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { attachMCPToolsToAgents, connectMCPServers, callMCPTool } from '../mcp/client.js';

const fixture = resolve(import.meta.dirname, 'fixtures/fake-mcp-stdio.js');

describe('MCP stdio client', () => {
  it('discovers tools over stdio', async () => {
    const connections = await connectMCPServers([
      {
        name: 'fake-stdio',
        transport: 'stdio',
        command: [process.execPath, fixture],
      },
    ]);

    expect(connections).toHaveLength(1);
    expect(connections[0].connected).toBe(true);
    expect(connections[0].tools[0]?.name).toBe('echo');
  });

  it('calls tools over stdio', async () => {
    const result = await callMCPTool(
      {
        name: 'fake-stdio',
        transport: 'stdio',
        command: [process.execPath, fixture],
      },
      'echo',
      { text: 'hello' },
    ) as { content?: { text?: string }[] };

    expect(result.content?.[0]?.text).toBe('echo:hello');
  });

  it('injects registered MCP tools into configured agents', () => {
    const agents = attachMCPToolsToAgents(
      [
        {
          name: 'research-agent',
          enabled: true,
          model: 'default',
          skills: [],
          tools: ['searchDocs'],
        },
        {
          name: 'ops-agent',
          enabled: true,
          model: 'fast',
          skills: [],
          tools: [],
        },
      ],
      [
        {
          name: 'github-local',
          agents: ['research-agent'],
          transport: 'stdio',
          tools: [{ name: 'search_repositories', description: 'Search GitHub repositories' }],
        },
      ],
      {
        all: ['mcp_github_local_search_repositories'],
        byServer: {
          'github-local': ['mcp_github_local_search_repositories'],
        },
      },
    );

    expect(agents[0]?.tools).toContain('mcp_github_local_search_repositories');
    expect(agents[1]?.tools).not.toContain('mcp_github_local_search_repositories');
  });
});
