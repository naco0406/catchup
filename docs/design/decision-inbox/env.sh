# 보드 스크립트 공통: source docs/design/decision-inbox/env.sh
# 이 보드는 AI1 레포에서 만들어 CatchUp 으로 옮겼어요(2026-11-21). CatchUp 에 아직 node_modules 가 없어서
# Playwright 와 Phosphor 아이콘은 AI1 레포의 것을 빌려 써요. CatchUp 에 의존성이 생기면 이 두 줄을 바꿔요.
export SK="/Users/young/Library/Application Support/Claude/local-agent-mode-sessions/a3ea8897-25c3-4965-b90c-ee053c517a05/1446013f-2082-4201-98f6-9ce50affc0a9/rpm/plugin_01AUxSdbnttBBjdxSQesZ9Ae/skills/ui-proposal-board"
export S="$SK/scripts"
export PW="/Users/young/Desktop/Naco/Projects/AI1/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright"
export ICONS="/Users/young/Desktop/Naco/Projects/AI1/node_modules/.pnpm/@phosphor-icons+core@2.1.1/node_modules/@phosphor-icons/core/assets/regular"
