import { Badge } from "@/components/ui/badge";
import {
  fetchAPISafe,
  type WorkspaceResponse,
  type ProjectType,
} from "@/lib/api";

const TYPE_LABEL: Record<ProjectType, string> = {
  "code-repo": "코드 레포",
  docs: "문서",
  objective: "목표",
};

const VISIBILITY_LABEL: Record<string, string> = {
  private: "비공개",
  internal: "조직 내",
  public: "공개",
};

export default async function WorkspacesPage() {
  const workspace = await fetchAPISafe<WorkspaceResponse>("/api/workspaces", {
    userId: "local",
    runMode: "local",
    drawer: { userId: "local", createdAt: "" },
    orgs: [],
  });

  const totalProjects = workspace.orgs.reduce(
    (sum, org) => sum + org.projects.length,
    0,
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">워크스페이스</h1>
          <p className="text-[13px] text-muted-foreground">
            {workspace.orgs.length}개 조직 · {totalProjects}개 프로젝트 ·{" "}
            <span className="font-medium">
              {workspace.runMode === "local" ? "로컬 모드" : "팀 모드"}
            </span>
          </p>
        </div>
      </header>

      {/* Personal drawer */}
      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          개인 Drawer
        </h2>
        <div className="rounded-lg border border-border/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium">@{workspace.drawer.userId}</p>
              <p className="text-[11px] text-muted-foreground">
                개인 실험용 공간 · 검증 후 팀 프로젝트로 promote
              </p>
            </div>
            {workspace.drawer.createdAt ? (
              <span className="text-[11px] text-muted-foreground">
                생성{" "}
                {new Date(workspace.drawer.createdAt).toLocaleDateString("ko-KR")}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* Orgs + Projects */}
      <section className="space-y-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          조직 & 프로젝트
        </h2>
        {workspace.orgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 py-16 text-center">
            <h3 className="text-[13px] font-medium">소속 조직이 없습니다</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {workspace.runMode === "local"
                ? "bootstrap이 자동으로 'personal' 조직을 만들어야 합니다. airops start 후 확인하세요."
                : "초대받은 조직이 없습니다. 관리자에게 문의하세요."}
            </p>
          </div>
        ) : (
          workspace.orgs.map((org) => (
            <div
              key={org.id}
              className="rounded-lg border border-border/50 overflow-hidden"
            >
              <div className="border-b border-border/50 bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold tracking-tight">
                    {org.name}
                  </span>
                  <code className="text-[11px] text-muted-foreground">
                    @{org.slug}
                  </code>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {org.projects.length}개 프로젝트
                </p>
              </div>
              {org.projects.length === 0 ? (
                <p className="px-4 py-5 text-[12px] text-muted-foreground">
                  이 조직에는 아직 프로젝트가 없습니다.
                </p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {org.projects.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium">
                            {p.name}
                          </span>
                          <code className="text-[11px] text-muted-foreground">
                            @{p.slug}
                          </code>
                        </div>
                        {p.externalRef ? (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {p.externalRef}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        {TYPE_LABEL[p.type]}
                      </Badge>
                      <Badge variant="secondary" className="text-[11px]">
                        {VISIBILITY_LABEL[p.visibility] ?? p.visibility}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
