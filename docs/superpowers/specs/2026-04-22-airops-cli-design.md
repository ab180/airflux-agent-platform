# `airops` — 로컬 개발용 단일 CLI 설계

**Date**: 2026-04-22
**Status**: Design approved, pending implementation plan

## Context

AB180의 에이전트 플랫폼 로컬 개발이 `docker compose up` 중심이라, 호스트 OS 리소스 — 특히 macOS Keychain — 접근이 격리 문제로 끊긴다. 현재 Claude OAuth 토큰 sync, 포트 관리, 3개 서비스(postgres/server/dashboard) 기동 과정이 산재해 있고, 사용자가 **토큰이 만료될 때마다 수동 sync**가 필요하다. 본 설계는 이 흐름을 **하나의 CLI 바이너리 `airops`로 통합**하여 "플랫폼 개발은 `airops start`로 시작, 끝"이라는 UX를 만드는 것을 목표로 한다.

**핵심 아이디어**:
- DB만 Docker(영속성 + 프로덕션 스토리지 일치)
- Server/Dashboard는 호스트 native 실행 (Keychain/Terminal 자유 접근)
- `readCredentials()`에 macOS Keychain 분기 추가 → **sync 개념 자체 제거**
- 포트 자동 회피(Z) + Postgres 강건 재사용
- 단일 CLI 안에 start/stop/status/db 서브명령 통합

**Non-goals**:
- 프로덕션 배포 workflow (Lambda/Bedrock 경로는 기존 `environment.ts` 유지)
- 에이전트 조작까지 CLI에 담기 (Q1 C 옵션은 후순위)
- 풀 Windows Credential Manager 통합 (파일 fallback만 제공)

## 1. Architecture

```
packages/
├── cli/                        ← 신규 workspace @ab180/airops-cli
│   ├── src/
│   │   ├── commands/
│   │   │   ├── start.ts
│   │   │   ├── stop.ts
│   │   │   ├── status.ts
│   │   │   └── db.ts           ← url | psql | dump | restore | reset
│   │   ├── orchestra.ts        ← 자식 프로세스 lifecycle
│   │   ├── ports.ts            ← 포트 스캔/선점 (Z 전략)
│   │   ├── postgres.ts         ← Docker container 감지/재사용/재시작
│   │   ├── state.ts            ← .airops/state.json 읽기/쓰기
│   │   ├── logs.ts             ← prefixed color stream merge
│   │   └── platform.ts         ← macOS/Linux/Windows 분기 (credential, signal)
│   ├── bin/airops              ← npx 진입점 (chmod +x)
│   └── package.json
```

**기술 스택**: `commander` (CLI 파싱), `execa` (자식 spawn + signal), `get-port` (포트 스캔), `picocolors` (색상 로그), `tree-kill` (Windows signal fallback). 전부 light-weight, TS, 기존 turbo 파이프라인에 얹힘.

**실행 모델**: `airops start`는 기본 **foreground** — 터미널을 점유하고 3개 자식의 로그를 `[pg] [server] [web]` prefix로 색 분리해서 스트리밍. Ctrl+C → CLI가 SIGTERM을 모든 자식에 전파 → docker stop + node kill → 원샷 정리.

**자식 구성**:
- **pg** : `docker run -d --name airops-pg -v airops-pgdata:/var/lib/postgresql/data -p <port>:5432 postgres:16-alpine`. CLI가 있으면 재사용, 없으면 생성
- **server** : `tsx watch packages/server/src/index.ts` + 환경변수 `DATABASE_URL` / `PORT` 자동 주입
- **web** : `next dev --port <port>` in `apps/dashboard` + `API_URL` 자동 주입

CLI가 모든 연결 정보를 런타임에 계산해서 env로 내려줌 → 서브 프로세스는 서로를 하드코딩된 포트로 찾지 않음.

## 2. Commands

초기 세트 (최소):

| 커맨드 | 역할 |
|---|---|
| **`airops start [--open]`** | foreground 실행. Postgres + server + dashboard 올리고 색 구분 로그 stream. Ctrl+C → 원샷 정리. `--open`은 대시보드 URL을 브라우저로 열기 |
| **`airops stop [--reset]`** | 다른 터미널에서 실행 or crash 복구용. PID/컨테이너 정리. `--reset`은 volume까지 삭제 (데이터 wipe, 확인 프롬프트 필수) |
| **`airops status`** | 현재 실행 중 서비스의 URL/포트/health 표로 출력 |
| **`airops db url`** | DATABASE_URL 출력 (GUI에 붙여넣기용) |
| **`airops db psql`** | `docker exec -it airops-pg psql -U airops airops` 즉시 세션 |
| **`airops db dump [--file x.sql]`** | `pg_dump` 래핑 |
| **`airops db restore <file>`** | 파일 기반 복원 |
| **`airops db reset`** | volume 삭제 + 빈 DB 재생성 (`--yes` skip 프롬프트) |

**후순위 (필요 시 추가)**:
- `--detach` / `airops logs` (백그라운드 실행 + tail)
- `airops query "..." --agent X` (CLI에서 에이전트 직접 호출)
- `airops doctor` (진단)

