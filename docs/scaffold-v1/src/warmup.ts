/**
 * Warmup Lambda - Worker Lambda cold start 방지
 * 5분마다 빈 호출로 인스턴스 유지 (Round 29 설계)
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient();

export const handler = async (): Promise<void> => {
  const functionName = process.env.WORKER_FUNCTION_NAME;
  if (!functionName) {
    console.warn('WORKER_FUNCTION_NAME not set');
    return;
  }

  await lambdaClient.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'Event',
    Payload: JSON.stringify({ type: '__warmup__' }),
  }));

  console.log(`Warmup sent to ${functionName}`);
};
