/**
 * Snowflake DataSource — Montgomery database.ts 패턴 + Round 29 SnowflakePool 설계
 *
 * Montgomery 패턴 적용:
 * - 커넥션 싱글턴 캐싱 (Lambda warm start 재사용)
 * - Ping으로 상태 확인 → 죽으면 재연결
 * - resetConnection 자가 복구
 * - Credentials 캐싱 (secrets.ts)
 *
 * Round 29 추가:
 * - 5분 유휴 시 재연결
 * - Handler 밖에서 pre-warming
 *
 * Round 31 추가:
 * - SQL 자동 최적화 (파티션 키, LIMIT, SELECT *)
 */

import { getSnowflakeCredentials, SnowflakeCredentials } from '../utils/secrets';
import { Logger } from '../utils/logger';

const logger = new Logger('snowflake');

// Snowflake SDK의 Connection 타입 (실제 사용 시 snowflake-sdk import)
// MVP에서는 REST API 방식으로 대체 가능
interface SnowflakeConnection {
  execute: (opts: { sqlText: string }) => Promise<{ getRows: () => any[] }>;
  destroy: () => void;
  isValid: () => Promise<boolean>;
}

let cachedConnection: SnowflakeConnection | null = null;
let lastUsed: number = 0;
const MAX_IDLE_MS = 5 * 60 * 1000; // 5분

/**
 * Snowflake 연결 획득 (캐싱 + ping + 유휴 타임아웃)
 */
export async function getSnowflakeConnection(): Promise<SnowflakeConnection> {
  const now = Date.now();

  // 캐시된 연결이 있고 유휴 시간 내면 재사용
  if (cachedConnection && now - lastUsed < MAX_IDLE_MS) {
    try {
      if (await cachedConnection.isValid()) {
        lastUsed = now;
        return cachedConnection;
      }
    } catch {
      logger.warn('snowflake_ping_failed');
      cachedConnection = null;
    }
  }

  // 새 연결 생성
  const creds = await getSnowflakeCredentials();
  cachedConnection = await createConnection(creds);
  lastUsed = Date.now();
  logger.info('snowflake_connected', { warehouse: creds.warehouse, database: creds.database });
  return cachedConnection;
}

export function resetSnowflakeConnection(): void {
  if (cachedConnection) {
    try { cachedConnection.destroy(); } catch { /* ignore */ }
    cachedConnection = null;
  }
}

/**
 * SQL 실행 + 결과 반환
 */
export async function executeSnowflakeQuery(sql: string): Promise<{ rows: any[]; rowCount: number }> {
  const connection = await getSnowflakeConnection();

  try {
    const result = await connection.execute({ sqlText: sql });
    const rows = result.getRows();
    logger.info('snowflake_query_executed', { rowCount: rows.length, sql: sql.slice(0, 100) });
    return { rows, rowCount: rows.length };
  } catch (error) {
    logger.error('snowflake_query_failed', error as Error, { sql: sql.slice(0, 200) });
    resetSnowflakeConnection(); // Montgomery: 에러 시 커넥션 리셋
    throw error;
  }
}

/**
 * 실제 Snowflake 연결 생성
 * TODO: snowflake-sdk 사용 시 이 함수를 실제 구현으로 교체
 */
async function createConnection(creds: SnowflakeCredentials): Promise<SnowflakeConnection> {
  // MVP: Mock 연결 (snowflake-sdk 설치 후 실제 구현으로 교체)
  // 실제 구현:
  // const snowflake = require('snowflake-sdk');
  // const connection = snowflake.createConnection({
  //   account: creds.account,
  //   username: creds.username,
  //   password: creds.password,
  //   warehouse: creds.warehouse,
  //   database: creds.database,
  //   schema: 'PUBLIC',
  //   clientSessionKeepAlive: true,
  // });
  // await new Promise((resolve, reject) => connection.connect((err) => err ? reject(err) : resolve(null)));
  // return connection;

  logger.warn('snowflake_mock_connection', { message: 'Using mock connection. Replace with real snowflake-sdk.' });

  return {
    execute: async ({ sqlText }) => {
      console.log('[Snowflake Mock] Execute:', sqlText.slice(0, 100));
      return {
        getRows: () => [{ _mock: true, message: 'Replace with real Snowflake connection' }],
      };
    },
    destroy: () => {},
    isValid: async () => true,
  };
}
