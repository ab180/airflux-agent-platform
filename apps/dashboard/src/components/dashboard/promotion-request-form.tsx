"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/config";
import type { DrawerAsset, WorkspaceProject } from "@/lib/api";

const KIND_OPTIONS = [
  { value: "agent", label: "에이전트" },
  { value: "skill", label: "스킬" },
  { value: "tool", label: "도구" },
  { value: "prompt", label: "프롬프트" },
] as const;

export function PromotionRequestForm({
  projects,
  drawerAssets,
}: {
  projects: WorkspaceProject[];
  drawerAssets: DrawerAsset[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assetKind, setAssetKind] = useState<string>("agent");
  const [assetId, setAssetId] = useState("");
  const [toProjectId, setToProjectId] = useState(projects[0]?.id ?? "");
  const [notes, setNotes] = useState("");

  // Narrow drawer assets to the currently-selected kind so the picker
  // shows only valid options. If the user has no matching drawer asset,
  // the free-text field stays as a fallback.
  const matchingDrawerAssets = drawerAssets.filter(
    (a) => a.assetKind === assetKind,
  );

  function reset() {
    setAssetKind("agent");
    setAssetId("");
    setToProjectId(projects[0]?.id ?? "");
    setNotes("");
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!assetId.trim()) {
      setError("assetId를 입력하세요");
      return;
    }
    if (!toProjectId) {
      setError("대상 프로젝트를 선택하세요");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/promotions/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assetKind,
          assetId: assetId.trim(),
          toProjectId,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      reset();
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={projects.length === 0}
        title={
          projects.length === 0 ? "승격할 프로젝트가 없습니다" : undefined
        }
      >
        새 Promotion 요청
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-muted/10 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            자산 유형
          </span>
          <select
            value={assetKind}
            onChange={(e) => setAssetKind(e.target.value)}
            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            대상 프로젝트
          </span>
          <select
            value={toProjectId}
            onChange={(e) => setToProjectId(e.target.value)}
            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (@{p.slug})
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          자산 {matchingDrawerAssets.length > 0 ? "(drawer에서 선택 or 직접 입력)" : "ID"}
        </span>
        {matchingDrawerAssets.length > 0 ? (
          <select
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px] font-mono"
          >
            <option value="">— 선택 또는 아래에서 직접 입력 —</option>
            {matchingDrawerAssets.map((a) => (
              <option key={a.assetId} value={a.assetId}>
                {a.displayName} ({a.assetId})
              </option>
            ))}
          </select>
        ) : null}
        <input
          type="text"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          placeholder="예: my-sql-agent"
          className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px] font-mono"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          리뷰 메모 (선택)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="메인테이너가 참고할 컨텍스트"
          className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
        />
      </label>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          요청 제출
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={pending}
        >
          취소
        </Button>
        {error ? (
          <span className="text-[11px] text-destructive">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
