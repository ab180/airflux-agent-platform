/**
 * MySQL DataSource — Montgomery src/utils/database.ts에서 포팅
 *
 * Montgomery 패턴:
 * - 커넥션 캐싱 (Lambda warm start 재사용)
 * - Ping으로 커넥션 상태 확인
 * - 실패 시 resetConnection (자가 복구)
 * - Credentials 캐싱 (5분 TTL, secrets.ts 활용)
 */

import mysql from 'mysql2/promise';
import { getDBCredentials } from '../utils/secrets';

let cachedConnection: mysql.Connection | null = null;

export async function getMySQLConnection(): Promise<mysql.Connection> {
  if (cachedConnection) {
    try {
      await cachedConnection.ping();
      return cachedConnection;
    } catch {
      console.log('MySQL cached connection dead, reconnecting');
      cachedConnection = null;
    }
  }

  const credentials = await getDBCredentials();
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'api.reader.main.db.airbridge.io',
    user: credentials.username,
    password: credentials.password,
    database: process.env.DB_NAME || 'udl',
    connectTimeout: 60000,
  });

  cachedConnection = connection;
  return connection;
}

export function resetMySQLConnection(): void {
  cachedConnection = null;
}

/**
 * 쿼리 실행 헬퍼 (Montgomery find-app/processor.ts 패턴)
 */
export async function executeMySQLQuery(sql: string, params?: any[]): Promise<any[]> {
  const connection = await getMySQLConnection();
  try {
    const [rows] = await connection.execute(sql, params);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    resetMySQLConnection();
    throw error;
  }
}
