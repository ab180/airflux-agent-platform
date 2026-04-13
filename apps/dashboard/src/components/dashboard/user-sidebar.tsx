"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/chat", label: "채팅", icon: ChatIcon },
  { href: "/chat/feedback", label: "피드백", icon: ThumbsIcon },
] as const;

export function UserSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-border/50 bg-sidebar" aria-label="사용자 네비게이션">
      <div className="flex h-14 items-center gap-2.5 border-b border-border/50 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15">
          <span className="text-sm font-semibold text-primary">A</span>
        </div>
        <div>
          <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
            Airflux
          </span>
          <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">
            Chat
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2.5 py-3" aria-label="채팅 메뉴">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/chat"
              ? pathname === "/chat"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground/70 group-hover:text-sidebar-foreground"
                }`}
              />
              {label}
            </Link>
          );
        })}

        <div className="mt-4 border-t border-border/30 pt-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            <GearIcon className="h-3.5 w-3.5 shrink-0" />
            관리자 콘솔
          </Link>
        </div>
      </nav>

      <div className="border-t border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" role="status" aria-label="시스템 정상" />
          <span className="text-[11px] text-muted-foreground">로컬 모드</span>
        </div>
      </div>
    </aside>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 3.5h11a1 1 0 011 1v6a1 1 0 01-1 1h-3l-3 2.5v-2.5h-5a1 1 0 01-1-1v-6a1 1 0 011-1z" />
    </svg>
  );
}

function ThumbsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 14V7m0 0l2-5h.5a1.5 1.5 0 011.5 1.5V6h3.25a1 1 0 01.97 1.24l-1.25 5A1 1 0 0111 13H5z" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M13.4 9.5a1.2 1.2 0 00.2 1.3l.05.04a1.44 1.44 0 11-2.04 2.04l-.04-.05a1.2 1.2 0 00-1.3-.2 1.2 1.2 0 00-.73 1.1v.12a1.44 1.44 0 11-2.88 0v-.06a1.2 1.2 0 00-.79-1.1 1.2 1.2 0 00-1.3.2l-.04.05a1.44 1.44 0 11-2.04-2.04l.05-.04a1.2 1.2 0 00.2-1.3 1.2 1.2 0 00-1.1-.73H2.2a1.44 1.44 0 010-2.88h.06a1.2 1.2 0 001.1-.79 1.2 1.2 0 00-.2-1.3l-.05-.04a1.44 1.44 0 112.04-2.04l.04.05a1.2 1.2 0 001.3.2h.06a1.2 1.2 0 00.73-1.1V2.2a1.44 1.44 0 012.88 0v.06a1.2 1.2 0 00.79 1.1 1.2 1.2 0 001.3-.2l.04-.05a1.44 1.44 0 112.04 2.04l-.05.04a1.2 1.2 0 00-.2 1.3v.06a1.2 1.2 0 001.1.73h.12a1.44 1.44 0 010 2.88h-.06a1.2 1.2 0 00-1.1.79z" />
    </svg>
  );
}
