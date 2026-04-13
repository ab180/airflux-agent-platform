"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AgentCreateForm } from "./agent-create-form";

export function AgentCreateButton() {
  const [open, setOpen] = useState(false);

  if (open) {
    return <AgentCreateForm onClose={() => setOpen(false)} />;
  }

  return (
    <Button size="sm" className="h-8 text-[12px]" onClick={() => setOpen(true)}>
      + 에이전트 추가
    </Button>
  );
}
