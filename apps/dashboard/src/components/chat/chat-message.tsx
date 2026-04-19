"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ToolAccordion } from "./tool-accordion";
import { DataChart, type ChartData } from "./data-chart";

interface ChatMessageProps {
  text: string;
  toolCalls?: string[];
  chartData?: ChartData;
  thinking?: string;
}

export function ChatMessage({ text, toolCalls, chartData, thinking }: ChatMessageProps) {
  return (
    <div className="space-y-0">
      {/* Extended thinking accordion */}
      {thinking && <ThinkingAccordion thinking={thinking} />}

      {/* Tool calls accordion */}
      {toolCalls && toolCalls.length > 0 && (
        <ToolAccordion toolCalls={toolCalls} />
      )}

      {/* Markdown rendered text */}
      <div className="prose prose-invert prose-sm max-w-none text-[13px] leading-relaxed
        prose-headings:text-foreground prose-headings:font-semibold prose-headings:tracking-tight
        prose-h1:text-[16px] prose-h2:text-[14px] prose-h3:text-[13px]
        prose-p:text-foreground/90 prose-p:my-1.5
        prose-strong:text-foreground prose-strong:font-semibold
        prose-code:text-primary prose-code:bg-primary/10 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-lg prose-pre:my-2
        prose-table:text-[12px]
        prose-th:border-b prose-th:border-border/50 prose-th:pb-1.5 prose-th:text-left prose-th:font-semibold prose-th:text-muted-foreground
        prose-td:border-b prose-td:border-border/30 prose-td:py-1.5
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-li:text-foreground/90 prose-li:my-0.5
        prose-ul:my-1.5 prose-ol:my-1.5
        prose-blockquote:border-l-primary/30 prose-blockquote:text-muted-foreground prose-blockquote:my-2
        prose-hr:border-border/30
      ">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {text}
        </ReactMarkdown>
      </div>

      {/* Chart visualization */}
      {chartData && <DataChart chart={chartData} />}
    </div>
  );
}

function ThinkingAccordion({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/30"
        aria-expanded={expanded}
      >
        <span className="text-violet-400">💭</span>
        <span className="font-medium text-violet-300/80">사고 과정</span>
        <span className="ml-auto text-[10px] text-muted-foreground/60">{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded && (
        <div className="ml-2 mt-1 rounded-md border border-violet-500/20 bg-violet-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono">
          {thinking}
        </div>
      )}
    </div>
  );
}
