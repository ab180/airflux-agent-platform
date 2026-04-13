"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "@/components/chat/chat-message";
import type { ChartData } from "@/components/chat/data-chart";
import { fetchClient, postClient } from "@/lib/client-api";

interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
  agent?: string;
  traceId?: string;
  durationMs?: number;
  tokens?: number;
  model?: string;
  toolCalls?: string[];
  steps?: number;
  chartData?: ChartData;
  timestamp: string;
  feedbackSent?: "positive" | "negative";
}

export default function PlaygroundPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [agent, setAgent] = useState("");
  const [agents, setAgents] = useState<{ value: string; label: string }[]>([
    { value: "", label: "자동 선택" },
  ]);
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load agents from API + read agent from URL query
  useEffect(() => {
    fetchClient<{ agents: { name: string; enabled: boolean }[] }>("/api/admin/agents")
      .then(data => {
        const list = (data.agents || []).map(a => ({
          value: a.name,
          label: `${a.name}${a.enabled ? "" : " (비활성)"}`,
        }));
        setAgents([{ value: "", label: "자동 선택" }, ...list]);
      })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const agentParam = params.get("agent");
    if (agentParam) setAgent(agentParam);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: query,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const data = await postClient<{
        text?: string;
        error?: string;
        agent?: string;
        traceId?: string;
        data?: unknown;
        metadata?: {
          durationMs?: number;
          model?: string;
          toolCalls?: string[];
          steps?: number;
          usage?: { inputTokens?: number; outputTokens?: number };
        };
      }>("/api/query", {
        query,
        agent: agent || undefined,
        userId: "admin-playground",
        sessionId,
      });

      const usage = data.metadata?.usage;
      const agentMsg: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        text: data.text || data.error || "응답 없음",
        agent: data.agent,
        traceId: data.traceId,
        durationMs: data.metadata?.durationMs,
        tokens: usage ? (usage.inputTokens || 0) + (usage.outputTokens || 0) : undefined,
        model: data.metadata?.model,
        toolCalls: data.metadata?.toolCalls,
        steps: data.metadata?.steps,
        chartData: data.data as ChartData | undefined,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, agentMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        text: "연결 실패: API 서버에 연결할 수 없습니다.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex h-[calc(100vh-theme(spacing.12))] flex-col">
      <div className="flex items-center justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">플레이그라운드</h1>
          <div className="flex items-center gap-2">
            <p className="text-[13px] text-muted-foreground">
              에이전트에 직접 질문하고 응답을 확인
            </p>
            <span className="font-mono text-[10px] text-muted-foreground/50" title={sessionId}>
              세션: {sessionId.slice(0, 8)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-muted-foreground">에이전트:</label>
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            className="h-8 rounded-md border border-border/50 bg-secondary px-2.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-primary"
          >
            {agents.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[11px]"
              onClick={() => setMessages([])}
            >
              초기화
            </Button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-[13px] text-muted-foreground">
                에이전트에 질문을 입력하세요
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {["앱 123의 DAU 알려줘", "지금 몇시야?", "hello world"].map(
                  (example) => (
                    <button
                      key={example}
                      onClick={() => setInput(example)}
                      className="rounded-md border border-border/50 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                    >
                      {example}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3.5 py-2.5 ${
                    msg.role === "user"
                      ? "bg-primary/10 text-foreground"
                      : "border border-border/50 bg-card"
                  }`}
                >
                  {msg.role === "agent" && msg.agent && (
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-[10px] text-primary">
                        {msg.agent}
                      </span>
                      {msg.model && (
                        <span className="font-mono text-[10px] text-violet-400">
                          {msg.model}
                        </span>
                      )}
                      {msg.durationMs !== undefined && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {msg.durationMs}ms
                        </span>
                      )}
                      {msg.tokens !== undefined && msg.tokens > 0 && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {msg.tokens} tokens
                        </span>
                      )}
                    </div>
                  )}
                  {msg.role === "agent" ? (
                    <ChatMessage
                      text={msg.text}
                      toolCalls={msg.toolCalls}
                      chartData={msg.chartData}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                      {msg.text}
                    </p>
                  )}
                  {msg.role === "agent" && msg.traceId && (
                    <FeedbackButtons
                      msg={msg}
                      onFeedback={(rating) => {
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === msg.id ? { ...m, feedbackSent: rating } : m
                          )
                        );
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg border border-border/50 bg-card px-3.5 py-2.5">
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-border/50 pt-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="질문을 입력하세요..."
            disabled={loading}
            autoFocus
            className="flex-1 rounded-lg border border-border/50 bg-secondary/50 px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
          />
          <Button type="submit" disabled={loading || !input.trim()} className="h-10 px-5 text-[13px]">
            전송
          </Button>
        </div>
      </form>
    </div>
  );
}

function FeedbackButtons({
  msg,
  onFeedback,
}: {
  msg: Message;
  onFeedback: (rating: "positive" | "negative") => void;
}) {
  const [sending, setSending] = useState(false);

  async function submit(rating: "positive" | "negative") {
    if (msg.feedbackSent || sending) return;
    setSending(true);
    try {
      await postClient("/api/feedback", {
        traceId: msg.traceId,
        rating,
        agent: msg.agent || "unknown",
        userId: "admin-playground",
      });
      onFeedback(rating);
    } finally {
      setSending(false);
    }
  }

  if (msg.feedbackSent) {
    return (
      <div className="mt-1.5 text-[10px] text-muted-foreground">
        {msg.feedbackSent === "positive" ? "+" : "-"} 피드백 전송됨
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex items-center gap-1">
      <button
        onClick={() => submit("positive")}
        disabled={sending}
        className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-50"
        title="좋은 답변"
        aria-label="긍정 피드백"
      >
        +
      </button>
      <button
        onClick={() => submit("negative")}
        disabled={sending}
        className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
        title="개선 필요"
        aria-label="부정 피드백"
      >
        -
      </button>
    </div>
  );
}
