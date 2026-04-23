"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/config";

type Decision = "approve" | "reject";

export function PromotionDecision({ promotionId }: { promotionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  async function decide(op: Decision) {
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/promotions/${promotionId}/${op}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(notes ? { notes } : {}),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="리뷰 메모 (선택)"
        rows={2}
        className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          disabled={pending}
          onClick={() => decide("approve")}
        >
          승인
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => decide("reject")}
        >
          거절
        </Button>
        {error ? (
          <span className="text-[11px] text-destructive">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
