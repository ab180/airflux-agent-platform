"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { API_BASE } from "@/lib/config";
import type { OrgRole } from "@/lib/api";

const ROLE_OPTIONS: { value: OrgRole; label: string }[] = [
  { value: "admin", label: "관리자" },
  { value: "member", label: "멤버" },
  { value: "viewer", label: "뷰어" },
];

const ROLE_LABEL: Record<OrgRole, string> = {
  admin: "관리자",
  member: "멤버",
  viewer: "뷰어",
};

export interface OrgMemberItem {
  userId: string;
  role: OrgRole;
  joinedAt: string;
}

export function OrgMemberManager({
  orgId,
  members,
  canManage,
  callerId,
}: {
  orgId: string;
  members: OrgMemberItem[];
  canManage: boolean;
  callerId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<OrgRole>("member");

  async function act(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function addMember() {
    if (!newUserId.trim()) {
      setError("userId를 입력하세요");
      return;
    }
    await act(async () => {
      const res = await fetch(`${API_BASE}/api/orgs/${orgId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: newUserId.trim(), role: newRole }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setNewUserId("");
      setNewRole("member");
      setAddOpen(false);
    });
  }

  async function changeRole(userId: string, role: OrgRole) {
    await act(async () => {
      const res = await fetch(
        `${API_BASE}/api/orgs/${orgId}/members/${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    });
  }

  async function removeMember(userId: string) {
    if (!confirm(`@${userId} 를 이 조직에서 제거하시겠습니까?`)) return;
    await act(async () => {
      const res = await fetch(
        `${API_BASE}/api/orgs/${orgId}/members/${encodeURIComponent(userId)}`,
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
      <ul className="divide-y divide-border/40 rounded-lg border border-border/50">
        {members.map((m) => (
          <li
            key={m.userId}
            className="flex items-center justify-between px-4 py-2.5"
          >
            <div>
              <p className="text-[13px] font-medium">@{m.userId}</p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(m.joinedAt).toLocaleDateString("ko-KR")} 참여
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canManage && m.userId !== callerId ? (
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.userId, e.target.value as OrgRole)}
                  disabled={pending}
                  className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px]"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge variant="secondary" className="text-[11px]">
                  {ROLE_LABEL[m.role]}
                </Badge>
              )}
              {canManage && m.userId !== callerId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => removeMember(m.userId)}
                >
                  제거
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {canManage ? (
        addOpen ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/10 p-3">
            <input
              type="text"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="userId (예: alice)"
              className="flex-1 rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px] font-mono"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as OrgRole)}
              className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px]"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={addMember} disabled={pending}>
              초대
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAddOpen(false);
                setNewUserId("");
                setError(null);
              }}
            >
              취소
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            + 멤버 초대
          </Button>
        )
      ) : null}

      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
