/**
 * NetworkState — typed, inspectable state carried across a multi-agent
 * routing/execution graph. Inspired by Inngest Agent Kit.
 *
 * Generic `TData` is user-defined. History records every agent a router
 * selected and why, giving observability/replay a natural source.
 */

export interface RoutingHistoryEntry {
  agent: string;
  reason: string;
  at: number;
}

export interface NetworkState<
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  history: RoutingHistoryEntry[];
  data: TData;
  pushAgent(agent: string, reason: string): void;
}

export interface CreateNetworkStateOptions<T extends Record<string, unknown>> {
  data?: T;
}

export function createNetworkState<
  T extends Record<string, unknown> = Record<string, unknown>,
>(options: CreateNetworkStateOptions<T> = {}): NetworkState<T> {
  const history: RoutingHistoryEntry[] = [];
  const data = (options.data ?? ({} as T));
  return {
    history,
    data,
    pushAgent(agent, reason) {
      history.push({ agent, reason, at: Date.now() });
    },
  };
}
