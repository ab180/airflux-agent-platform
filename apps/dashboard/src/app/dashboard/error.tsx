"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <span className="text-lg text-destructive">!</span>
        </div>
        <h2 className="text-[15px] font-semibold">문제가 발생했습니다</h2>
        <p className="mt-1.5 max-w-sm text-[12px] text-muted-foreground">
          {error.message || "알 수 없는 오류가 발생했습니다."}
        </p>
        <Button
          onClick={reset}
          variant="outline"
          size="sm"
          className="mt-4 h-8 text-[12px]"
        >
          다시 시도
        </Button>
      </div>
    </div>
  );
}
