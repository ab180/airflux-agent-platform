/**
 * AgentRegistry - Central registry for all Airflux agents
 *
 * Montgomery 영감:
 * - CommandRegistry의 Singleton + lazy initialization
 * - register/get/has 패턴
 * - aliases 지원
 * - InteractionRegistry의 require() 기반 lazy loading
 */

import { BaseAgent } from './base-agent';
import { AgentCapability } from '../types/agent';
import { Logger } from '../utils/logger';

const logger = new Logger('agent-registry');

export class AgentRegistry {
  private static agents: Map<string, BaseAgent> = new Map();
  private static initialized = false;

  static async initialize(): Promise<void> {
    if (this.initialized) return;

    // Montgomery InteractionRegistry 패턴: lazy loading
    // require() 대신 dynamic import() 사용 (ESM 호환)
    const { SqlAgent } = await import('../agents/sql-agent');
    this.register(new SqlAgent());

    // 추후 추가:
    // const { InsightAgent } = require('../agents/insight-agent');
    // const { ReportAgent } = require('../agents/report-agent');
    // const { MonitorAgent } = require('../agents/monitor-agent');

    this.initialized = true;
  }

  static register(agent: BaseAgent): void {
    this.agents.set(agent.name, agent);
    logger.info('agent_registered', { agent: agent.name });
  }

  static async get(name: string): Promise<BaseAgent | undefined> {
    await this.initialize();
    return this.agents.get(name);
  }

  static async has(name: string): Promise<boolean> {
    await this.initialize();
    return this.agents.has(name);
  }

  static async getAll(): Promise<BaseAgent[]> {
    await this.initialize();
    return Array.from(this.agents.values());
  }

  static async getCapabilities(): Promise<AgentCapability[]> {
    await this.initialize();
    return Array.from(this.agents.values()).map(a => a.capability);
  }
}
