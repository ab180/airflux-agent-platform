"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchClient, postClient } from "@/lib/client-api";
import { SyncCopyButton } from "@/components/dashboard/sync-copy-button";

/**
 * Settings page LLM connector — shows Claude and Codex INDEPENDENTLY.
 * If only one provider is broken, surface a login affordance for that
 * provider only. The router transparently steers traffic to whichever
 * provider is healthy, so the live one never needs re-login.
 */

interface ProviderState {
  available: boolean;
  source: string;
  hint?: string;
}

interface DualStatus {
  claude: ProviderState;
  codex: ProviderState;
}

const SOURCE_LABELS: Record<string, string> = {
  "claude-max-oauth": "Claude Max · OAuth",
  "env:ANTHROPIC_API_KEY": "환경변수 · ANTHROPIC_API_KEY",
  "env:ANTHROPIC_AUTH_TOKEN": "환경변수 · ANTHROPIC_AUTH_TOKEN (sync 필요)",
  "codex-chatgpt-oauth": "ChatGPT Codex · OAuth",
  "openai-api-key": "OpenAI API Key",
  "dashboard": "대시보드에서 설정",
  "none": "미연결",
};
function labelSource(raw: string): string {
  if (SOURCE_LABELS[raw]) return SOURCE_LABELS[raw];
  if (raw.startsWith("claude-max-oauth")) {
    return raw.includes("expired") ? "Claude Max · 만료" : "Claude Max · OAuth";
  }
  if (raw.startsWith("env:ANTHROPIC_API_KEY")) return "Anthropic API Key";
  return raw;
}

type ApiKeyTab = "apikey" | null;

export function LLMSetup() {
  const [status, setStatus] = useState<DualStatus | null>(null);
  const [mode, setMode] = useState<"local" | "production" | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<ApiKeyTab>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const refreshStatus = useCallback(async () => {
    setChecking(true);
    try {
      const r = await fetchClient<{
        mode?: "local" | "production";
        llm: {
          healthy: boolean;
          source: string;
          hint?: string;
          codex?: { available: boolean; source: string; hint?: string };
        };
      }>("/api/proxy/health");
      setStatus({
        claude: {
          available: r.llm.healthy,
          source: r.llm.source,
          hint: r.llm.hint,
        },
        codex: {
          available: r.llm.codex?.available ?? false,
          source: r.llm.codex?.source ?? "none",
          hint: r.llm.codex?.hint,
        },
      });
      if (r.mode) setMode(r.mode);
    } catch {
      /* ignore */
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

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
        setActiveTab(null);
        setApiKey("");
        refreshStatus();
      } else {
        setError(result.error || "설정 실패");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "API 연결 실패");
    } finally {
      setSaving(false);
    }
  }

  if (!status) {
    return <div className="text-[12px] text-muted-foreground">상태 확인 중...</div>;
  }

  const claudeOk = status.claude.available;
  const codexOk = status.codex.available;
  const allConnected = claudeOk && codexOk;
  const anyConnected = claudeOk || codexOk;

  // Header: reflect the actual mixed state instead of a single boolean.
  const header = allConnected
    ? { dot: "bg-emerald-500", label: "LLM 연결됨" }
    : anyConnected
      ? { dot: "bg-emerald-500", label: "LLM 일부 연결됨 (라우팅 정상 동작)" }
      : { dot: "bg-amber-400", label: "LLM 미연결" };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className={`h-2 w-2 shrink-0 rounded-full ${header.dot}`} role="status" aria-label={header.label} />
        <span className="text-[13px] font-medium">{header.label}</span>
      </div>

      {/* Per-provider rows — each shows its own connect/login affordance */}
      <div className="space-y-2">
        <ProviderRow
          name="Claude (Anthropic)"
          color="text-violet-400"
          state={status.claude}
          recommended={!claudeOk && !codexOk}
          onSuccess={refreshStatus}
          providerKey="claude"
          isLocal={mode === "local"}
        />
        <ProviderRow
          name="Codex (OpenAI)"
          color="text-emerald-400"
          state={status.codex}
          recommended={false}
          onSuccess={refreshStatus}
          providerKey="codex"
          isLocal={mode === "local"}
        />
      </div>

      {!anyConnected && (
        <p className="text-[11px] text-muted-foreground">
          AI 에이전트를 사용하려면 두 provider 중 하나 이상 연결하세요. 둘 다 연결되면 라우터가 자동으로 분배합니다.
        </p>
      )}
      {anyConnected && !allConnected && (
        <p className="text-[11px] text-muted-foreground">
          현재 한 쪽 provider만 사용 가능합니다. 라우터가 살아있는 provider로 자동 우회 중 — 다른 한쪽은 옵션입니다.
        </p>
      )}

      {/* API key fallback (always available, secondary action) */}
      <div className="border-t border-border/30 pt-3">
        {activeTab !== "apikey" ? (
          <button
            onClick={() => setActiveTab("apikey")}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            또는 API 키 직접 입력 (Anthropic / OpenAI)
          </button>
        ) : (
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
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => {
                  setActiveTab(null);
                  setError("");
                }}
              >
                뒤로
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              키는 서버 메모리에만 저장되며, 서버 재시작 시 초기화됩니다.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] text-muted-foreground"
          onClick={refreshStatus}
          disabled={checking}
        >
          {checking ? "확인 중..." : "상태 새로고침"}
        </Button>
      </div>
    </div>
  );
}

