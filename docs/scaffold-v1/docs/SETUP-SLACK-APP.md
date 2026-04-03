# Slack App 설정 가이드

## 1. Slack App 생성

1. https://api.slack.com/apps → "Create New App"
2. "From an app manifest" 선택
3. 워크스페이스 선택 → 아래 manifest 붙여넣기

## 2. App Manifest

```yaml
display_information:
  name: Airflux
  description: Airflux 데이터 분석 AI 에이전트
  background_color: "#1a1a2e"

features:
  app_home:
    home_tab_enabled: true
    messages_tab_enabled: true
  bot_user:
    display_name: Airflux
    always_online: true
  slash_commands:
    - command: /airflux
      url: <GATEWAY_URL>
      description: Airflux 데이터 분석
      usage_hint: "[질문] 또는 help"

oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - channels:history
      - channels:read
      - chat:write
      - commands
      - files:write
      - groups:history
      - groups:read
      - im:history
      - im:read
      - im:write
      - mpim:history
      - mpim:read
      - reactions:read
      - reactions:write
      - users:read
      - users.profile:read
      - usergroups:read
      - files:read

settings:
  event_subscriptions:
    request_url: <GATEWAY_URL>
    bot_events:
      - app_home_opened
      - app_mention
      - message.im
      - message.mpim
  interactivity:
    is_enabled: true
    request_url: <GATEWAY_URL>
  org_deploy_enabled: false
  socket_mode_enabled: false
```

## 3. URL 설정

`npx sst dev` 또는 `npx sst deploy` 후 출력되는 Gateway URL을:
- Slash Command URL
- Event Subscriptions Request URL
- Interactivity Request URL

세 곳에 모두 동일하게 설정합니다.

## 4. Bot Token 저장

"OAuth & Permissions" → "Bot User OAuth Token" (`xoxb-...`)을 복사하여:

```bash
aws secretsmanager create-secret \
  --name airflux/dev/slack-bot-token \
  --secret-string '{"bot_user_oauth_token": "xoxb-YOUR-TOKEN"}'
```

## 5. Signing Secret 저장

"Basic Information" → "Signing Secret"을 복사하여:

```bash
aws secretsmanager create-secret \
  --name airflux/dev/slack-signing-secret \
  --secret-string '{"signing_secret": "YOUR-SECRET"}'
```

## 6. 테스트

Slack에서:
```
/airflux help
@airflux DAU 알려줘
```
