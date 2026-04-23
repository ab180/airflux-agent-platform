---
name: data-export
description: "대량 데이터를 CSV/파일로 내보내기"
requiredTools:
  - executeSnowflakeQuery
  - generatePresignedUrl
guardrails:
  - read-only
  - row-limit
triggers:
  - export
  - 내보내기
  - csv
  - 다운로드
---

# Data Export Skill

쿼리 결과를 CSV 파일로 뽑아 presigned URL 로 전달합니다.

## 작동 절차

1. 읽기 전용 SELECT 로 결과를 페치합니다.
2. 기본 row limit 100,000. 초과 시 사용자에게 필터링 제안을 먼저 합니다.
3. 결과를 스트리밍으로 S3 에 쓴 뒤 `generatePresignedUrl` 로 공유 링크 발급.
4. URL 만료 기본 24시간.

## 사용 조건

- 개인식별정보 포함 가능성이 있는 테이블은 별도 승인 워크플로우가 붙어야
  합니다 (도메인별 ACL). 현재는 read-only + row-limit 두 가드레일만.
