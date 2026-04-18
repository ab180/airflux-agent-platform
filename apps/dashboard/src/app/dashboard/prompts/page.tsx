"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchClient, postClient } from "@/lib/client-api";

interface PromptVersion {
  id: number;
  agent: string;
  version: string;
  content: string;
  description: string;
  isCurrent: boolean;
  createdAt: string;
}

export default function PromptsPage() {
  const [agents, setAgents] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [editing, setEditing] = useState(false);
  const [newVersion, setNewVersion] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Load agents list
  useEffect(() => {
    const fromUrl =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("agent")
        : null;
    fetchClient<{ agents: { name: string }[] }>("/api/admin/agents")
      .then(data => {
        const names = (data.agents || []).map(a => a.name);
        setAgents(names);
        if (fromUrl && names.includes(fromUrl)) {
          setSelectedAgent(fromUrl);
        } else if (names.length > 0 && !selectedAgent) {
          setSelectedAgent(names[0]);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load versions for selected agent
  useEffect(() => {
    if (!selectedAgent) return;
    fetchClient<{ versions: PromptVersion[] }>(`/api/admin/prompts/${selectedAgent}`)
      .then(data => setVersions(data.versions || []))
      .catch(() => setVersions([]));
  }, [selectedAgent]);

  const [error, setError] = useState("");

  async function savePrompt() {
    if (!newVersion.trim() || !newContent.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const data = await postClient<{ success: boolean; error?: string }>(
        `/api/admin/prompts/${selectedAgent}`,
        {
          version: newVersion.trim(),
          content: newContent.trim(),
          description: newDescription.trim(),
        },
      );
      if (data.success) {
        const d = await fetchClient<{ versions: PromptVersion[] }>(`/api/admin/prompts/${selectedAgent}`);
        setVersions(d.versions || []);
        setEditing(false);
        setNewVersion("");
        setNewContent("");
        setNewDescription("");
      } else {
        setError(data.error || "저장에 실패했습니다.");
      }
    } catch {
      setError("API 연결에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function rollback(versionId: number) {
    try {
      await postClient(`/api/admin/prompts/${selectedAgent}/rollback`, { versionId });
      const d = await fetchClient<{ versions: PromptVersion[] }>(`/api/admin/prompts/${selectedAgent}`);
      setVersions(d.versions || []);
    } catch {
      // Silently fail — could add error state here too
    }
  }

  const current = versions.find(v => v.isCurrent);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">프롬프트</h1>
          <p className="text-[13px] text-muted-foreground">
            에이전트별 시스템 프롬프트 버전 관리 · 저장한 "현재 버전"이
            즉시 에이전트에 반영됩니다{" "}
            <span className="text-muted-foreground/70">
              (없으면 <code className="font-mono text-[11px]">settings/instructions/{"<agent>"}.md</code> 사용)
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="h-8 rounded-md border border-border/50 bg-secondary px-2.5 text-[12px] text-foreground outline-none"
          >
            {agents.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          {!editing && (
            <Button
              size="sm"
              className="h-8 text-[12px]"
              onClick={() => {
                setEditing(true);
                const nextNum = versions.length + 1;
                setNewVersion(`v${nextNum}.0`);
                setNewContent(current?.content || "");
              }}
            >
              + 새 버전
            </Button>
          )}
        </div>
      </div>

      {/* Editor */}
      {editing && (
        <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/[0.02] p-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                버전
              </label>
              <input
                value={newVersion}
                onChange={(e) => setNewVersion(e.target.value)}
                className="h-8 w-full rounded-md border border-border/50 bg-secondary px-2.5 text-[12px] font-mono outline-none"
                placeholder="v1.0"
              />
            </div>
            <div className="flex-[2]">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                설명
              </label>
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="h-8 w-full rounded-md border border-border/50 bg-secondary px-2.5 text-[12px] outline-none"
                placeholder="변경 사항 설명"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              시스템 프롬프트
            </label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={10}
              className="w-full rounded-md border border-border/50 bg-secondary px-3 py-2 font-mono text-[12px] leading-relaxed outline-none resize-y"
              placeholder="시스템 프롬프트를 입력하세요..."
            />
          </div>
          {error && (
            <p className="text-[12px] text-red-400">{error}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-8 text-[12px]"
              onClick={savePrompt}
              disabled={saving || !newVersion.trim() || !newContent.trim()}
            >
              {saving ? "저장 중..." : "저장"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[12px]"
              onClick={() => { setEditing(false); setError(""); }}
            >
              취소
            </Button>
          </div>
        </div>
      )}

      {/* Current prompt */}
      {current && !editing && (
        <div className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            현재 프롬프트
          </h2>
          <div className="rounded-lg border border-border/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Badge className="text-[10px]">{current.version}</Badge>
              <span className="text-[11px] text-muted-foreground">
                {current.description}
              </span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-foreground/80">
              {current.content}
            </pre>
          </div>
        </div>
      )}

      {/* Version history */}
      <div className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          버전 히스토리 ({versions.length})
        </h2>
        {versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 py-12">
            <p className="text-[12px] text-muted-foreground">
              프롬프트 버전이 없습니다. "새 버전"을 클릭하여 첫 프롬프트를 작성하세요.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {versions.map((v) => {
              const date = new Date(v.createdAt);
              const dateStr = date.toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "short",
                day: "numeric",
              });

              return (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-[12px] font-medium">
                      {v.version}
                    </span>
                    {v.isCurrent && (
                      <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-400">
                        현재
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {v.description || "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{dateStr}</span>
                    {!v.isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={() => rollback(v.id)}
                      >
                        롤백
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
