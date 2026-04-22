"use client";

import { useState } from "react";

/**
 * Local-only convenience: copies the host-side Claude credential sync
 * command to the clipboard. The container can't trigger Keychain access
 * itself, so the user still has to paste this into a host terminal —
 * but a one-click copy beats remembering the script path.
 */
export function SyncCopyButton() {
  const [copied, setCopied] = useState(false);
  const cmd = "bash scripts/sync-claude.sh";
  function copy() {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 rounded border border-current/30 px-1.5 py-0.5 font-mono text-[10px] hover:bg-current/10 transition-colors"
      title="호스트 터미널에 붙여넣고 실행하세요"
    >
      {copied ? "✓ 복사됨" : `📋 ${cmd}`}
    </button>
  );
}
