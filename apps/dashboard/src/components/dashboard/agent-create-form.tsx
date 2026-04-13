"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { fetchClient, postClient } from "@/lib/client-api";

interface ToolOption {
  name: string;
  description: string;
}

export function AgentCreateForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("default");
  const [selectedTools, setSelectedTools] = useState<string[]>(["echo", "getTimestamp"]);
  const [availableTools, setAvailableTools] = useState<ToolOption[]>([]);
  const [useAdvisor, setUseAdvisor] = useState(false);
  const [advisorModel, setAdvisorModel] = useState("powerful");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchClient<{ tools: ToolOption[] }>("/api/admin/tools")
      .then(d => setAvailableTools(d.tools || []))
      .catch(() => setAvailableTools([
        { name: "echo", description: "Echo" },
        { name: "getTimestamp", description: "Timestamp" },
        { name: "calculate", description: "Calculator" },
      ]));
  }, []);

  function toggleTool(toolName: string) {
    setSelectedTools(prev =>
      prev.includes(toolName)
        ? prev.filter(t => t !== toolName)
        : [...prev, toolName]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        model,
        tools: selectedTools,
      };
      if (useAdvisor) {
        body.advisor = { model: advisorModel, maxUses: 3 };
      }
      const data = await postClient<{ success: boolean; error?: string }>("/api/admin/agents", body);
      if (!data.success) throw new Error(data.error);
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-primary/20 bg-primary/[0.02] p-4 space-y-3">
      <h3 className="text-[13px] font-semibold">새 에이전트 생성</h3>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">이름</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="my-agent"
            className="h-8 w-full rounded-md border border-border/50 bg-secondary px-2.5 font-mono text-[12px] outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">모델</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="h-8 w-full rounded-md border border-border/50 bg-secondary px-2.5 text-[12px] outline-none"
          >
            <option value="fast">fast (Haiku)</option>
            <option value="default">default (Sonnet)</option>
            <option value="powerful">powerful (Opus)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">설명</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="에이전트 설명..."
          className="h-8 w-full rounded-md border border-border/50 bg-secondary px-2.5 text-[12px] outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={useAdvisor}
            onChange={(e) => setUseAdvisor(e.target.checked)}
            className="rounded border-border/50"
          />
          Advisor 모델 사용
        </label>
        {useAdvisor && (
          <select
            value={advisorModel}
            onChange={(e) => setAdvisorModel(e.target.value)}
            className="h-7 rounded-md border border-violet-500/30 bg-violet-500/5 px-2 text-[11px] text-violet-400 outline-none"
          >
            <option value="powerful">powerful (Opus)</option>
            <option value="default">default (Sonnet)</option>
          </select>
        )}
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
          도구 ({selectedTools.length}/{availableTools.length} 선택)
        </label>
        <div className="flex flex-wrap gap-1.5">
          {availableTools.map((tool) => {
            const selected = selectedTools.includes(tool.name);
            return (
              <button
                key={tool.name}
                type="button"
                onClick={() => toggleTool(tool.name)}
                className={`rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  selected
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/50 text-muted-foreground hover:border-border"
                }`}
                title={tool.description}
              >
                {tool.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-7 text-[11px]" disabled={saving || !name.trim()}>
          {saving ? "생성 중..." : "생성"}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onClose}>
          취소
        </Button>
      </div>
    </form>
  );
}
