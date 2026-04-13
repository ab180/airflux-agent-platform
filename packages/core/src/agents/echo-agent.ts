import { BaseAgent } from './base-agent.js';
import type { AgentContext, AgentResult } from '../types/agent.js';

export class EchoAgent extends BaseAgent {
  async execute(context: AgentContext): Promise<AgentResult> {
    return {
      success: true,
      text: `[Echo Agent] Received: "${context.question}" from ${context.source} (user: ${context.userId})`,
      metadata: {
        agent: this.name,
        tools: this.getToolNames(),
        timestamp: new Date().toISOString(),
      },
    };
  }
}
