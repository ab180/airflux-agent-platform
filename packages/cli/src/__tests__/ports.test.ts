import { describe, it, expect, vi } from 'vitest';
import { pickPort } from '../ports.js';

describe('pickPort', () => {
  it('asks get-port with preferred port first, then the range', async () => {
    const fakeGetPort = vi.fn().mockResolvedValue(3100);
    const port = await pickPort(3100, 3100, 3199, fakeGetPort);
    expect(port).toBe(3100);
    expect(fakeGetPort).toHaveBeenCalledOnce();
    const call = fakeGetPort.mock.calls[0]![0] as { port: number[] };
    expect(call.port[0]).toBe(3100);
    expect(call.port.length).toBe(101);
    expect(call.port[1]).toBe(3100);
    expect(call.port.at(-1)).toBe(3199);
  });

  it('falls back to alternative when preferred is busy (simulated)', async () => {
    const fakeGetPort = vi.fn().mockResolvedValue(3105);
    const port = await pickPort(3100, 3100, 3199, fakeGetPort);
    expect(port).toBe(3105);
  });
});
