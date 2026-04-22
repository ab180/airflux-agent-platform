import getPortReal, { portNumbers } from 'get-port';

export type GetPortLike = (options: { port: number[] }) => Promise<number>;

const defaultGetPort: GetPortLike = (opts) => getPortReal(opts);

/**
 * Pick a free port, preferring `preferred`, falling back through [min, max].
 * Injection point lets tests avoid opening real sockets.
 */
export async function pickPort(
  preferred: number,
  min: number,
  max: number,
  getPort: GetPortLike = defaultGetPort,
): Promise<number> {
  return getPort({ port: [preferred, ...portNumbers(min, max)] });
}
