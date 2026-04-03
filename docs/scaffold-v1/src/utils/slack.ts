/**
 * Slack Utilities — Montgomery src/utils/slack.ts에서 포팅
 *
 * 직접 재활용한 함수들:
 * - parseSlackRequest: URL-encoded body → 구조체
 * - postOrUpdateMessage: 통합 post/update 인터페이스
 * - getBotUserId: 봇 자기 참조 캐싱
 * - extractMentionedUserIds: 멘션 추출
 * - replaceMentionsWithEmails: 멘션 → @이름(email) 변환
 */

import { WebClient } from '@slack/web-api';
import { getSlackBotToken } from './secrets';

// ── Bot User ID Cache (Montgomery 패턴: 무한 루프 방지) ──

let cachedBotUserId: string | null = null;

export async function getBotUserId(slackClient: WebClient): Promise<string> {
  if (cachedBotUserId) return cachedBotUserId;
  const authResult = await slackClient.auth.test();
  cachedBotUserId = authResult.user_id as string;
  return cachedBotUserId;
}

// ── Slack Client Factory ──

export async function getSlackClient(): Promise<WebClient> {
  const token = await getSlackBotToken();
  return new WebClient(token);
}

// ── Request Parsing (Montgomery: parseSlackRequest) ──

export interface SlackSlashCommand {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}

export function parseSlackRequest(body: string, isBase64Encoded: boolean = false): SlackSlashCommand {
  const decoded = isBase64Encoded ? Buffer.from(body, 'base64').toString('utf-8') : body;
  const params = new URLSearchParams(decoded);
  return {
    token: params.get('token') || '',
    team_id: params.get('team_id') || '',
    team_domain: params.get('team_domain') || '',
    channel_id: params.get('channel_id') || '',
    channel_name: params.get('channel_name') || '',
    user_id: params.get('user_id') || '',
    user_name: params.get('user_name') || '',
    command: params.get('command') || '',
    text: params.get('text') || '',
    response_url: params.get('response_url') || '',
    trigger_id: params.get('trigger_id') || '',
  };
}

// ── Unified Post/Update (Montgomery: postOrUpdateMessage) ──

export async function postOrUpdateMessage(
  slackClient: WebClient,
  channelId: string,
  threadTs: string | undefined,
  messageTs: string | undefined,
  text: string,
  blocks?: any[]
): Promise<string> {
  const payload: any = { channel: channelId, text };
  if (blocks) payload.blocks = blocks;

  if (messageTs) {
    const result = await slackClient.chat.update({ ...payload, ts: messageTs });
    return result.ts as string;
  } else {
    const result = await slackClient.chat.postMessage({ ...payload, thread_ts: threadTs });
    return result.ts as string;
  }
}

// ── Mention Handling (Montgomery 패턴) ──

export function extractMentionedUserIds(text: string): string[] {
  const mentionPattern = /<@(U[A-Z0-9]+)>/g;
  const userIds: string[] = [];
  let match;
  while ((match = mentionPattern.exec(text)) !== null) {
    userIds.push(match[1]);
  }
  return Array.from(new Set(userIds));
}

export async function replaceMentionsWithEmails(
  text: string,
  slackClient: WebClient,
  excludeBotMention: boolean = true
): Promise<string> {
  const userIds = extractMentionedUserIds(text);
  if (userIds.length === 0) return text;

  let botUserId: string | null = null;
  if (excludeBotMention) {
    botUserId = await getBotUserId(slackClient);
  }

  const userInfoMap = new Map<string, string>();
  for (const userId of userIds) {
    if (botUserId && userId === botUserId) {
      userInfoMap.set(userId, ''); // 봇 멘션 제거
      continue;
    }
    try {
      const info = await slackClient.users.info({ user: userId });
      const displayName = info.user?.profile?.display_name || info.user?.profile?.real_name || userId;
      const email = info.user?.profile?.email;
      userInfoMap.set(userId, email ? `@${displayName}(${email})` : `@${displayName}`);
    } catch {
      userInfoMap.set(userId, `@${userId}`);
    }
  }

  let result = text;
  userInfoMap.forEach((replacement, userId) => {
    result = result.replace(new RegExp(`<@${userId}>`, 'g'), replacement);
  });
  return result.trim();
}
