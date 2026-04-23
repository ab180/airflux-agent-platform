"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "현황", icon: GridIcon },
  { href: "/dashboard/agents", label: "에이전트", icon: BotIcon },
  { href: "/dashboard/skills", label: "스킬", icon: ZapIcon },
  { href: "/dashboard/tools", label: "도구", icon: WrenchIcon },
  { href: "/dashboard/prompts", label: "프롬프트", icon: FileTextIcon },
  { href: "/dashboard/playground", label: "플레이그라운드", icon: ChatIcon },
  { href: "/dashboard/schedules", label: "스케줄", icon: ClockIcon },
  { href: "/dashboard/evaluation", label: "평가", icon: CheckIcon },
  { href: "/dashboard/feedback", label: "피드백", icon: ThumbsIcon },
  { href: "/dashboard/monitoring", label: "모니터링", icon: ActivityIcon },
  { href: "/dashboard/ai-usage", label: "AI 사용량", icon: ChartIcon },
  { href: "/dashboard/logs", label: "로그", icon: TerminalIcon },
  { href: "/dashboard/settings", label: "설정", icon: GearIcon },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-border/50 bg-sidebar" aria-label="사이드바 네비게이션">
      <div className="flex h-14 items-center gap-2.5 border-b border-border/50 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15">
          <span className="text-sm font-semibold text-primary">A</span>
        </div>
        <div>
          <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
            Airflux
          </span>
          <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">
            v0.1
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2.5 py-3" aria-label="대시보드 메뉴">
        <span className="mb-2 block px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          플랫폼
        </span>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/dashboard"
              ? pathname === "/dashboard"
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
      </nav>

      <div className="border-t border-border/50 px-2.5 py-2">
        <Link
          href="/chat"
          className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
        >
          <ChatBubbleIcon className="h-3.5 w-3.5 shrink-0" />
          사용자 채팅 →
        </Link>
      </div>
      <div className="border-t border-border/50 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" role="status" aria-label="시스템 정상" />
            <span className="text-[11px] text-muted-foreground">관리자 모드</span>
          </div>
          <ThemeToggle />
        </div>
        <UserInfo />
      </div>
    </aside>
  );
}

function UserInfo() {
  const isTeamMode = process.env.NEXT_PUBLIC_AUTH_MODE === "google-sso";
  if (!isTeamMode) return null;
  // Lazy-load session component only in team mode to avoid useSession without SessionProvider
  return <TeamUserInfo />;
}

function TeamUserInfo() {
  // Dynamic import to avoid hook call when SessionProvider isn't present
  const { useSession: useSessionHook, signOut: signOutFn } = require("next-auth/react");
  const { data: session } = useSessionHook();
  if (!session?.user) return null;

  return (
    <div className="mt-2 flex items-center justify-between">
      <span className="truncate text-[10px] text-muted-foreground/70" title={session.user.email || ""}>
        {session.user.email}
      </span>
      <button
        onClick={() => signOutFn({ callbackUrl: "/login" })}
        className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground"
      >
        로그아웃
      </button>
    </div>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="3" y="5" width="10" height="8" rx="2" />
      <circle cx="6" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="9" r="1" fill="currentColor" stroke="none" />
      <path d="M8 2v3" />
      <circle cx="8" cy="1.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8l1-5.5z" />
    </svg>
  );
}

function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 2.5a3.5 3.5 0 00-4.95 4.95l-3.3 3.3a1 1 0 000 1.41l1.59 1.59a1 1 0 001.41 0l3.3-3.3a3.5 3.5 0 004.95-4.95l-2 2-1.5-1.5 2-2z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 8h2.5l2-4.5 3 9 2-4.5h3.5" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M4.5 6l2.5 2-2.5 2" />
      <path d="M8.5 10h3" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 3.5h11a1 1 0 011 1v6a1 1 0 01-1 1h-3l-3 2.5v-2.5h-5a1 1 0 01-1-1v-6a1 1 0 011-1z" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 1.5H4a1 1 0 00-1 1v11a1 1 0 001 1h8a1 1 0 001-1V5L9.5 1.5z" />
      <path d="M9.5 1.5V5H13" />
      <path d="M5.5 8h5M5.5 10.5h3" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <path d="M5.5 8l2 2 3.5-4" />
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

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 14V6l3.5-4L9 7l3-3 2.5 3" />
      <path d="M2 14h12" />
    </svg>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 3.5h11a1 1 0 011 1v6a1 1 0 01-1 1h-3l-3 2.5v-2.5h-5a1 1 0 01-1-1v-6a1 1 0 011-1z" />
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
