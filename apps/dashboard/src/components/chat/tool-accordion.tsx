"use client";

import { useState } from "react";

interface ToolAccordionProps {
  toolCalls: string[];
}

export function ToolAccordion({ toolCalls }: ToolAccordionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="mb-2 space-y-0.5">
      {toolCalls.map((tool, i) => (
        <button
          key={`${tool}-${i}`}
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/30"
          aria-expanded={expanded}
        >
          <span className="text-emerald-400">🔧</span>
          <span className="font-mono">{tool}</span>
          <span className="text-emerald-400/60">✓</span>
          <span className="ml-auto text-[10px]">{expanded ? "▼" : "▶"}</span>
        </button>
      ))}
      {expanded && (
        <div className="ml-6 rounded-md bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground">
          {toolCalls.length}개 도구 호출 완료
        </div>
      )}
    </div>
  );
}
