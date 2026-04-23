import { Badge } from "@/components/ui/badge";
import {
  fetchAPISafe,
  type PromotionRecord,
  type PromotionState,
} from "@/lib/api";

const STATE_LABEL: Record<PromotionState, string> = {
  "personal-draft": "초안",
  "under-review": "검토 중",
  published: "승인됨",
  deprecated: "거절됨",
  archived: "보관됨",
};

const STATE_VARIANT: Record<
  PromotionState,
  "default" | "secondary" | "outline" | "destructive"
> = {
  "personal-draft": "outline",
  "under-review": "default",
  published: "secondary",
  deprecated: "destructive",
  archived: "outline",
};

const KIND_LABEL: Record<PromotionRecord["assetKind"], string> = {
  agent: "에이전트",
  skill: "스킬",
  tool: "도구",
  prompt: "프롬프트",
};

export default async function MyPromotionsPage() {
  const { promotions } = await fetchAPISafe<{ promotions: PromotionRecord[] }>(
    "/api/promotions/mine",
    { promotions: [] },
  );

  const grouped: Record<PromotionState, PromotionRecord[]> = {
    "personal-draft": [],
    "under-review": [],
    published: [],
    deprecated: [],
    archived: [],
  };
  for (const p of promotions) grouped[p.state].push(p);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">내 Promotions</h1>
        <p className="text-[13px] text-muted-foreground">
          내가 요청한 모든 승격 요청 — 상태별로 정리됨
        </p>
      </header>

      {promotions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 py-16 text-center">
          <h3 className="text-[13px] font-medium">요청한 Promotion이 없습니다</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            개인 drawer에서 충분히 검증한 자산을 팀 프로젝트로 승격 요청할 수
            있습니다.
          </p>
        </div>
      ) : (
        (Object.keys(grouped) as PromotionState[])
          .filter((s) => grouped[s].length > 0)
          .map((state) => (
            <section key={state}>
              <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {STATE_LABEL[state]}
                <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium">
                  {grouped[state].length}
                </span>
              </h2>
              <ul className="space-y-2">
                {grouped[state].map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg border border-border/50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[11px]">
                            {KIND_LABEL[p.assetKind]}
                          </Badge>
                          <code className="text-[12px] font-mono">
                            {p.assetId}
                          </code>
                          <Badge
                            variant={STATE_VARIANT[p.state]}
                            className="text-[10px]"
                          >
                            {STATE_LABEL[p.state]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {p.toScope.kind === "project" && p.toScope.projectId ? (
                            <>
                              대상 프로젝트:{" "}
                              <code className="font-mono">
                                {p.toScope.projectId}
                              </code>
                            </>
                          ) : (
                            "대상 불명"
                          )}
                          {p.reviewedBy ? (
                            <>
                              {" · "}리뷰어 @{p.reviewedBy}
                            </>
                          ) : null}
                          {p.decidedAt ? (
                            <>
                              {" · "}
                              {new Date(p.decidedAt).toLocaleString("ko-KR")} 결정
                            </>
                          ) : null}
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
            </section>
          ))
      )}
    </div>
  );
}
