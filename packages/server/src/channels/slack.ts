/**
 * Slack integration channel (GSD-2 remote questions pattern).
 * Receives messages from Slack, routes to agents, sends responses back.
 */

import type { ResponseChannel, AgentResult } from '@airflux/core';
import { logger } from '../lib/logger.js';

export class SlackResponseChannel implements ResponseChannel {
  type = 'slack';

  constructor(
    private responseUrl: string,
    private channelId: string,
    private threadTs?: string,
  ) {}

  async send(result: AgentResult): Promise<void> {
    const text = result.success
      ? result.text || '(응답 없음)'
      : `오류: ${result.error || 'Unknown error'}`;

    try {
      // Use Slack's response_url for ephemeral responses, or chat.postMessage for thread replies
      const slackToken = process.env.SLACK_BOT_TOKEN;
      if (slackToken && this.channelId) {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${slackToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: this.channelId,
            text,
            thread_ts: this.threadTs,
          }),
        });
      } else if (this.responseUrl) {
        // Fallback to response_url (works for slash commands)
        await fetch(this.responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, response_type: 'in_channel' }),
        });
      }
    } catch (e) {
      logger.error('Slack response failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }
}
