import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  OrgMemberManager,
  type OrgMemberItem,
} from "@/components/dashboard/org-member-manager";
import { ProjectCreateForm } from "@/components/dashboard/project-create-form";
import {
  fetchAPISafe,
  type ProjectType,
  type WorkspaceResponse,
  type OrgRole,
} from "@/lib/api";

const TYPE_LABEL: Record<ProjectType, string> = {
  "code-repo": "코드 레포",
  docs: "문서",
  objective: "목표",
};

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const workspace = await fetchAPISafe<WorkspaceResponse>("/api/workspaces", {
    userId: "local",
    runMode: "local",
    drawer: { userId: "local", createdAt: "" },
    orgs: [],
  });
  const org = workspace.orgs.find((o) => o.id === id);
  if (!org) notFound();

  // Member list requires org-admin; hit it optionally.
  const { members } = await fetchAPISafe<{
    members: Array<{ orgId: string; userId: string; role: OrgRole; joinedAt: string }>;
  }>(`/api/orgs/${id}/members`, { members: [] });

  const callerIsAdmin = members.some(
    (m) => m.userId === workspace.userId && m.role === "admin",
  );

  const memberItems: OrgMemberItem[] = members.map((m) => ({
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/dashboard/workspaces"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          ← 워크스페이스
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{org.name}</h1>
            <code className="text-[11px] text-muted-foreground">@{org.slug}</code>
          </div>
          <p className="text-[12px] text-muted-foreground">
            {org.projects.length}개 프로젝트 ·{" "}
            {members.length > 0
              ? `${members.length}명 멤버`
              : "멤버 목록은 관리자에게만 노출됩니다"}
          </p>
        </div>
      </header>

      {/* Projects */}
      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          프로젝트
        </h2>
        {org.projects.length === 0 ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border/50 p-5">
            <p className="text-[12px] text-muted-foreground">
              아직 프로젝트가 없습니다.
            </p>
            <ProjectCreateForm orgId={org.id} />
          </div>
        ) : (
          <ul className="divide-y divide-border/40 rounded-lg border border-border/50">
            {org.projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/projects/${p.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{p.name}</span>
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
                </Link>
              </li>
            ))}
            <li className="border-t border-border/40 px-4 py-2">
              <ProjectCreateForm orgId={org.id} />
            </li>
          </ul>
        )}
      </section>

      {/* Members — admin only surface */}
      {members.length > 0 ? (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            조직 멤버
          </h2>
          <OrgMemberManager
            orgId={org.id}
            members={memberItems}
            canManage={callerIsAdmin}
            callerId={workspace.userId}
          />
        </section>
      ) : null}
    </div>
  );
}
