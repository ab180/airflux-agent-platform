/**
 * BaseAgent - Abstract base class for all Airflux agents
 *
 * Montgomery 영감:
 * - BaseProcessor의 sendThreadReply/sendErrorReply 헬퍼 → sendProgress/sendError
 * - formatUserMention → Slack 메시지 포맷팅
 * - postInitialMessage → 진행 상태 표시
 */

import { AgentContext, AgentResult, AgentCapability } from '../types/agent';

export abstract class BaseAgent {
  abstract name: string;
  abstract description: string;
  abstract capability: AgentCapability;

  abstract execute(context: AgentContext): Promise<AgentResult>;

  // ── Slack Communication Helpers (Montgomery BaseProcessor 패턴) ──

  protected async sendProgress(context: AgentContext, message: string): Promise<void> {
    try {
      await context.slack.chat.postMessage({
        channel: context.channelId,
        text: message,
        thread_ts: context.threadTs,
      });
    } catch (error) {
      console.error('Failed to send progress message:', error);
    }
  }

  protected async sendError(context: AgentContext, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown error';
    try {
      await context.slack.chat.postMessage({
        channel: context.channelId,
        text: `<@${context.userId}> ❌ ${message}`,
        thread_ts: context.threadTs,
      });
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  }

  protected formatUserMention(userId: string): string {
    return `<@${userId}>`;
  }

  // ── Emoji Feedback (Montgomery 패턴) ──

  protected async addReaction(context: AgentContext, emoji: string): Promise<void> {
    try {
      // threadTs가 있으면 원본 메시지에 이모지 추가
      const ts = context.threadTs;
      if (ts) {
        await context.slack.reactions.add({
          channel: context.channelId,
          timestamp: ts,
          name: emoji,
        });
      }
    } catch {
      // 이모지 실패는 무시 (메인 플로우에 영향 없음)
    }
  }

  protected async removeReaction(context: AgentContext, emoji: string): Promise<void> {
    try {
      const ts = context.threadTs;
      if (ts) {
        await context.slack.reactions.remove({
          channel: context.channelId,
          timestamp: ts,
          name: emoji,
        });
      }
    } catch {
      // 무시
    }
  }
}
