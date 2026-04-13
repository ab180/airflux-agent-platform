"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchClient, postClient } from "@/lib/client-api";

interface LLMStatus {
  available: boolean;
  source: string;
  hint?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  "env:ANTHROPIC_API_KEY": "환경변수 (ANTHROPIC_API_KEY)",
  "env:ANTHROPIC_AUTH_TOKEN": "환경변수 (ANTHROPIC_AUTH_TOKEN)",
  "env:OPENAI_API_KEY": "환경변수 (OPENAI_API_KEY — Codex)",
  "claude-code": "Claude Code 로그인",
  "claude-code-oauth": "Claude Code OAuth",
  "claude-cli": "Claude CLI (claude login)",
  "dashboard": "대시보드에서 설정",
  "none": "미연결",
};

export function LLMSetup() {
  const [status, setStatus] = useState<LLMStatus>({ available: false, source: "none" });
  const [apiKey, setApiKey] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchClient<LLMStatus>("/api/admin/llm/status")
      .then(setStatus)
      .catch(() => {});
  }, []);

  async function handleSubmit() {
    if (!apiKey.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await postClient<{ success: boolean; available: boolean; source: string; error?: string }>(
        "/api/admin/llm/key",
        { apiKey: apiKey.trim() },
      );
      if (result.success) {
        setStatus({ available: result.available, source: result.source });
        setShowInput(false);
        setApiKey("");
      } else {
        setError(result.error || "설정 실패");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "API 연결 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    try {
      const result = await postClient<{ success: boolean; available: boolean; source: string }>(
        "/api/admin/llm/clear",
        {},
      );
      setStatus({ available: result.available, source: result.source });
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`h-2 w-2 shrink-0 rounded-full ${status.available ? "bg-emerald-500" : "bg-amber-400"}`}
            role="status"
            aria-label={status.available ? "연결됨" : "미연결"}
          />
          <span className="text-[13px] font-medium">
            {status.available ? "LLM 연결됨" : "LLM 미연결"}
          </span>
          {status.available && (
            <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-400">
              {SOURCE_LABELS[status.source] || status.source}
            </Badge>
          )}
        </div>
        {!status.available && !showInput && (
          <Button size="sm" className="h-7 text-[11px]" onClick={() => setShowInput(true)}>
            API 키 설정
          </Button>
        )}
        {status.available && status.source === "dashboard" && (
          <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground" onClick={handleClear}>
            키 초기화
          </Button>
        )}
      </div>

      {!status.available && !showInput && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <p className="text-[12px] text-muted-foreground">
            AI 에이전트를 사용하려면 LLM 연결이 필요합니다.
          </p>
          <div className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
            <p>설정 방법:</p>
            <ol className="ml-4 list-decimal space-y-0.5">
              <li>아래 "API 키 설정" 버튼으로 직접 입력</li>
              <li><code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-[10px]">claude login</code> — Claude Code SSO (Anthropic)</li>
              <li><code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-[10px]">ANTHROPIC_API_KEY=sk-ant-...</code> — Anthropic 직접</li>
              <li><code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-[10px]">OPENAI_API_KEY=sk-...</code> — OpenAI / Codex 사용자</li>
            </ol>
          </div>
          <Button size="sm" className="mt-3 h-7 text-[11px]" onClick={() => setShowInput(true)}>
            API 키 설정
          </Button>
        </div>
      )}

      {showInput && (
        <div className="rounded-md border border-primary/20 bg-primary/[0.02] px-3 py-3 space-y-2">
          <label className="block text-[11px] font-medium text-muted-foreground">
            Anthropic API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            className="h-8 w-full rounded-md border border-border/50 bg-secondary px-2.5 font-mono text-[12px] outline-none focus:border-primary/30"
            autoFocus
          />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-[11px]" onClick={handleSubmit} disabled={saving || !apiKey.trim()}>
              {saving ? "설정 중..." : "설정"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => { setShowInput(false); setError(""); }}>
              취소
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            키는 서버 메모리에만 저장되며, 서버 재시작 시 초기화됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
