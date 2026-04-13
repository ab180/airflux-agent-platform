"use client";

import { useState, useEffect, useCallback } from "react";
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

type SetupTab = "cli" | "apikey" | null;

export function LLMSetup() {
  const [status, setStatus] = useState<LLMStatus>({ available: false, source: "none" });
  const [activeTab, setActiveTab] = useState<SetupTab>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const refreshStatus = useCallback(async () => {
    setChecking(true);
    try {
      const s = await fetchClient<LLMStatus>("/api/admin/llm/status");
      setStatus(s);
      if (s.available) setActiveTab(null);
    } catch { /* ignore */ }
    setChecking(false);
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  async function handleSubmitKey() {
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
        setActiveTab(null);
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
      const result = await postClient<{ success: boolean; available: boolean; source: string }>("/api/admin/llm/clear", {});
      setStatus({ available: result.available, source: result.source });
    } catch { /* ignore */ }
  }

  function copyCommand(cmd: string) {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(cmd);
      setTimeout(() => setCopied(""), 2000);
    });
  }

  // ─── Connected state ──────────────────────────────────
  if (status.available) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" role="status" aria-label="연결됨" />
            <span className="text-[13px] font-medium">LLM 연결됨</span>
            <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-400">
              {SOURCE_LABELS[status.source] || status.source}
            </Badge>
          </div>
          {status.source === "dashboard" && (
            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground" onClick={handleClear}>
              키 초기화
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ─── Not connected state ──────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="h-2 w-2 shrink-0 rounded-full bg-amber-400" role="status" aria-label="미연결" />
        <span className="text-[13px] font-medium">LLM 미연결</span>
      </div>

      {/* Setup method buttons */}
      {!activeTab && (
        <div className="space-y-2">
          <p className="text-[12px] text-muted-foreground">
            AI 에이전트를 사용하려면 LLM을 연결하세요.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setActiveTab("cli")}
              className="rounded-lg border border-border/50 px-3 py-3 text-left transition-colors hover:border-primary/30"
            >
              <div className="text-[12px] font-medium">CLI 로그인</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                claude login 또는 codex login
              </div>
            </button>
            <button
              onClick={() => setActiveTab("apikey")}
              className="rounded-lg border border-border/50 px-3 py-3 text-left transition-colors hover:border-primary/30"
            >
              <div className="text-[12px] font-medium">API 키 입력</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                Anthropic 또는 OpenAI
              </div>
            </button>
          </div>
        </div>
      )}

      {/* CLI login */}
      {activeTab === "cli" && (
        <div className="rounded-md border border-primary/20 bg-primary/[0.02] px-3 py-3 space-y-3">
          <div className="text-[12px] font-medium">CLI로 로그인</div>

          <CliLoginButton provider="claude" label="Claude (Anthropic)" color="text-violet-400" recommended onSuccess={refreshStatus} />
          <CliLoginButton provider="codex" label="Codex (OpenAI)" color="text-emerald-400" onSuccess={refreshStatus} />

          <div className="flex gap-2 border-t border-border/30 pt-2">
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={refreshStatus}
              disabled={checking}
            >
              {checking ? "확인 중..." : "연결 확인"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setActiveTab(null)}>
              뒤로
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            터미널에서 로그인한 후 "연결 확인" 버튼을 클릭하세요.
          </p>
        </div>
      )}

      {/* API key input */}
      {activeTab === "apikey" && (
        <div className="rounded-md border border-primary/20 bg-primary/[0.02] px-3 py-3 space-y-2">
          <label className="block text-[11px] font-medium text-muted-foreground">
            API Key (Anthropic 또는 OpenAI)
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-... 또는 sk-..."
            className="h-8 w-full rounded-md border border-border/50 bg-secondary px-2.5 font-mono text-[12px] outline-none focus:border-primary/30"
            autoFocus
          />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-[11px]" onClick={handleSubmitKey} disabled={saving || !apiKey.trim()}>
              {saving ? "설정 중..." : "설정"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => { setActiveTab(null); setError(""); }}>
              뒤로
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

/** Button that triggers CLI login on the server and polls for completion. */
function CliLoginButton({
  provider,
  label,
  color,
  recommended,
  onSuccess,
}: {
  provider: "claude" | "codex";
  label: string;
  color: string;
  recommended?: boolean;
  onSuccess: () => void;
}) {
  const [state, setState] = useState<"idle" | "running" | "success" | "failed">("idle");
  const [message, setMessage] = useState("");

  async function startLogin() {
    setState("running");
    setMessage("브라우저에서 인증을 완료하세요...");

    try {
      await postClient("/api/cli-auth/login", { provider });

      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const res = await fetchClient<{ loggedIn: boolean; loginStatus: string | null }>(`/api/cli-auth/status?provider=${provider}`);
          if (res.loggedIn) {
            clearInterval(poll);
            setState("success");
            setMessage("로그인 성공!");
            onSuccess();
          } else if (res.loginStatus === "failed") {
            clearInterval(poll);
            setState("failed");
            setMessage("로그인 실패. 다시 시도하세요.");
          }
        } catch { /* keep polling */ }
      }, 2000);

      // Stop polling after 2 minutes
      setTimeout(() => clearInterval(poll), 120_000);
    } catch (e) {
      setState("failed");
      setMessage(e instanceof Error ? e.message : "로그인 시작 실패");
    }
  }

  return (
    <div className="rounded-md border border-border/30 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium ${color}`}>{label}</span>
          {recommended && <Badge variant="outline" className="text-[8px]">추천</Badge>}
        </div>
        <Button
          size="sm"
          variant={state === "running" ? "ghost" : "default"}
          className="h-6 text-[10px]"
          onClick={startLogin}
          disabled={state === "running"}
        >
          {state === "idle" && "로그인"}
          {state === "running" && "인증 대기 중..."}
          {state === "success" && "✓ 완료"}
          {state === "failed" && "재시도"}
        </Button>
      </div>
      {message && (
        <p className={`text-[10px] ${state === "failed" ? "text-red-400" : state === "success" ? "text-emerald-400" : "text-muted-foreground"}`}>
          {message}
        </p>
      )}
      {state === "running" && (
        <p className="text-[10px] text-amber-400/80">
          브라우저가 열렸습니다 — 인증을 완료해주세요.
        </p>
      )}
    </div>
  );
}
