"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { API_BASE } from "@/lib/config";
import type { DrawerAsset } from "@/lib/api";

const KIND_OPTIONS: { value: DrawerAsset["assetKind"]; label: string }[] = [
  { value: "agent", label: "에이전트" },
  { value: "skill", label: "스킬" },
  { value: "tool", label: "도구" },
  { value: "prompt", label: "프롬프트" },
];

const KIND_LABEL: Record<DrawerAsset["assetKind"], string> = {
  agent: "에이전트",
  skill: "스킬",
  tool: "도구",
  prompt: "프롬프트",
};

export function DrawerAssetManager({ assets }: { assets: DrawerAsset[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DrawerAsset["assetKind"]>("agent");
  const [assetId, setAssetId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setKind("agent");
    setAssetId("");
    setDisplayName("");
    setNotes("");
    setError(null);
  }

  async function act(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function register() {
    if (!assetId.trim()) {
      setError("assetId를 입력하세요");
      return;
    }
    await act(async () => {
      const res = await fetch(`${API_BASE}/api/drawer/assets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assetKind: kind,
          assetId: assetId.trim(),
          displayName: displayName.trim() || assetId.trim(),
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      reset();
      setOpen(false);
    });
  }

  async function remove(a: DrawerAsset) {
    if (!confirm(`"${a.displayName}" 를 drawer에서 제거하시겠습니까?`)) return;
    await act(async () => {
      const res = await fetch(
        `${API_BASE}/api/drawer/assets/${a.assetKind}/${encodeURIComponent(a.assetId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    });
  }

  return (
    <div className="space-y-2">
      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 py-8 text-center">
          <p className="text-[12px] text-muted-foreground">
            아직 drawer에 등록한 자산이 없습니다. 작업 중인 에이전트/스킬/도구/프롬프트를 추가하면 promotion 요청 폼에서 선택할 수 있습니다.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/40 rounded-lg border border-border/50">
          {assets.map((a) => (
            <li
              key={`${a.assetKind}:${a.assetId}`}
              className="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[11px]">
                    {KIND_LABEL[a.assetKind]}
                  </Badge>
                  <span className="text-[13px] font-medium">
                    {a.displayName}
                  </span>
                  <code className="text-[11px] text-muted-foreground">
                    {a.assetId}
                  </code>
                </div>
                {a.notes ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {a.notes}
                  </p>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => remove(a)}
              >
                제거
              </Button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="space-y-3 rounded-lg border border-border/50 bg-muted/10 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                유형
              </span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as DrawerAsset["assetKind"])}
                className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                asset ID
              </span>
              <input
                type="text"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                placeholder="my-sql-agent"
                className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px] font-mono"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              표시 이름 (선택, 기본은 asset ID)
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              메모 (선택)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
            />
          </label>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={register} disabled={pending}>
              등록
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              취소
            </Button>
            {error ? (
              <span className="text-[11px] text-destructive">{error}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          + 자산 등록
        </Button>
      )}

      {!open && error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
