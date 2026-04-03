/**
 * Slack Request Signature Verification (Round 20 설계)
 *
 * Montgomery는 서명 검증이 없었음 → Airflux는 프로덕션 보안을 위해 필수 구현
 * Replay attack 방지 (5분 타임스탬프 검증)
 * Timing-safe comparison
 */

import crypto from 'crypto';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getSlackSigningSecret } from './secrets';

type LambdaHandler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

export function verifySlackRequest(
  body: string,
  timestamp: string,
  signature: string,
  signingSecret: string
): boolean {
  // 1. 타임스탬프 검증 (5분 이내만 허용 - replay attack 방지)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    console.warn('Slack request timestamp too old:', { now, timestamp });
    return false;
  }

  // 2. HMAC-SHA256 서명 생성
  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring)
    .digest('hex');

  // 3. Timing-safe 비교 (타이밍 공격 방지)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(mySignature),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Slack 서명 검증 미들웨어 래퍼
 * 모든 Slack-facing Lambda handler에 적용
 */
export function withSlackVerification(handler: LambdaHandler): LambdaHandler {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // dev 환경에서는 서명 검증 스킵 (선택적)
    if (process.env.STAGE === 'dev' && process.env.SKIP_SLACK_VERIFY === 'true') {
      return handler(event);
    }

    const timestamp = event.headers['x-slack-request-timestamp']
      || event.headers['X-Slack-Request-Timestamp'] || '';
    const signature = event.headers['x-slack-signature']
      || event.headers['X-Slack-Signature'] || '';

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : event.body || '';

    try {
      const signingSecret = await getSlackSigningSecret();
      if (!verifySlackRequest(body, timestamp, signature, signingSecret)) {
        console.warn('Slack signature verification failed');
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature' }) };
      }
    } catch (error) {
      console.error('Error during signature verification:', error);
      // 시크릿 조회 실패 시에도 요청 차단 (보안 우선)
      return { statusCode: 500, body: JSON.stringify({ error: 'Verification error' }) };
    }

    return handler(event);
  };
}
