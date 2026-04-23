import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  fetchAPI,
  fetchAPISafe,
  type ProjectRole,
  type ProjectType,
  type PromotionRecord,
  type WorkspaceProject,
} from "@/lib/api";

interface ProjectDetailResponse {
  project: WorkspaceProject;
  callerRole: ProjectRole;
  members: Array<{ projectId: string; userId: string; role: ProjectRole; joinedAt: string }>;
}

const TYPE_LABEL: Record<ProjectType, string> = {
  "code-repo": "코드 레포",
  docs: "문서",
  objective: "목표",
};

const ROLE_LABEL: Record<ProjectRole, string> = {
  maintainer: "메인테이너",
  contributor: "기여자",
  runner: "실행자",
  viewer: "뷰어",
};

const ASSET_KIND_LABEL: Record<PromotionRecord["assetKind"], string> = {
  agent: "에이전트",
  skill: "스킬",
  tool: "도구",
  prompt: "프롬프트",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail: ProjectDetailResponse;
  try {
    detail = await fetchAPI<ProjectDetailResponse>(`/api/projects/${id}`);
  } catch {
    notFound();
  }

  const { promotions } = await fetchAPISafe<{ promotions: PromotionRecord[] }>(
    `/api/promotions?projectId=${encodeURIComponent(id)}`,
    { promotions: [] },
  );

  const isMaintainer = detail.callerRole === "maintainer";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/dashboard/workspaces"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          ← 워크스페이스
        </Link>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">
                {detail.project.name}
              </h1>
              <code className="text-[11px] text-muted-foreground">
                @{detail.project.slug}
              </code>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Badge variant="outline" className="text-[11px]">
                {TYPE_LABEL[detail.project.type]}
              </Badge>
              <span>·</span>
              <span>{detail.project.visibility}</span>
              <span>·</span>
              <span>
                내 역할:{" "}
                <span className="font-medium text-foreground">
                  {ROLE_LABEL[detail.callerRole]}
                </span>
              </span>
            </div>
            {detail.project.externalRef ? (
              <p className="text-[12px] text-muted-foreground">
                외부 연동: {detail.project.externalRef}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {/* Members */}
      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          멤버 ({detail.members.length})
        </h2>
        <ul className="divide-y divide-border/40 rounded-lg border border-border/50">
          {detail.members.map((m) => (
            <li
              key={`${m.projectId}-${m.userId}`}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <div>
                <p className="text-[13px] font-medium">@{m.userId}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(m.joinedAt).toLocaleDateString("ko-KR")} 참여
                </p>
              </div>
              <Badge variant="secondary" className="text-[11px]">
                {ROLE_LABEL[m.role]}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      {/* Pending promotions */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            검토 대기 Promotion ({promotions.length})
          </h2>
          {!isMaintainer ? (
            <span className="text-[11px] text-muted-foreground">
              승인/거절은 메인테이너만 가능합니다
            </span>
          ) : null}
        </div>
        {promotions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 py-10 text-center">
            <p className="text-[12px] text-muted-foreground">
              현재 검토 중인 요청이 없습니다.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {promotions.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-border/50 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[11px]">
                        {ASSET_KIND_LABEL[p.assetKind]}
                      </Badge>
                      <code className="text-[12px] font-mono">{p.assetId}</code>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      @{p.requestedBy} 요청 ·{" "}
                      {p.fromScope.kind === "drawer"
                        ? `개인 drawer (@${p.fromScope.userId})`
                        : "다른 프로젝트"}{" "}
                      → 현재 프로젝트
                    </p>
                    {p.notes ? (
                      <p className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-[12px]">
                        {p.notes}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
