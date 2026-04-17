/**
 * Local scheduler — runs cron jobs in-process using node-cron.
 *
 * Reads schedule configs from agents.yaml and executes agent queries
 * at the configured intervals. Results are posted to the message bus.
 *
 * For infrastructure deployment, replace with SST Cron / CloudWatch Events.
 *
 * ---
 * FROZEN 2026-04-18 — autonomous heartbeat concept
 *
 * The ops-agent "heartbeat" (every 2min autonomous tick) is paused at the
 * YAML level (settings/agents.yaml -> ops-agent -> heartbeat.enabled = false).
 * Do not reintroduce autonomous loops here or in agent YAML without an
 * unfreeze per docs/FROZEN.md. Explicit, user-initiated schedules are fine.
 */

import { schedule as cronSchedule, validate as cronValidate, type ScheduledTask } from 'node-cron';
import { AgentRegistry } from '@airflux/core';
import type { AgentContext, ScheduleConfig } from '@airflux/core';
import { HttpResponseChannel } from '@airflux/core';
import { sendMessage } from '../bus/message-bus.js';
import { logger } from '../lib/logger.js';
import { runWithRequestContext } from '../runtime/request-context.js';

interface ScheduleJob {
  agentName: string;
  schedule: ScheduleConfig;
  task: ScheduledTask;
}

const activeJobs: ScheduleJob[] = [];

export class Scheduler {
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.SCHEDULER_ENABLED !== 'false';
  }

  async initialize(): Promise<void> {
    if (!this.enabled) {
      logger.info('Scheduler disabled (SCHEDULER_ENABLED=false)');
      return;
    }

    const agents = AgentRegistry.listEnabled();
    let jobCount = 0;

    for (const agent of agents) {
      const config = agent.config;
      const schedules = config.schedule || [];

      for (const schedule of schedules) {
        if (schedule.enabled === false) continue;
        if (!cronValidate(schedule.cron)) {
          logger.warn('Invalid cron expression, skipping', {
            agent: config.name,
            schedule: schedule.name,
            cron: schedule.cron,
          });
          continue;
        }

        const task = cronSchedule(schedule.cron, () => {
          this.executeSchedule(config.name, schedule).catch(err => {
            logger.error('Scheduled execution failed', {
              agent: config.name,
              schedule: schedule.name,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        });

        activeJobs.push({ agentName: config.name, schedule, task });
        jobCount++;

        logger.info('Cron job registered', {
          agent: config.name,
          schedule: schedule.name,
          cron: schedule.cron,
        });
      }
    }

    logger.info('Scheduler initialized', { jobs: jobCount });
  }

  private async executeSchedule(agentName: string, schedule: ScheduleConfig): Promise<void> {
    const startTime = performance.now();
    logger.info('Executing scheduled task', { agent: agentName, schedule: schedule.name });

    const context: AgentContext = {
      question: schedule.question,
      userId: 'scheduler',
      sessionId: `cron-${agentName}-${Date.now()}`,
      source: 'cron',
      responseChannel: new HttpResponseChannel(),
      metadata: { scheduleName: schedule.name, cronExpression: schedule.cron },
    };

    try {
      const result = await runWithRequestContext({
        userId: 'scheduler',
        sessionId: context.sessionId,
        source: 'cron',
        agentName,
      }, () => AgentRegistry.execute(agentName, context));
      const durationMs = Math.round(performance.now() - startTime);

      // Post result to message bus as a finding
      await sendMessage({
        fromAgent: agentName,
        toAgent: '*', // broadcast
        type: 'finding',
        priority: 'normal',
        subject: `[Schedule] ${schedule.name}`,
        body: result.text || result.error || 'No output',
        metadata: {
          scheduleName: schedule.name,
          success: result.success,
          durationMs,
        },
      });

      logger.info('Scheduled task completed', {
        agent: agentName,
        schedule: schedule.name,
        success: result.success,
        durationMs,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('Scheduled task error', { agent: agentName, schedule: schedule.name, error: msg });

      await sendMessage({
        fromAgent: agentName,
        toAgent: '*',
        type: 'finding',
        priority: 'high',
        subject: `[Schedule Error] ${schedule.name}`,
        body: `Execution failed: ${msg}`,
        metadata: { scheduleName: schedule.name, error: true },
      });
    }
  }

  getActiveJobs(): { agent: string; name: string; cron: string }[] {
    return activeJobs.map(j => ({
      agent: j.agentName,
      name: j.schedule.name,
      cron: j.schedule.cron,
    }));
  }

  stop(): void {
    for (const job of activeJobs) {
      job.task.stop();
    }
    activeJobs.length = 0;
    logger.info('Scheduler stopped');
  }
}
