"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchClient } from "@/lib/client-api";

interface MCPField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

interface MCPServerItem {
  name: string;
  agents?: string[];
  transport: string;
  auth?: { mode?: "shared" | "personal"; fields?: MCPField[] };
  tools?: { name: string; description: string }[];
  connected: boolean;
  connectedAt: string | null;
  configured: boolean;
}

export function MCPSettings() {
  const [servers, setServers] = useState<MCPServerItem[]>([]);
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await fetchClient<{ servers: MCPServerItem[] }>(`/api/mcp/servers`);
    setServers(data.servers || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "MCP 상태를 불러오지 못했습니다."));
  }, []);

  async function connect(server: MCPServerItem) {
    setSaving(server.name);
    setError(null);
    try {
      await fetchClient("/api/mcp/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverName: server.name,
          values: values[server.name] || {},
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결 저장에 실패했습니다.");
    } finally {
      setSaving(null);
    }
  }

  async function disconnect(serverName: string) {
    setSaving(serverName);
    setError(null);
    try {
      await fetchClient(`/api/mcp/connections/${encodeURIComponent(serverName)}`, {
        method: "DELETE",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결 해제에 실패했습니다.");
    } finally {
      setSaving(null);
    }
  }

  if (servers.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 px-4 py-3 text-[12px] text-muted-foreground">
        등록된 MCP 서버가 없습니다. <span className="font-mono text-foreground/70">settings/mcp-servers.yaml</span>에 먼저 정의해야 합니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      )}

      {servers.map((server) => {
        const personal = server.auth?.mode === "personal";
        const fields = server.auth?.fields || [];

        return (
          <div key={server.name} className="rounded-lg border border-border/50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-medium">{server.name}</span>
                  <Badge variant="outline" className="text-[9px]">{server.transport}</Badge>
                  <Badge variant="outline" className="text-[9px]">{personal ? "personal" : "shared"}</Badge>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {server.connected ? "연결됨" : personal ? "개인 토큰 필요" : "플랫폼 공용 자격증명 사용"}
                  {server.tools && server.tools.length > 0 ? ` · tools ${server.tools.length}개` : ""}
                  {server.agents && server.agents.length > 0 ? ` · agents ${server.agents.length}개` : ""}
                </p>
              </div>
              <Badge
                variant="outline"
                className={server.connected ? "border-emerald-500/30 text-[10px] text-emerald-400" : "border-amber-500/30 text-[10px] text-amber-300"}
              >
                {server.connected ? "connected" : "disconnected"}
              </Badge>
            </div>

            {personal && (
              <div className="mt-3 space-y-2">
                {fields.map((field) => (
                  <div key={field.key}>
                    <label className="mb-1 block text-[11px] text-muted-foreground">{field.label}</label>
                    <input
                      type="password"
                      value={values[server.name]?.[field.key] || ""}
                      placeholder={field.placeholder || field.key}
                      autoComplete="off"
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [server.name]: {
                            ...(prev[server.name] || {}),
                            [field.key]: e.target.value,
                          },
                        }))
                      }
                      className="h-9 w-full rounded-md border border-border/50 bg-secondary px-3 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" className="h-8 text-[11px]" disabled={saving === server.name} onClick={() => connect(server)}>
                    {saving === server.name ? "저장 중..." : server.connected ? "토큰 갱신" : "연결"}
                  </Button>
                  {server.connected && (
                    <Button variant="ghost" size="sm" className="h-8 text-[11px]" disabled={saving === server.name} onClick={() => disconnect(server.name)}>
                      연결 해제
                    </Button>
                  )}
                </div>
              </div>
            )}

            {server.agents && server.agents.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {server.agents.map((agent) => (
                  <Badge key={agent} variant="secondary" className="font-mono text-[9px]">
                    {agent}
                  </Badge>
                ))}
              </div>
            )}

            {server.tools && server.tools.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {server.tools.slice(0, 6).map((tool) => (
                  <Badge key={tool.name} variant="outline" className="font-mono text-[9px]">
                    {tool.name}
                  </Badge>
                ))}
                {server.tools.length > 6 && (
                  <Badge variant="outline" className="text-[9px]">
                    +{server.tools.length - 6}
                  </Badge>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
