import { WebClient } from '@slack/web-api';

// ── Agent Context ──

export interface AgentContext {
  userId: string;
  userEmail?: string;
  channelId: string;
  threadTs?: string;
  question: string;
  images?: ImageContent[];
  slack: WebClient;
  traceId: string;
  debug: boolean;
  explain: boolean;
  workingMemory: Map<string, any>;
}

export interface ImageContent {
  media_type: string;
  data: string; // base64
}

// ── Agent Result ──

export interface AgentResult {
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  insights?: string[];
  dataTable?: { headers: string[]; rows: any[][] };
  chart?: { type: string; data: any; title: string };
  sql?: string;
  followUpSuggestions?: string[];
  dataFreshness?: string;
  pipelineWarning?: string;
  exportData?: any[];
  metadata: ResultMetadata;
}

export interface ResultMetadata {
  agentType: string;
  model: string;
  latencyMs: number;
  costUsd: number;
  traceId: string;
  cached: boolean;
}

// ── Agent Capability ──

export interface AgentCapability {
  name: string;
  description: string;
  examples: string[];
  requiredDataSources: string[];
}

// ── Agent Tool ──

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  execute: (input: any, context: AgentContext) => Promise<any>;
}

// ── Processor Event (Montgomery 호환) ──

export type AgentEventType = 'query' | 'mention' | '__warmup__';

export interface BaseAgentEvent {
  type: AgentEventType;
  channelId: string;
  userId: string;
  threadTs?: string;
  question: string;
  responseUrl?: string;
  traceId: string;
  debug?: boolean;
  explain?: boolean;
}
