"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { fetchClient, postClient } from "@/lib/client-api";

interface ToolInfo {
  name: string;
  description: string;
  status: string;
}

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [testingTool, setTestingTool] = useState<string | null>(null);
  const [testInput, setTestInput] = useState("{}");
  const [testResult, setTestResult] = useState<unknown>(null);
  const [testDuration, setTestDuration] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchClient<{ tools: ToolInfo[] }>("/api/admin/tools")
      .then(d => setTools(d.tools || []))
      .catch(() => {});
  }, []);

  async function runTest(name: string) {
    setTesting(true);
    setTestResult(null);
    setTestDuration(null);
    try {
      let input: unknown;
      try {
        input = JSON.parse(testInput);
      } catch {
        setTestResult({ error: "Invalid JSON input" });
        return;
      }

      const data = await postClient<{ result?: unknown; durationMs?: number }>(`/api/admin/tools/${name}/test`, input);
      setTestResult(data.result || data);
      setTestDuration(data.durationMs || null);
    } finally {
      setTesting(false);
    }
  }

  function openTest(name: string) {
    if (testingTool === name) {
      setTestingTool(null);
      return;
    }
    setTestingTool(name);
    setTestResult(null);
    setTestDuration(null);

    // Set default input based on tool
    const defaults: Record<string, string> = {
      echo: '{"message": "hello"}',
      getTimestamp: '{}',
      calculate: '{"expression": "2 + 3 * 4"}',
      formatJson: '{"json": "{\\"key\\":\\"value\\"}"}',
      httpGet: '{"url": "https://httpbin.org/get"}',
      getSystemInfo: '{}',
    };
    setTestInput(defaults[name] || '{}');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">도구</h1>
        <p className="text-[13px] text-muted-foreground">
          {tools.length}개 도구 등록됨 — 클릭하여 테스트
        </p>
      </div>

      <div className="space-y-2">
        {tools.map((tool) => (
          <div key={tool.name}>
            <div
              className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3 transition-colors hover:border-border cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => openTest(tool.name)}
              onKeyDown={(e) => e.key === 'Enter' && openTest(tool.name)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-medium">
                    {tool.name}
                  </span>
                  <Badge
                    variant="default"
                    className="text-[10px]"
                  >
                    활성
                  </Badge>
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground truncate" title={tool.description}>
                  {tool.description}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 text-[11px]"
                onClick={(e) => {
                  e.stopPropagation();
                  openTest(tool.name);
                }}
              >
                {testingTool === tool.name ? "닫기" : "테스트"}
              </Button>
            </div>

            {/* Inline test panel */}
            {testingTool === tool.name && (
              <div className="mt-1 rounded-lg border border-primary/20 bg-primary/[0.02] px-4 py-3 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                      입력 (JSON)
                    </label>
                    <textarea
                      value={testInput}
                      onChange={(e) => setTestInput(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-border/50 bg-secondary px-2.5 py-1.5 font-mono text-[11px] outline-none resize-y"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => runTest(tool.name)}
                    disabled={testing}
                  >
                    {testing ? "실행 중..." : "실행"}
                  </Button>
                  {testDuration !== null && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {testDuration}ms
                    </span>
                  )}
                </div>
                {testResult !== null && (
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                      결과
                    </label>
                    <pre className="overflow-auto rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-[11px] text-foreground/80 max-h-40">
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
