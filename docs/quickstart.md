# Quickstart — 첫 5분

`airops start` 한 명령으로 Postgres + 서버 + 대시보드를 띄우고, 첫 에이전트 호출까지 도달하는 최단 경로입니다.

## 사전 요구

- **Node.js** 20+ (`node -v`)
- **Docker Desktop** 실행 중 (`docker info` 가 동작해야 함)
- **Claude Code 로그인** (로컬 모드의 LLM 크레덴셜) — 미설치 시 `npm i -g @anthropic-ai/claude-code && claude login`
- macOS 에서는 Keychain 의 OAuth 토큰을 자동으로 읽으므로 별도 키 파일 sync 가 필요 없음

## 5분 절차

```bash
# 1. clone & 의존성
git clone <repo>
cd airflux-agent-platform
npm install

# 2. core 패키지 1회 빌드 (server 가 의존)
npm run build --workspace=@airflux/core

# 3. 한 명령으로 모두 기동 (= 로컬 모드)
npx airops start
```

기동되면 다음과 같은 출력이 나옵니다:

```
[pg]     airops-pg @ localhost:5432 ✓ healthy
[server] http://localhost:3100 (pid …)
[web]    http://localhost:3200 (pid …)
press Ctrl+C to stop all.
```

> `airops start` 는 현재 로컬 모드 전용입니다. 향후 팀 모드(`airops start --team`)가 추가되면 이 명령은 `airops start --local` 로도 표기됩니다 (`docs/CONTEXT.md` 비전 v2 참조).

## 첫 에이전트 호출

서버 포트(예: `3100`)를 확인한 뒤:

```bash
curl -X POST http://localhost:3100/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "hello"}'
```

응답 예:

```json
{ "success": true, "result": "...", "durationMs": 423, "agent": "echo-agent" }
```

대시보드는 `http://localhost:3200` 에서 운용 화면을 확인할 수 있습니다.

## 그 다음 한 걸음

| 하고 싶은 일 | 명령 |
|---|---|
| 현재 URL/포트 확인 | `npx airops status` |
| Postgres 접속 | `npx airops db psql` |
| Connection URL 만 출력 | `npx airops db url` |
| 종료 (데이터 유지) | `npx airops stop` |
| 종료 + 볼륨 삭제 | `npx airops stop --reset` |
| 헬스/LLM 상태 점검 | `curl http://localhost:3100/api/health` |

## 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| `이미 실행 중인 airops 세션이 있습니다` | 다른 터미널에서 이미 기동됨. `npx airops stop` 후 재시도. |
| `Postgres healthcheck timed out after 15000ms` | Docker 가 멈춰있거나 5432 충돌. Docker Desktop 실행 확인 후 `docker ps` 로 다른 postgres 컨테이너가 점유하지 않는지 확인. |
| `docker: command not found` / `Cannot connect to the Docker daemon` | Docker Desktop 미설치 또는 미실행. 실행 후 `docker info` 가 정상이면 재시도. |
| `npm run build` 가 `@airflux/core not found` 로 실패 | `npm install` 이전 단계 누락. 루트에서 다시 `npm install`. |
| `/api/health` 의 `llm.available: false`, `hint: "claude login required"` | Claude Code 미로그인. `claude login` 후 서버 재시작. |
| `/api/health` 의 `llm.expired: true` | OAuth 토큰 만료. `claude login` 으로 재인증. |
| `curl … /api/query` 가 `404` | 포트 오타. `npx airops status` 로 실제 server 포트 확인 (3100–3199 중 빈 포트). |
| `curl … /api/query` 가 `400 query required` | body 의 JSON 키가 `query` 인지 확인. |
| 대시보드만 안 뜸 | 3200–3299 포트 충돌. 다른 Next.js 인스턴스 종료 후 `npx airops start` 재실행. |
| Ctrl+C 후 `airops-pg` 가 남아있음 | 의도된 동작 — 데이터 보존. 완전 정리는 `npx airops stop --reset`. |

문제가 위 표에 없으면 `/api/health` 응답과 `npx airops status` 출력을 첨부해 이슈 등록.
