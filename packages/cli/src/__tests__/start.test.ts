import { describe, it, expect, vi } from 'vitest';
import { planStart } from '../commands/start.js';

describe('planStart', () => {
  it('reuses running pg container and picks free ports', async () => {
    const runner = {
      exec: vi.fn()
        // inspect -> running
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'running', stderr: '' })
        // pg_isready
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
        // inspect for port retrieval
        .mockResolvedValueOnce({ exitCode: 0, stdout: '5433', stderr: '' }),
    };
    const getPort = vi.fn().mockResolvedValueOnce(3100).mockResolvedValueOnce(3200);
    const plan = await planStart({
      runner,
      getPort,
      pgConfig: {
        containerName: 'airops-pg',
        volumeName: 'airops-pgdata',
        port: 5432,
        user: 'airops',
        password: 'airops',
        database: 'airops',
        image: 'postgres:16-alpine',
      },
    });
    expect(plan.pg.reused).toBe(true);
    expect(plan.pg.port).toBe(5433);
    expect(plan.server.port).toBe(3100);
    expect(plan.web.port).toBe(3200);
    expect(plan.server.env.DATABASE_URL).toBe('postgres://airops:airops@localhost:5433/airops');
    expect(plan.server.env.PORT).toBe('3100');
    expect(plan.web.env.PORT).toBe('3200');
    expect(plan.web.env.API_URL).toBe('http://localhost:3100');
  });

  it('creates pg container when missing', async () => {
    const runner = {
      exec: vi.fn()
        .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })  // inspect missing
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'id', stderr: '' }) // run
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })   // pg_isready
        .mockResolvedValueOnce({ exitCode: 0, stdout: '5432', stderr: '' }), // port inspect
    };
    const getPort = vi.fn().mockResolvedValue(3100);
    const plan = await planStart({
      runner,
      getPort,
      pgConfig: {
        containerName: 'airops-pg',
        volumeName: 'airops-pgdata',
        port: 5432,
        user: 'airops',
        password: 'airops',
        database: 'airops',
        image: 'postgres:16-alpine',
      },
    });
    expect(plan.pg.reused).toBe(false);
  });
});
