"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { API_BASE } from "@/lib/config";
import type { PublishedAsset } from "@/lib/api";

const KIND_LABEL: Record<PublishedAsset["assetKind"], string> = {
  agent: "에이전트",
  skill: "스킬",
  tool: "도구",
  prompt: "프롬프트",
};

export function PublishedAssetsList({
  projectId,
  assets,
  canManage,
}: {
  projectId: string;
  assets: PublishedAsset[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function unpublish(a: PublishedAsset) {
    if (
      !confirm(
        `${KIND_LABEL[a.assetKind]} "${a.assetId}" 의 publish를 해제하시겠습니까?`,
      )
    )
      return;
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${projectId}/assets/${a.assetKind}/${encodeURIComponent(a.assetId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 py-10 text-center">
        <p className="text-[12px] text-muted-foreground">
          아직 publish된 자산이 없습니다. Promotion 승인을 거치면 여기에 등록됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {assets.map((a) => (
          <li
            key={`${a.assetKind}:${a.assetId}`}
            className="flex items-start justify-between gap-3 rounded-lg border border-border/50 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[11px]">
                  {KIND_LABEL[a.assetKind]}
                </Badge>
                <code className="text-[12px] font-mono">{a.assetId}</code>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                @{a.promotedFromDrawer} drawer 에서 승격 ·{" "}
                {new Date(a.publishedAt).toLocaleString("ko-KR")}
              </p>
            </div>
            {canManage ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => unpublish(a)}
              >
                Unpublish
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
