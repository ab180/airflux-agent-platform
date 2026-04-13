"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";

import { fetchClient, postClient } from "@/lib/client-api";

interface TestCase {
  id: number;
  agent: string;
  category: string;
  difficulty: string;
  question: string;
  expectedAgent?: string;
  expectedContains?: string;
}

interface EvalResult {
  caseId: number;
  question: string;
  actualAgent: string;
  passed: boolean;
  reason: string;
  durationMs: number;
}

interface EvalRun {
  id: number;
  timestamp: string;
  totalCases: number;
  passed: number;
  failed: number;
  score: number;
  results: EvalResult[];
}

export default function EvaluationPage() {
  const [dataset, setDataset] = useState<TestCase[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [running, setRunning] = useState(false);
  const [latestRun, setLatestRun] = useState<EvalRun | null>(null);

  useEffect(() => {
    fetchClient<{ dataset: TestCase[] }>("/api/admin/eval/dataset")
      .then(d => setDataset(d.dataset || []))
      .catch(() => {});

    fetchClient<{ runs: EvalRun[] }>("/api/admin/eval/runs")
      .then(d => {
        setRuns(d.runs || []);
        if (d.runs?.length > 0) setLatestRun(d.runs[0]);
      })
      .catch(() => {});
  }, []);

  async function runEval() {
    setRunning(true);
    try {
      const data = await postClient<{ success: boolean; run: EvalRun }>("/api/admin/eval/run", {});
      if (data.success) {
        setLatestRun(data.run);
        setRuns(prev => [data.run, ...prev]);
      }
    } finally {
      setRunning(false);
    }
  }

  const latestScore = latestRun?.score ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">평가</h1>
          <p className="text-[13px] text-muted-foreground">
            Golden Dataset 기반 에이전트 품질 평가
          </p>
        </div>
        <Button
          onClick={runEval}
          disabled={running}
          className="h-8 text-[12px]"
        >
          {running ? "평가 실행 중..." : "평가 실행"}
        </Button>
      </div>

      {/* Score overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="최근 점수"
          value={latestScore !== null ? `${latestScore}%` : "—"}
          detail={latestRun ? `${latestRun.passed}/${latestRun.totalCases} 통과` : "평가 미실행"}
          accent={latestScore !== null && latestScore >= 90}
          size="lg"
        />
        <StatCard
          label="테스트 케이스"
          value={String(dataset.length)}
          detail="등록됨"
        />
        <StatCard
          label="평가 횟수"
          value={String(runs.length)}
          detail="누적"
        />
        <StatCard
          label="마지막 실행"
          value={
            latestRun
              ? new Date(latestRun.timestamp).toLocaleTimeString("ko-KR", { hour12: false })
              : "—"
          }
          detail={latestRun ? new Date(latestRun.timestamp).toLocaleDateString("ko-KR") : ""}
        />
      </div>

      {/* Latest results */}
      {latestRun && latestRun.results.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            최근 평가 결과
          </h2>
          <div className="overflow-hidden rounded-lg border border-border/50">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">결과</th>
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">질문</th>
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">에이전트</th>
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">사유</th>
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">시간</th>
                </tr>
              </thead>
              <tbody>
                {latestRun.results.map((r, i) => (
                  <tr key={i} className="border-b border-border/30 last:border-0">
                    <td className="px-4 py-2.5">
                      <Badge
                        variant={r.passed ? "default" : "destructive"}
                        className="text-[10px]"
                      >
                        {r.passed ? "PASS" : "FAIL"}
                      </Badge>
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-[12px]" title={r.question}>
                      {r.question}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {r.actualAgent}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
                      {r.reason}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {r.durationMs}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Golden dataset */}
      <div className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Golden Dataset ({dataset.length}건)
        </h2>
        {dataset.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 py-12 text-center">
            <p className="text-[12px] text-muted-foreground">
              "평가 실행" 버튼을 클릭하면 기본 테스트 케이스가 자동 생성됩니다.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {dataset.map((tc) => (
              <div
                key={tc.id}
                className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${
                      tc.difficulty === "hard"
                        ? "border-red-500/30 text-red-400"
                        : tc.difficulty === "medium"
                          ? "border-amber-500/30 text-amber-400"
                          : "border-emerald-500/30 text-emerald-400"
                    }`}
                    aria-label={`난이도: ${tc.difficulty}`}
                  >
                    {tc.difficulty}
                  </Badge>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {tc.agent}
                  </span>
                  <span className="truncate text-[12px]" title={tc.question}>{tc.question}</span>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {tc.category}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Score history */}
      {runs.length > 1 && (
        <div className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            점수 추이 ({runs.length}회)
          </h2>
          <div className="rounded-lg border border-border/50 p-4">
            <div className="flex items-end gap-1" style={{ height: 80 }}>
              {[...runs].reverse().map((run) => {
                const color = run.score >= 90 ? "bg-emerald-400/60" : run.score >= 70 ? "bg-amber-400/60" : "bg-red-400/60";
                return (
                  <div key={run.id} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-sm ${color}`}
                      style={{ height: `${Math.max(run.score, 5)}%` }}
                      title={`${new Date(run.timestamp).toLocaleString("ko-KR", { hour12: false })}: ${run.score}% (${run.passed}/${run.totalCases})`}
                      aria-label={`점수 ${run.score}%`}
                    />
                    <span className="font-mono text-[9px] text-muted-foreground">{run.score}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[9px] text-muted-foreground">
              <span>이전</span>
              <span>최근</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
