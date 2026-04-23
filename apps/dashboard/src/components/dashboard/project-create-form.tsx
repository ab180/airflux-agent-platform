"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/config";

const TYPE_OPTIONS = [
  { value: "code-repo", label: "코드 레포" },
  { value: "docs", label: "문서" },
  { value: "objective", label: "목표" },
] as const;

const VISIBILITY_OPTIONS = [
  { value: "private", label: "비공개" },
  { value: "internal", label: "조직 내" },
  { value: "public", label: "공개" },
] as const;

export function ProjectCreateForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("docs");
  const [visibility, setVisibility] = useState<string>("internal");
  const [externalRef, setExternalRef] = useState("");

  function reset() {
    setSlug("");
    setName("");
    setType("docs");
    setVisibility("internal");
    setExternalRef("");
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!slug.trim() || !name.trim()) {
      setError("슬러그와 이름을 입력하세요");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/orgs/${orgId}/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim(),
          name: name.trim(),
          type,
          visibility,
          externalRef: externalRef.trim() || undefined,
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
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        + 새 프로젝트
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
            placeholder="my-project"
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
            placeholder="My Project"
            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            유형
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            공개 범위
          </span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
          >
            {VISIBILITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          외부 연동 (선택) — GitHub URL, Notion space id, Linear project id 등
        </span>
        <input
          type="text"
          value={externalRef}
          onChange={(e) => setExternalRef(e.target.value)}
          placeholder="https://github.com/..."
          className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
        />
      </label>

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
