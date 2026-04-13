import { UserSidebar } from "@/components/dashboard/user-sidebar";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        메인 콘텐츠로 건너뛰기
      </a>
      <UserSidebar />
      <main id="main-content" className="ml-56 flex-1 overflow-y-auto" aria-label="채팅 콘텐츠">
        <div className="mx-auto max-w-4xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
