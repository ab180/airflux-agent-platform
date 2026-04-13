import type { ResponseChannel, AgentResult } from '../types/agent.js';

export class ConsoleResponseChannel implements ResponseChannel {
  type = 'console';

  async send(result: AgentResult): Promise<void> {
    if (result.success) {
      console.log('[Response]', result.text || JSON.stringify(result.data));
    } else {
      console.error('[Error]', result.error);
    }
  }
}

export class HttpResponseChannel implements ResponseChannel {
  type = 'http-response';
  private result: AgentResult | null = null;

  async send(result: AgentResult): Promise<void> {
    this.result = result;
  }

  getResult(): AgentResult | null {
    return this.result;
  }
}