/**
 * One row per provider. If the provider is healthy, show a green check
 * and source label — no login button. If unhealthy, show an inline
 * login button + the recovery hint from /api/health.
 */
function ProviderRow({
  name,
  color,
  state,
  recommended,
  onSuccess,
  providerKey,
  isLocal,
}: {
  name: string;
  color: string;
  state: ProviderState;
  recommended: boolean;
  onSuccess: () => void;
  providerKey: "claude" | "codex";
  isLocal: boolean;
}) {
  if (state.available) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/[0.03] px-3 py-2">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        <span className={`text-[12px] font-medium ${color}`}>{name}</span>
        <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-400">
          {labelSource(state.source)}
        </Badge>
        <span className="ml-auto text-[10px] text-emerald-400/80">✓ 연결됨</span>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.03] px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
        <span className={`text-[12px] font-medium ${color}`}>{name}</span>
        {recommended && <Badge variant="outline" className="text-[8px]">추천</Badge>}
        <Badge variant="outline" className="border-amber-500/30 text-[9px] text-amber-400">
          {labelSource(state.source)}
        </Badge>
        {/* Claude on macOS local mode: Keychain → file sync command */}
        {providerKey === "claude" && isLocal && <SyncCopyButton />}
        <CliLoginButton provider={providerKey} onSuccess={onSuccess} />
      </div>
      {state.hint && (
        <p className="text-[10px] text-amber-400/80 leading-relaxed">{state.hint}</p>
      )}
    </div>
  );
}

/** Triggers CLI login on the server and polls for completion. */
function CliLoginButton({
  provider,
  onSuccess,
}: {
  provider: "claude" | "codex";
  onSuccess: () => void;
}) {
  const [state, setState] = useState<"idle" | "running" | "success" | "failed">("idle");
  const [message, setMessage] = useState("");

  async function startLogin() {
    setState("running");
    setMessage("브라우저에서 인증을 완료하세요...");

    try {
      await postClient("/api/cli-auth/login", { provider });

      const poll = setInterval(async () => {
        try {
          const res = await fetchClient<{ loggedIn: boolean; loginStatus: string | null }>(
            `/api/cli-auth/status?provider=${provider}`,
          );
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
        } catch {
          /* keep polling */
        }
      }, 2000);

      setTimeout(() => clearInterval(poll), 120_000);
    } catch (e) {
      setState("failed");
      setMessage(e instanceof Error ? e.message : "로그인 시작 실패");
    }
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      {message && (
        <span className={`text-[10px] ${state === "failed" ? "text-red-400" : state === "success" ? "text-emerald-400" : "text-muted-foreground"}`}>
          {message}
        </span>
      )}
      <Button
        size="sm"
        variant={state === "running" ? "ghost" : "default"}
        className="h-6 text-[10px]"
        onClick={startLogin}
        disabled={state === "running"}
      >
        {state === "idle" && "로그인"}
        {state === "running" && "대기 중..."}
        {state === "success" && "✓ 완료"}
        {state === "failed" && "재시도"}
      </Button>
    </div>
  );
}
