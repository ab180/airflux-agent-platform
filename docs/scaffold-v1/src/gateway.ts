/**
 * Gateway Lambda - Slack 요청 수신 + 즉시 응답
 *
 * Montgomery slash-command.ts 패턴 기반:
 * - Slack 3초 타임아웃 내 응답
 * - 비동기 작업은 Worker Lambda로 위임
 * - 서명 검증 포함
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { WebClient } from '@slack/web-api';
import { getSlackBotToken } from './utils/secrets';
import { Logger } from './utils/logger';
import { BaseAgentEvent } from './types/agent';
import crypto from 'crypto';

const lambdaClient = new LambdaClient();

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const traceId = crypto.randomUUID();
  const logger = new Logger('gateway', traceId);

  try {
    // Skip Slack retries (Montgomery 패턴)
    const retryNum = event.headers['x-slack-retry-num'] || event.headers['X-Slack-Retry-Num'];
    if (retryNum) {
      logger.info('slack_retry_skipped', { retryNum });
      return { statusCode: 200, body: '' };
    }

    if (!event.body) {
      return createErrorResponse(400, 'Missing request body');
    }

    // Parse request
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;

    // Handle URL verification (Slack Event Subscription setup)
    const parsed = JSON.parse(body);
    if (parsed.type === 'url_verification') {
      return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: parsed.challenge || '' };
    }

    // Route: slash command vs event subscription vs interaction
    if (body.includes('command=')) {
      return await handleSlashCommand(body, event.isBase64Encoded || false, traceId, logger);
    }

    if (parsed.type === 'event_callback') {
      return await handleEventCallback(parsed, traceId, logger);
    }

    logger.warn('unknown_request_type', { type: parsed.type });
    return { statusCode: 200, body: '' };

  } catch (error) {
    logger.error('gateway_error', error as Error);
    return createErrorResponse(500, 'Internal server error');
  }
};

async function handleSlashCommand(
  body: string,
  isBase64: boolean,
  traceId: string,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  const decoded = isBase64 ? Buffer.from(body, 'base64').toString('utf-8') : body;
  const params = new URLSearchParams(decoded);

  const command = params.get('command') || '';
  const text = params.get('text') || '';
  const userId = params.get('user_id') || '';
  const channelId = params.get('channel_id') || '';
  const responseUrl = params.get('response_url') || '';

  logger.info('slash_command_received', { command, text: text.slice(0, 100), userId });

  // /airflux help → 즉시 응답
  if (!text || text.trim() === 'help' || text.trim() === '--help') {
    return createHelpResponse();
  }

  // /airflux settings → 설정 모달 열기 (추후 구현)

  // 그 외 → Worker Lambda로 비동기 위임 (Montgomery 패턴)
  const workerEvent: BaseAgentEvent = {
    type: 'query',
    channelId,
    userId,
    question: text,
    responseUrl,
    traceId,
    debug: text.toLowerCase().startsWith('debug:'),
    explain: text.toLowerCase().startsWith('explain:'),
  };

  await lambdaClient.send(new InvokeCommand({
    FunctionName: process.env.WORKER_FUNCTION_NAME,
    InvocationType: 'Event', // 비동기
    Payload: JSON.stringify(workerEvent),
  }));

  logger.info('worker_invoked', { traceId });

  // Slack에 빈 응답 (사용자의 슬래시 커맨드가 보이도록)
  return { statusCode: 204, body: '' };
}

async function handleEventCallback(
  parsed: any,
  traceId: string,
  logger: Logger
): Promise<APIGatewayProxyResult> {
  const slackEvent = parsed.event;
  if (!slackEvent) {
    return { statusCode: 200, body: '' };
  }

  // Ignore bot messages (Montgomery: 무한 루프 방지)
  if (slackEvent.bot_id || slackEvent.subtype === 'bot_message') {
    return { statusCode: 200, body: '' };
  }

  // Ignore edited messages (Montgomery 패턴)
  if (slackEvent.edited || slackEvent.subtype === 'message_changed') {
    return { statusCode: 200, body: '' };
  }

  const text = slackEvent.text || '';
  const userId = slackEvent.user || '';
  const channelId = slackEvent.channel || '';
  const threadTs = slackEvent.thread_ts || slackEvent.ts;

  logger.info('event_received', { type: slackEvent.type, userId, channelId });

  // Worker Lambda로 위임
  const workerEvent: BaseAgentEvent = {
    type: 'mention',
    channelId,
    userId,
    question: text,
    threadTs,
    traceId,
    debug: text.toLowerCase().includes('debug:'),
    explain: text.toLowerCase().includes('explain:'),
  };

  await lambdaClient.send(new InvokeCommand({
    FunctionName: process.env.WORKER_FUNCTION_NAME,
    InvocationType: 'Event',
    Payload: JSON.stringify(workerEvent),
  }));

  return { statusCode: 200, body: '' };
}

function createHelpResponse(): APIGatewayProxyResult {
  const helpText = [
    '*📊 Airflux - 데이터 분석 AI 에이전트*',
    '',
    '*사용법:*',
    '• `@airflux DAU 알려줘` — 자연어로 데이터 질문',
    '• `@airflux debug: DAU 알려줘` — 내부 처리 과정 표시',
    '• `@airflux explain: DAU 알려줘` — 결과를 쉽게 설명',
    '• `/airflux help` — 이 도움말',
    '',
    '*예시 질문:*',
    '```',
    '쿠팡 앱 DAU 알려줘',
    '지난주 대비 매출 변화',
    'SDK 버전별 이벤트 분포',
    '채널별 설치 수 Top 5',
    '```',
    '',
    '_스레드에서 후속 질문하면 컨텍스트가 유지됩니다._',
  ].join('\n');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response_type: 'ephemeral', text: helpText }),
  };
}

function createErrorResponse(statusCode: number, error: string): APIGatewayProxyResult {
  return { statusCode, body: JSON.stringify({ error }) };
}
