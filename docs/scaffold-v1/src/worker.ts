/**
 * Worker Lambda - 에이전트 실행 (비동기)
 *
 * Montgomery async-processor.ts 패턴 기반:
 * - Event 수신 → AgentRegistry에서 에이전트 선택 → 실행
 * - 에러 시 resetConnection + 사용자 알림
 * - Slack 클라이언트 인증 실패 시 graceful degradation
 */

import { WebClient } from '@slack/web-api';
import { AgentRegistry } from './core/agent-registry';
import { ResponseFormatter } from './core/response-formatter';
import { BaseAgentEvent, AgentContext } from './types/agent';
import { AirfluxError } from './types/errors';
import { getOrCreateSession, addQuestionToSession } from './core/session-state';
import { getSlackBotToken } from './utils/secrets';
import { Logger } from './utils/logger';

// ── Pre-warming (Cold Start 최적화) ──
const slackClientPromise = getSlackBotToken()
  .then(token => new WebClient(token))
  .catch(e => {
    console.warn('Pre-warm Slack failed, will retry:', e);
    return null;
  });

export const handler = async (event: BaseAgentEvent): Promise<void> => {
  // Warmup ping (Round 29)
  if (event.type === '__warmup__') {
    console.log('Warmup ping');
    return;
  }

  const logger = new Logger('worker', event.traceId, event.userId);
  logger.info('worker_started', { type: event.type, question: event.question?.slice(0, 100) });

  try {
    // Slack 클라이언트 (Montgomery: graceful degradation)
    let slackClient = await slackClientPromise;
    if (!slackClient) {
      try {
        const token = await getSlackBotToken();
        slackClient = new WebClient(token);
      } catch {
        logger.warn('slack_auth_failed_using_unauthenticated');
        slackClient = new WebClient();
      }
    }

    // 진행 이모지 추가 (Montgomery: thought_balloon 패턴)
    if (event.threadTs) {
      try {
        await slackClient.reactions.add({
          channel: event.channelId,
          timestamp: event.threadTs,
          name: 'thought_balloon',
        });
      } catch { /* 무시 */ }
    }

    // prefix 파싱 (Montgomery: parseThinkPrefix/parseAgentPrefix 패턴)
    let question = event.question;
    if (event.debug) question = question.replace(/^debug[:\s]\s*/i, '');
    if (event.explain) question = question.replace(/^explain[:\s]\s*/i, '');
    // 봇 멘션 제거
    question = question.replace(/<@[A-Z0-9]+>/g, '').trim();

    // 빈 질문 처리
    if (!question) {
      await slackClient.chat.postMessage({
        channel: event.channelId,
        text: '안녕하세요! 무엇을 도와드릴까요? `/airflux help`로 사용법을 확인하세요.',
        thread_ts: event.threadTs,
      });
      return;
    }

    // 세션 상태 추적 (Montgomery thread-state.ts 패턴)
    const session = event.threadTs
      ? getOrCreateSession(event.threadTs, event.userId, event.channelId)
      : undefined;

    // 에이전트 컨텍스트 구성
    const context: AgentContext = {
      userId: event.userId,
      channelId: event.channelId,
      threadTs: event.threadTs,
      question,
      slack: slackClient,
      traceId: event.traceId,
      debug: event.debug || false,
      explain: event.explain || false,
      workingMemory: new Map(),
    };

    // 에이전트 선택 + 실행 (현재는 SQL Agent 직접 선택, 추후 Router Agent 도입)
    const agent = await AgentRegistry.get('sql-agent');
    if (!agent) {
      logger.error('agent_not_found', new Error('sql-agent not registered'));
      await slackClient.chat.postMessage({
        channel: event.channelId,
        text: `<@${event.userId}> ❌ 에이전트를 찾을 수 없습니다.`,
        thread_ts: event.threadTs,
      });
      return;
    }

    const result = await logger.timed('agent_execution', () => agent.execute(context), { agent: agent.name });

    // 세션에 질문 기록
    if (session && event.threadTs) {
      addQuestionToSession(event.threadTs, question, result.sql);
    }

    // 결과 전달 (ResponseFormatter — Montgomery 3-Layer Separation 패턴)
    const queryId = `${event.traceId.slice(0, 8)}`;
    const blocks = ResponseFormatter.toSlackBlocks(result, queryId);

    await slackClient.chat.postMessage({
      channel: event.channelId,
      text: result.summary,  // 블록 미지원 클라이언트용 폴백 텍스트
      blocks,
      thread_ts: event.threadTs,
    });

    // 진행 이모지 제거
    if (event.threadTs) {
      try {
        await slackClient.reactions.remove({
          channel: event.channelId,
          timestamp: event.threadTs,
          name: 'thought_balloon',
        });
      } catch { /* 무시 */ }
    }

    logger.info('worker_completed', {
      agent: agent.name,
      latencyMs: result.metadata.latencyMs,
      costUsd: result.metadata.costUsd,
      cached: result.metadata.cached,
    });

  } catch (error) {
    logger.error('worker_error', error as Error);

    // 에러 이모지 (Montgomery 패턴)
    try {
      const slack = await slackClientPromise || new WebClient();
      if (event.threadTs) {
        try { await slack.reactions.remove({ channel: event.channelId, timestamp: event.threadTs, name: 'thought_balloon' }); } catch {}
        try { await slack.reactions.add({ channel: event.channelId, timestamp: event.threadTs, name: 'x' }); } catch {}
      }

      // AirfluxError: 구조화된 에러 코드 기반 맞춤 메시지 (Round 21/64)
      // Montgomery: 에러 유형별 맞춤 메시지 패턴 확장
      let userText: string;
      if (error instanceof AirfluxError) {
        userText = `❌ ${error.userMessage}`;
        logger.warn('airflux_error', { code: error.code, severity: error.severity });
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isMessageTooLarge = errorMessage.includes('262144 bytes');
        userText = isMessageTooLarge
          ? '❌ 결과가 너무 큽니다. 더 좁은 범위로 질문해주세요.'
          : '❌ 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      }

      await slack.chat.postMessage({
        channel: event.channelId,
        text: `<@${event.userId}> ${userText}`,
        thread_ts: event.threadTs,
      });
    } catch (sendError) {
      logger.error('error_notification_failed', sendError as Error);
    }
  }
};
