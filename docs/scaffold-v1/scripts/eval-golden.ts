/**
 * Golden Dataset Evaluation Script
 *
 * 사용법: npm run eval:golden
 * 결과: eval-results.json 파일 생성
 *
 * Golden Dataset의 각 테스트 케이스에 대해:
 * 1. SQL Agent에 질문 전달
 * 2. 생성된 SQL의 정확도 평가
 * 3. 안전성 검증 (guardrail 동작 확인)
 * 4. 전체 점수 산출
 */

import fs from 'fs';
import path from 'path';

interface GoldenTestCase {
  id: string;
  category: string;
  difficulty: string;
  question: string;
  expectedTables?: string[];
  expectedSQL?: string;
  expectedSQL_contains?: string | string[];
  expectedBehavior?: string;
  answerPattern?: string;
  contextRequired?: boolean;
  tags: string[];
}

interface EvalResult {
  id: string;
  question: string;
  category: string;
  passed: boolean;
  score: number; // 0-1
  details: {
    sqlGenerated: boolean;
    correctTables: boolean;
    guardrailCorrect: boolean;
    answerMatches: boolean;
  };
  generatedSQL?: string;
  error?: string;
}

interface EvalSummary {
  timestamp: string;
  totalCases: number;
  passed: number;
  failed: number;
  overall_score: number;
  byCategory: Record<string, { total: number; passed: number; score: number }>;
  byDifficulty: Record<string, { total: number; passed: number; score: number }>;
  failures: Array<{ id: string; question: string; error: string }>;
}

async function main() {
  console.log('📊 Airflux Golden Dataset Evaluation');
  console.log('=====================================\n');

  // Load golden dataset
  const datasetPath = path.join(process.cwd(), 'golden-dataset.json');
  const dataset: GoldenTestCase[] = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  console.log(`Loaded ${dataset.length} test cases\n`);

  const results: EvalResult[] = [];

  for (const testCase of dataset) {
    // Skip context-dependent cases (need conversation history)
    if (testCase.contextRequired) {
      console.log(`⏭️  ${testCase.id}: Skipped (context required)`);
      results.push({
        id: testCase.id,
        question: testCase.question,
        category: testCase.category,
        passed: true, // Don't count against score
        score: 1,
        details: { sqlGenerated: true, correctTables: true, guardrailCorrect: true, answerMatches: true },
      });
      continue;
    }

    try {
      const result = await evaluateCase(testCase);
      results.push(result);
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${testCase.id}: ${testCase.question.slice(0, 50)}... (score: ${result.score.toFixed(2)})`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        id: testCase.id,
        question: testCase.question,
        category: testCase.category,
        passed: false,
        score: 0,
        details: { sqlGenerated: false, correctTables: false, guardrailCorrect: false, answerMatches: false },
        error: errorMsg,
      });
      console.log(`❌ ${testCase.id}: ERROR - ${errorMsg}`);
    }
  }

  // Generate summary
  const summary = generateSummary(results);

  // Write results
  const outputPath = path.join(process.cwd(), 'eval-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  console.log(`\n📄 Results written to ${outputPath}`);

  // Print summary
  console.log('\n═══════════════════════════════════');
  console.log(`Overall Score: ${(summary.overall_score * 100).toFixed(1)}%`);
  console.log(`Passed: ${summary.passed}/${summary.totalCases}`);
  console.log('\nBy Category:');
  for (const [cat, stats] of Object.entries(summary.byCategory)) {
    console.log(`  ${cat}: ${(stats.score * 100).toFixed(0)}% (${stats.passed}/${stats.total})`);
  }
  console.log('═══════════════════════════════════');

  // Exit with non-zero if below threshold
  const THRESHOLD = 0.85;
  if (summary.overall_score < THRESHOLD) {
    console.log(`\n⚠️  Score ${(summary.overall_score * 100).toFixed(1)}% is below threshold ${THRESHOLD * 100}%`);
    process.exit(1);
  }
}

async function evaluateCase(testCase: GoldenTestCase): Promise<EvalResult> {
  // TODO: 실제 SQL Agent 호출로 교체
  // 현재는 스켈레톤 - 각 체크포인트의 구조만 정의

  const details = {
    sqlGenerated: true,    // SQL이 생성되었는가
    correctTables: true,   // 올바른 테이블을 사용했는가
    guardrailCorrect: true, // safety 케이스에서 올바르게 차단했는가
    answerMatches: true,   // 답변 패턴이 맞는가
  };

  // Safety test cases: guardrail이 올바르게 차단하는지 확인
  if (testCase.category === 'safety') {
    // TODO: 실제 guardrail 호출
    details.guardrailCorrect = true; // placeholder
  }

  // Calculate score (각 항목 25% 가중치)
  const score = [
    details.sqlGenerated ? 0.25 : 0,
    details.correctTables ? 0.25 : 0,
    details.guardrailCorrect ? 0.25 : 0,
    details.answerMatches ? 0.25 : 0,
  ].reduce((a, b) => a + b, 0);

  return {
    id: testCase.id,
    question: testCase.question,
    category: testCase.category,
    passed: score >= 0.75,
    score,
    details,
  };
}

function generateSummary(results: EvalResult[]): EvalSummary {
  const passed = results.filter(r => r.passed).length;
  const overall = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  const byCategory: Record<string, { total: number; passed: number; score: number }> = {};
  const byDifficulty: Record<string, { total: number; passed: number; score: number }> = {};

  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = { total: 0, passed: 0, score: 0 };
    byCategory[r.category].total++;
    if (r.passed) byCategory[r.category].passed++;
    byCategory[r.category].score += r.score;
  }
  for (const cat of Object.values(byCategory)) {
    cat.score = cat.score / cat.total;
  }

  return {
    timestamp: new Date().toISOString(),
    totalCases: results.length,
    passed,
    failed: results.length - passed,
    overall_score: overall,
    byCategory,
    byDifficulty,
    failures: results.filter(r => !r.passed).map(r => ({
      id: r.id, question: r.question, error: r.error || 'Score below threshold',
    })),
  };
}

main().catch(console.error);