## 3. 포트 & Postgres 강건성

### Port 선점 (Server/Dashboard) — Z 전략

- `get-port` 라이브러리 사용
- 범위: server `3100-3199`, web `3200-3299`
- 결정된 포트를 `.airops/state.json`에 기록 → `status`가 읽어 출력
- 사용자가 URL을 북마크하면 **다음 실행에 포트 바뀔 수 있음**. `status` 커맨드로 현재 URL 확인하는 흐름이 기본 UX

### Postgres 강건성

- **고정 이름**: container `airops-pg`, volume `airops-pgdata`
- start 판정 순서:
  1. `docker inspect airops-pg`
     - **running** → 재사용 (`pg_isready` 폴링만)
     - **stopped** → `docker start airops-pg`
     - **없음** → `docker run` (새로 생성)
  2. 포트는 5432 선호, 점유됐으면 5433/5434 순차 시도. 자기 컨테이너의 이전 포트면 그대로 재사용
  3. `pg_isready` 폴링으로 healthy 대기 (최대 15초, 실패 시 `docker logs airops-pg --tail 30` 출력 + exit 1)
- **데이터 persist**: volume은 절대 자동 삭제 안 함. `airops stop --reset`에서만 제거 (확인 프롬프트)
- **연결 문자열 동적 구성**: `DATABASE_URL=postgres://airops:airops@localhost:<picked>/airops`를 server env로 내려줌. server는 기존 `environment.ts` 경로 그대로 (`storageStrategy = hasDatabaseUrl ? 'postgres' : 'sqlite'`)

### start 첫 화면

```
[pg]     airops-pg @ localhost:5432   ✓ healthy
[server] http://localhost:3100         ✓ ready (pid 12345)
[web]    http://localhost:3201         ✓ ready (pid 12346)

press Ctrl+C to stop all.
```

이후 각 자식의 stdout이 같은 prefix + 색상으로 이어서 흐름.

## 4. State & Lifecycle

### `.airops/state.json` 스키마 (gitignored)

```jsonc
{
  "version": 1,
  "startedAt": "2026-04-22T...",
  "services": {
    "pg":     { "container": "airops-pg", "port": 5432 },
    "server": { "pid": 12345, "port": 3100 },
    "web":    { "pid": 12346, "port": 3201 }
  }
}
```

### start 시 stale 감지

1. state 파일 읽기 (없거나 version mismatch면 무시 + fresh start)
2. 각 PID에 `process.kill(pid, 0)` — alive 확인
3. **살아있고 expected 포트 listen 중** → "이미 실행 중입니다. `airops stop` 먼저." 후 exit
4. **죽었거나 정보 없음** → 정상 진행. 이전 session의 `airops-pg` 컨테이너가 running이면 재사용

### SIGINT 전파 (Ctrl+C)

1. `process.on('SIGINT', shutdown)` — idempotent
2. 로그 한 줄: `shutting down...`
3. 자식에 `SIGTERM` 순서대로: **web → server → pg** (종속성 역순)
4. 각 자식 grace period **5s** 대기. timeout이면 `SIGKILL` (Windows는 `tree-kill`)
5. state.json 삭제
6. exit 0

### 자식 중 하나가 죽으면 — fail-fast

auto-restart 없음. 재시작 루프는 원인을 가린다. 죽은 자식의 종료 코드와 마지막 로그 출력 → 나머지 정리 → exit 1. 재시작은 사용자가 `airops start` 재실행.

### stop 커맨드 흐름

1. state.json 읽고 services 나열
2. PID에 `SIGTERM` → grace 5s → `SIGKILL`
3. `airops-pg`: 기본 `docker stop` (데이터 유지). `--reset` 주면 `docker rm -fv` + volume 삭제
4. state.json 삭제

### crash recovery

start가 항상 stale detection 돌리므로 별도 cleanup 커맨드 불필요. Ctrl+C 실패 / 터미널 강제 종료 같은 엣지 케이스도 다음 start에서 자동 청소.

## 5. Error Handling

| 상황 | 처리 |
|---|---|
| Docker daemon 안 켜짐 | "Docker Desktop이 실행 중이 아닙니다." + exit 1 |
| Docker CLI 없음 | 설치 안내 링크 + exit 1 |
| Node 버전 부족 | `engines` 필드 체크. 최소 버전 / 현재 버전 표시 |
| 포트 범위 전부 점유 | `lsof -i :<port>` 결과 요약 + 다른 범위 쓰는 법 안내 (`--server-port-start 4000`) |
| Postgres healthcheck 15s 실패 | `docker logs airops-pg --tail 30` 자동 출력 + exit 1 |
| server/web spawn 실패 (deps 없음) | "`npm install` 먼저 실행하세요" |
| state.json 손상/구버전 | 조용히 무시 + stale 정리 후 fresh start |
| stop 했는데 실행 중 서비스 없음 | noop + "실행 중인 서비스가 없습니다." |

## 6. Platform 호환성

### macOS — v1 주 타깃

