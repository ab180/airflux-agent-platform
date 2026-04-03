/**
 * Druid DataSource — Montgomery src/utils/druid.ts에서 포팅
 *
 * Montgomery 패턴:
 * - Basic Auth (credentials 캐싱)
 * - SQL-over-HTTP API
 * - 결과 파싱 (header row + data rows)
 */

import { getDruidCredentials } from '../utils/secrets';

const DRUID_ENDPOINT = process.env.DRUID_ENDPOINT || 'http://lb.druid.ab180.co:8888/druid/v2/sql/';

export async function executeDruidQuery(query: string): Promise<any[]> {
  const credentials = await getDruidCredentials();
  const auth = Buffer.from(`${credentials.id}:${credentials.password}`).toString('base64');

  const response = await fetch(DRUID_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify({ query, header: true, resultFormat: 'array' }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Druid query failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // 첫 행은 헤더 → 나머지를 객체 배열로 변환
  if (!data || data.length <= 1) return [];

  const headers = data[0] as string[];
  return data.slice(1).map((row: any[]) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}
