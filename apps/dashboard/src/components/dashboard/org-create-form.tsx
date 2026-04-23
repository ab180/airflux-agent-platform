"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/config";

export function OrgCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");

  function reset() {
    setSlug("");
    setName("");
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!slug.trim() || !name.trim()) {
      setError("슬러그와 이름을 입력하세요");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/orgs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: slug.trim(), name: name.trim() }),
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
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        새 조직
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-muted/10 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            슬러그
          </span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="acme"
            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px] font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            이름
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc."
            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          만들기
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
