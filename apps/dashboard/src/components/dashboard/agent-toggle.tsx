"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

import { postClient } from "@/lib/client-api";

export function AgentToggle({
  name,
  enabled,
}: {
  name: string;
  enabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function toggle() {
    setLoading(true);
    try {
      const action = enabled ? "disable" : "enable";
      await postClient(`/api/admin/agents/${name}/${action}`, {});
      router.refresh();
    } catch {
      // Toggle failed silently — page will show stale state
    } finally {
      setLoading(false);
    }
  }

  return enabled ? (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-[11px] text-destructive hover:text-destructive"
      onClick={toggle}
      disabled={loading}
    >
      {loading ? "..." : "비활성화"}
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-[11px]"
      onClick={toggle}
      disabled={loading}
    >
      {loading ? "..." : "활성화"}
    </Button>
  );
}