- CLI 완전 동작
- Docker Desktop
- **Credential**: `security` CLI로 Keychain 직통 (`security find-generic-password -s 'Claude Code-credentials' -w`). 파일 sync 개념 자체 제거

### Linux / Ubuntu — v1 일급 지원

- CLI 완전 동작. Docker 네이티브 엔진(Docker Desktop 불필요)이 더 가벼움
- Signal/PID/POSIX 표준 — 이상적
- **Credential**: Claude Code Linux가 `~/.claude/.credentials.json`을 직접 사용. Keychain 같은 중앙 저장소 없음 → 파일이 곧 truth. sync 문제 자체가 없음

### Windows — v1 파일 fallback

- CLI 동작 (commander/execa 등 cross-platform)
- Docker Desktop (WSL2 백엔드)
- Signal 처리: `tree-kill` 헬퍼 사용
- `airops.cmd` shim은 `npm`이 자동 생성
- **Credential**: `%APPDATA%\Claude\credentials.json` 파일 직접 읽기. Windows Credential Manager 통합은 phase 2 (`wincred` npm 모듈 필요 시)

### `readCredentials()` 분기 (packages/server/src/llm/model-factory.ts)

```ts
function readCredentials(): OAuthCredentials | null {
  if (process.platform === 'darwin' && !insideContainer) {
    return readKeychainViaSecurity();   // Keychain 직통
  }
  // Linux + Windows + 컨테이너 안 → 파일 경로
  return readFromFile();
}
```

`insideContainer`는 `/proc/1/cgroup`에 `docker` 포함 여부 등으로 감지. Docker 모드(즉 `docker compose up` 레거시 path)에선 여전히 파일 fallback이 동작해야 한다.

### Platform 지원 요약

| OS | CLI 동작 | Credential | 비고 |
|---|---|---|---|
| macOS | ✓ 완전 | Keychain 직통 | 주 개발 환경 |
| Ubuntu/Linux dev | ✓ 완전 | 파일 직접 | Docker 가장 가벼움 |
| Windows dev | ⚠ 파일 fallback | `%APPDATA%` 파일 | Credential Manager는 phase 2 |

**서버 배포가 Ubuntu VM/EC2인 경우** (scope out, 후속 플랜 후보):
- `environment.ts`에 "self-hosted server" 분기 추가 필요 (`DATABASE_URL` 있으면서 Lambda/internal-api 없으면 `mode: 'production'` + credential 전략 `env:ANTHROPIC_API_KEY`)
- 한 줄 분기 수준이지만 본 설계 범위 밖

## 7. Testing 전략

### Unit (vitest)
- `ports.ts` — `get-port` mock, 충돌 시 다음 포트 선점 확인
- `postgres.ts` — `execa` mock, 컨테이너 상태별 분기 (running/stopped/missing) 검증
- `state.ts` — fs mock, 손상 파일 graceful 처리
- `orchestra.ts` — 자식 spawn + signal 전파 순서 검증
- `platform.ts` — OS별 credential path 분기 mock

### Integration
- CLI 명령 실행 → 각 서브명령이 올바른 execa 호출을 만드는지 (execa 자체는 mock, docker는 실행 안 함)

### E2E smoke (CI, Linux)
- `airops start --no-open` 백그라운드 → 포트 listen 확인 → `curl /api/health` 200 → `airops stop` → state 파일 정리 확인
- Docker 필요하므로 GitHub Actions `services: postgres` 활용하거나 docker-in-docker (optional path)

### 기존 Turbo 파이프라인 편입
- `packages/cli/` workspace에 `"test": "vitest run"` → 루트 `npm test`에 자동 포함
- `tsc --noEmit`도 기존 CI에 자연 편입

## 8. 검증 (End-to-end)

설계 완성 시점에 다음 시나리오가 동작해야 한다:

1. **첫 기동**: 빈 상태에서 `airops start` → postgres container 생성 + pg_isready 통과 + server/web ready → 대시보드 3201 URL 출력
2. **재기동**: Ctrl+C 후 `airops start` → 기존 `airops-pg` 컨테이너 재사용(데이터 유지) + server/web 새 포트로 올라옴
3. **포트 충돌**: 다른 앱이 3100 점유 중 → server가 3101로 선점
4. **Keychain 갱신**: macOS에서 Claude Code가 자동으로 refresh 해도 server가 항상 최신 토큰 사용 (파일 snapshot 안 씀)
5. **데이터 persistence**: `airops stop` → `airops start` → 이전 세션의 DB row 그대로
6. **Reset**: `airops stop --reset --yes` → 다음 `airops start`에서 빈 DB
7. **Stale 정리**: `kill -9`로 프로세스 강제 종료 후 `airops start` → stale state 자동 정리 + 정상 기동

## 9. Phase 분리 (후속 플랜 후보)

현재 spec은 v1 범위. 이후 별도 브레인스토밍/플랜으로:

- `airops query` / `airops agents` 계열 서브명령 (Q1 C 옵션)
- `--detach` + `airops logs` (백그라운드 모드)
- Windows Credential Manager 통합
- Ubuntu 서버 배포를 위한 `environment.ts` 분기
- CI 파이프라인 통합 (turbo remote cache)
