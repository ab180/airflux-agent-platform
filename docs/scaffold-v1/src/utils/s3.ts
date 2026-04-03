/**
 * S3 Utilities — Montgomery src/utils/s3.ts에서 포팅
 *
 * Montgomery 패턴:
 * - Presigned URL로 대용량 데이터 전달 (256KB SQS 제한 우회)
 * - 7일 만료 설정
 * - 고유 키 생성 (타임스탬프 + 랜덤ID)
 * - S3Client 싱글턴 캐싱
 *
 * Airflux 확장:
 * - 차트 이미지 업로드 (Round 10)
 * - CSV/JSON 내보내기 (Round 26)
 * - 분석 결과 공유 (Round 13)
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const CHART_BUCKET = process.env.CHART_BUCKET || 'airflux-charts-dev';
const EXPORT_BUCKET = process.env.EXPORT_BUCKET || CHART_BUCKET; // 같은 버킷 사용 가능
const PRESIGNED_URL_EXPIRATION = 24 * 60 * 60; // 24시간 (내보내기용)

// S3 Client 싱글턴 (Montgomery 패턴: Lambda warm start에서 재사용)
let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-1' });
  }
  return s3Client;
}

/**
 * 파일을 S3에 업로드하고 presigned URL 반환
 */
export async function uploadToS3(
  content: Buffer | string,
  key: string,
  contentType: string,
  bucket: string = CHART_BUCKET,
  expiresIn: number = PRESIGNED_URL_EXPIRATION
): Promise<string> {
  const client = getS3Client();

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: typeof content === 'string' ? Buffer.from(content) : content,
    ContentType: contentType,
  }));

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn }
  );

  return url;
}

/**
 * 차트 이미지 업로드 (Round 10 Chart Pipeline)
 */
export async function uploadChart(imageBuffer: Buffer, title: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const randomId = Math.random().toString(36).substring(2, 8);
  const key = `charts/${timestamp}-${randomId}.png`;

  return uploadToS3(imageBuffer, key, 'image/png');
}

/**
 * CSV 내보내기 (Round 26 Data Export)
 * UTF-8 BOM 추가로 Excel 한글 깨짐 방지
 */
export async function exportCSV(data: any[], fileName: string): Promise<string> {
  if (data.length === 0) throw new Error('No data to export');

  const BOM = '\uFEFF';
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => escapeCSV(row[h])).join(',')
  );
  const csv = BOM + [headers.join(','), ...rows].join('\n');

  const timestamp = Date.now();
  const key = `exports/${timestamp}-${fileName}.csv`;

  return uploadToS3(csv, key, 'text/csv; charset=utf-8', EXPORT_BUCKET);
}

/**
 * JSON 내보내기
 */
export async function exportJSON(data: any[], fileName: string): Promise<string> {
  const json = JSON.stringify(data, null, 2);
  const key = `exports/${Date.now()}-${fileName}.json`;
  return uploadToS3(json, key, 'application/json', EXPORT_BUCKET);
}

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
