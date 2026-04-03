/**
 * ResponseFormatter — 에이전트 결과를 Slack Block Kit으로 변환
 *
 * Montgomery 영감:
 * - link-info/formatter.ts: 독립 포맷터 모듈 (3-Layer Separation)
 * - sdk/processor.ts: 계층적 그룹핑 + Top-N + "Others" 롤업
 * - five-hundred/processor.ts: 쿼리 + 데이터소스 링크 포함
 * - dj/processor.ts: 동적 Block Kit 리스트 빌더
 *
 * Round 46: Structured Output의 confidence/tables_used도 표시
 */

import { AgentResult } from '../types/agent';
import { formatLLMResponseForSlack } from '../utils/markdown-to-slack';

interface SlackBlock {
  type: string;
  [key: string]: any;
}

export class ResponseFormatter {
  /**
   * AgentResult → Slack Block Kit 블록 배열로 변환
   * Progressive Disclosure (Round 5): 핵심 → 인사이트 → 데이터 → 쿼리 → 액션
   */
  static toSlackBlocks(result: AgentResult, queryId?: string): SlackBlock[] {
    const blocks: SlackBlock[] = [];

    // 1. 핵심 답변 (항상)
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: formatLLMResponseForSlack(result.summary, 3000) },
    });

    // 2. 파이프라인 경고 (있으면)
    if (result.pipelineWarning) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `⚠️ ${result.pipelineWarning}` }],
      });
    }

    // 3. 인사이트 (있으면)
    if (result.insights && result.insights.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*주요 인사이트:*\n' + result.insights.map(i => `• ${i}`).join('\n'),
        },
      });
    }

    // 4. 데이터 테이블 (10행 이하만 인라인, Montgomery sdk 패턴)
    if (result.dataTable && result.dataTable.rows.length > 0 && result.dataTable.rows.length <= 10) {
      const tableText = this.formatTable(result.dataTable);
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: tableText },
      });
    }

    // 5. 실행된 SQL (항상 — Montgomery Query Transparency)
    if (result.sql) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*실행된 쿼리:*\n\`\`\`sql\n${result.sql}\n\`\`\`` },
      });
    }

    // 6. 데이터 기준 시점
    if (result.dataFreshness) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_${result.dataFreshness}_` }],
      });
    }

    blocks.push({ type: 'divider' });

    // 7. 액션 버튼 (최대 5개 — Slack 제한)
    const actionElements: any[] = [];

    // 후속 질문 제안 (있으면, 최대 2개)
    if (result.followUpSuggestions && result.followUpSuggestions.length > 0) {
      result.followUpSuggestions.slice(0, 2).forEach((suggestion, i) => {
        actionElements.push({
          type: 'button',
          text: { type: 'plain_text', text: suggestion.slice(0, 30) },
          action_id: `followup_${i}_${queryId || 'x'}`,
          value: suggestion,
        });
      });
    }

    // CSV 내보내기 (데이터가 10행 초과 시)
    if (result.exportData && result.exportData.length > 10) {
      actionElements.push({
        type: 'button',
        text: { type: 'plain_text', text: `📋 CSV (${result.exportData.length}행)` },
        action_id: `export_csv_${queryId || 'x'}`,
      });
    }

    // 피드백 버튼 (항상 — Round 8 설계)
    actionElements.push(
      {
        type: 'button',
        text: { type: 'plain_text', text: '👍' },
        action_id: `feedback_positive_${queryId || 'x'}`,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '👎' },
        action_id: `feedback_negative_${queryId || 'x'}`,
      },
    );

    blocks.push({ type: 'actions', elements: actionElements.slice(0, 5) });

    return blocks;
  }

  /**
   * 데이터 테이블을 Slack mrkdwn 텍스트로 포맷
   * Montgomery sdk/processor.ts의 계층 그룹핑 패턴을 단순화
   */
  private static formatTable(table: { headers: string[]; rows: any[][] }): string {
    const { headers, rows } = table;

    // 헤더
    const headerLine = headers.map(h => `*${h}*`).join(' | ');

    // 행 (최대 10개)
    const rowLines = rows.slice(0, 10).map(row =>
      row.map(cell => {
        if (typeof cell === 'number') return cell.toLocaleString();
        if (cell === null || cell === undefined) return '-';
        return String(cell);
      }).join(' | ')
    );

    return `${headerLine}\n${rowLines.join('\n')}`;
  }

  /**
   * 에러 결과를 Block Kit으로 포맷
   * Montgomery: formatErrorBlocks 패턴 (에러 유형별 다른 헤더 + Tip)
   */
  static toErrorBlocks(errorMessage: string, suggestion?: string): SlackBlock[] {
    const blocks: SlackBlock[] = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `❌ ${errorMessage}` },
      },
    ];

    if (suggestion) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `💡 *Tip:* ${suggestion}` }],
      });
    }

    return blocks;
  }
}
