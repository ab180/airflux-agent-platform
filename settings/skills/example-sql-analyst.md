---
name: example-sql-analyst
description: "(예시) airops markdown skill 형식 시연 — SQL 분석 스킬"
requiredTools:
  - getSemanticLayer
  - executeSnowflakeQuery
guardrails:
  - read-only
  - row-limit
  - pii-filter
triggers:
  - DAU
  - MAU
  - 쿼리
  - select
---

# SQL Analyst (example)

이 파일은 `@airflux/core`의 `loadSkillsFromMarkdownDir` 로더가 어떻게 스킬을
불러오는지 보여주는 **참고용** 예시입니다.

## 작동 원칙

1. frontmatter의 YAML = 스킬 메타데이터 (name/description/tools/guardrails/triggers)
2. body의 markdown = 이 스킬이 동작할 때 LLM에 주입될 **instructions**
3. 파일명 ≠ skill name. frontmatter의 `name` 필드가 정식 식별자.

## 이 형식의 장점

- 한 파일 = 한 스킬 → 탐색/리뷰/PR 단위가 자연스러움
- Git diff가 의미 있게 보임 (YAML 구조와 프롬프트 텍스트 분리)
- Anthropic Skills / Claude Code Skills / OpenHands microagents 와 호환
- triggers 필드로 자동 라우팅 힌트 제공 가능

## 서버 부트스트랩

`settings/skills/*.md` 디렉토리가 존재하면 `packages/server/src/bootstrap.ts`가
자동으로 읽어 `SkillRegistry`에 등록합니다. YAML과 충돌할 경우 **나중에 로드된
마크다운이 덮어씁니다**.
