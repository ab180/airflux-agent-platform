#!/usr/bin/env node

let initialized = false;

process.stdin.setEncoding('utf8');

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function fail(id, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { message } })}\n`);
}

let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);

    if (msg.method === 'initialize') {
      initialized = true;
      respond(msg.id, {
        protocolVersion: '2025-11-25',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'fake-mcp', version: '1.0.0' },
      });
      continue;
    }

    if (msg.method === 'notifications/initialized') {
      continue;
    }

    if (!initialized) {
      fail(msg.id, 'not initialized');
      continue;
    }

    if (msg.method === 'tools/list') {
      respond(msg.id, {
        tools: [
          {
            name: 'echo',
            description: 'Echo input back',
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
          },
        ],
      });
      continue;
    }

    if (msg.method === 'tools/call') {
      respond(msg.id, {
        content: [
          {
            type: 'text',
            text: `echo:${msg.params?.arguments?.text || ''}`,
          },
        ],
      });
      continue;
    }

    fail(msg.id, `unknown method: ${msg.method}`);
  }
});
