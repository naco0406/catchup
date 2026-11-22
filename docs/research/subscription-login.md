# 사용자 본인 AI 구독으로 로그인해 에이전트 돌리기: 허용 여부 조사

- 조사일: 2026-11-21
- 범위: Anthropic(Claude Pro/Max/Ultra), OpenAI(ChatGPT Plus/Pro, Codex), Google(Gemini) 간단히
- 이 문서는 사실과 선택지만 정리해요. 어떤 방식으로 갈지는 정하지 않아요.
- 인용은 공식 문서·약관에서 짧게(15단어 이하) 가져왔어요. 공식 출처로 확인하지 못한 내용은 "(확인 필요)"로 표시했어요.

## 결론

**Anthropic: 제3자 제품이 "Claude 구독으로 로그인"을 제공하는 건 사전 승인 없이는 안 돼요.**
Agent SDK 문서와 Claude Code 법무 페이지 둘 다 같은 말을 해요. 제3자 앱에 claude.ai 로그인을 넣거나, 사용자 대신 Pro/Max/Ultra 자격증명으로 요청을 보내면 안 돼요. Claude.ai 자격증명이나 세션 토큰을 모으거나 저장하거나 중계하는 것도 안 돼요. CatchUp이 Agent SDK로 직접 만든 에이전트를 사용자 구독으로 돌리는 건 이 금지에 정면으로 걸려요.
예외가 하나 있어요. 플랫폼이 **수정하지 않은 Claude Code 바이너리**를 호스팅하고, 사용자가 **Anthropic 자체 로그인 흐름으로 직접** 자기 구독에 로그인하는 건 문서상 막지 않아요. 다만 Commercial Terms 동의, 바이너리 무수정, 사용자 대신 결제·재판매·중계 금지라는 조건이 붙어요. 그리고 2026년 4월부터 "제3자 하네스" 사용분은 구독 한도가 아니라 별도 extra usage에서 깎일 수 있어요. CatchUp 같은 호스팅이 여기에 들어가는지는 문서에 없어요(확인 필요).
새로 생긴 공식 경로가 있어요. 2026년 11월 베타인 **Linked billing**은 사용자가 자기 Claude Console 조직을 CatchUp 앱에 연결해 API 요금을 Anthropic에 직접 내는 방식이에요. 다만 **구독만 있는 계정은 쓸 수 없어요**(API 결제 조직이 따로 있어야 해요).

**OpenAI: 공식 프로그램("Sign in with ChatGPT", SIWC)이 있지만, CatchUp 같은 유료·원격 호스팅 서비스는 선정된 파트너만 써요.**
SIWC는 사용자가 ChatGPT 계정으로 로그인하고 자기 플랜 사용량으로 앱의 AI 요청을 처리하게 해요(Go/Plus/Pro/Business). 하지만 상용 앱에는 "선정된 상용 파트너" 대상 제한 체험으로만 열려 있고, 유료·원격 호스팅 앱은 관심 신청서(interest form)를 내야 해요. SIWC 약관(2026-11-04 시행)은 요청이 "사용자 로컬 런타임이나 그 사용자만 제어하는 원격 런타임"에서 나와야 하고, 토큰은 "로컬이면서 사용자 통제 하에" 저장돼야 한다고 해요. CatchUp 서버에 토큰을 보관하는 구조가 이 조건을 맞출 수 있는지는 불분명해요(확인 필요).
SIWC 없이 Codex CLI의 ChatGPT 로그인(auth.json 복사, app-server 인증)을 CatchUp 클라우드에서 쓰는 건 문서가 명시적으로 막아요. app-server 문서에 "상용·호스팅 서비스에는 허용된 적이 없다"고 쓰여 있어요.

**Google: 안 돼요.**
Gemini CLI의 Google 로그인을 제3자 소프트웨어로 쓰는 건 약관 위반이고 계정 정지 사유라고 공식 문서에 적혀 있어요. 게다가 2026-06-18부터 Gemini CLI는 개인 계정(Google AI Pro/Ultra/무료)에 서비스를 끊고 Antigravity CLI로 옮겼어요. API 키(유료 Gemini API, Agent Platform)만 남아 있어요.

## Anthropic

| 방식 | 허용? | 근거 (URL + 짧은 인용) | 비고 |
|---|---|---|---|
| CatchUp 앱에 "Claude로 로그인" 버튼을 넣고 사용자 구독으로 Agent SDK 에이전트 실행 | 안 돼요 (사전 승인 시 예외) | code.claude.com/docs/en/agent-sdk/overview — "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login" | 같은 문장에 "rate limits"도 포함돼요. 대신 API 키 인증을 쓰라고 해요. |
| 사용자에게 OAuth 토큰(`claude setup-token` 결과 등)을 받아 CatchUp 서버에 저장하고 대신 요청 | 안 돼요 | code.claude.com/docs/en/legal-and-compliance — "developers may not collect, store, or intermediate Claude.ai credentials or session tokens" | "sign-in to a Claude account must complete through Anthropic's own flow"라는 문장도 있어요. |
| 사용자 구독 자격증명으로 사용자 대신 요청 라우팅 | 안 돼요 | 같은 페이지 — "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications" | 이어서 Free/Pro/Max/Ultra 자격증명으로 "on behalf of their users" 라우팅도 금지해요. |
| 수정 안 한 Claude Code 바이너리를 CatchUp 샌드박스에 설치하고, 사용자가 Anthropic 로그인 흐름으로 직접 자기 구독에 로그인 | 문서상 막지 않아요 (조건부) | 같은 페이지 — "signing in to the unmodified Claude Code binary with their own Claude subscription" | 조건: Commercial Terms 동의, "The Claude Code binary must not be modified.", 로그인 방법 제거·제한 금지, "Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf." Claude Code 이름·로고를 제품명에 쓰면 안 돼요. |
| 위 방식의 사용량이 구독 한도에서 나가는지 | 불분명해요 (확인 필요) | 같은 페이지 — "Advertised usage limits for Pro, Max, and Ultra plans assume ordinary, individual usage" / support.claude.com/en/articles/13189465 — "allow paid subscribers who have enabled usage credits to use certain third-party tools" | 2026-04-04부터 OpenClaw 등 "제3자 하네스"는 구독 한도 대신 extra usage로 과금돼요(TechCrunch 보도, Boris Cherny 게시글). 호스팅된 공식 Claude Code가 "제3자 하네스"로 취급되는지는 공식 문서에 없어요. |
| 사용자가 직접 `claude setup-token`으로 토큰을 만들어 자기 CI·스크립트에 사용 | 돼요 (본인 사용) | code.claude.com/docs/en/authentication — "Use this for CI pipelines and scripts where browser login isn't available." | 1년짜리 토큰이에요. 모델 요청만 가능하고 Remote Control·claude.ai 커넥터는 안 돼요. 이 토큰을 CatchUp에 넘기면 위 "수집·저장 금지"에 걸려요. |
| GitHub Actions에서 사용자 구독 토큰으로 Claude Code 실행 | 돼요 (본인 저장소, 본인 토큰) | code.claude.com/docs/en/github-actions — "an OAuth token is tied to the subscription of the person who ran `claude setup-token`" | 사용자가 자기 저장소 secret에 직접 넣어요. 실행되면 구독 사용량을 써요. |
| Claude Code 클라우드 세션(claude.ai/code) | 돼요 (사용자가 직접) | code.claude.com/docs/en/claude-code-on-the-web — "It counts toward your plan's usage limits" | Pro/Max/Ultra/Team 등. Anthropic이 VM을 운영해요. VM 비용은 따로 없어요. |
| 클라우드 예약 작업(구 routines)의 API 트리거를 CatchUp이 호출 | 문서상 가능, 단 본인 계정 기능 (확인 필요) | code.claude.com/docs/en/routines — "sending an HTTP POST to the task's own endpoint with a bearer token" | 사용자가 claude.ai에서 작업을 만들고 토큰을 발급해요. 연구 프리뷰이고, 작업당 시간당 30회 제한, 구독 사용량을 써요. 제3자 서비스가 이 토큰을 보관·호출해도 되는지는 문서에 없어요. |
| Linked billing: 사용자가 자기 Claude Console 조직을 CatchUp 앱에 연결 | 돼요 (베타) | platform.claude.com/docs/en/manage-claude/oauth-apps/organization-billing-connections — "pay for the Claude usage in your app through their own Claude organization" | 구독만 있는 조직은 안 돼요: "The same is true of organizations that have only a Claude subscription plan." Max/Ultra에 딸린 월 API 크레딧도 이 방식에선 안 써져요. 앱 공개 전 Anthropic 심사가 있을 수 있어요. 사용자가 앱별 월 지출 한도를 정해요. |
| 사전 승인·파트너 신청 | 공개 신청 절차 못 찾았어요 (확인 필요) | 같은 법무 페이지 — 인증 방식 문의는 "contact sales"로 안내 | 공개 파트너 목록이나 신청서는 못 찾았어요. OpenCode가 2026년 10월 승인을 받았다는 주장이 있지만 Anthropic 공식 확인은 없어요(확인 필요). |
| 소비자 약관(Consumer Terms) | 자동 접근은 원칙적으로 금지 | anthropic.com/legal/consumer-terms (시행 2025-10-08) — "봇(bot), 스크립트(script) 또는 기타 방식을 통해 자동화된 또는 비인간적인 방식" | 예외: "Anthropic API 키를 통해 … 접속하거나 당사가 이를 명시적으로 허용하는 경우". 계정 자격증명 공유도 금지해요. |

**집행 기록**
- 2026-01: OpenCode, Cline, RooCode 등이 Claude Code처럼 위장해 구독 OAuth를 쓰던 걸 서버에서 막았다는 보도가 있어요(2차 보도, 확인 필요).
- 2026-02: 법무 문서에 "Authentication and credential use" 절이 생기고 OpenCode가 Claude OAuth 코드를 뺐다는 보도가 있어요(2차 보도, 확인 필요). 현재 법무 페이지에는 그 절이 실제로 있어요.
- 2026-04-04: 구독 한도로 OpenClaw 같은 제3자 하네스를 쓰는 걸 끝냈어요. extra usage 묶음이나 API 키로 쓰라고 안내했어요(TechCrunch, Boris Cherny Threads 게시글).
- 법무 페이지: "Anthropic reserves the right to take measures to enforce these restrictions"이고, 사전 통지 없이 할 수 있다고 해요.

## OpenAI

| 방식 | 허용? | 근거 (URL + 짧은 인용) | 비고 |
|---|---|---|---|
| Sign in with ChatGPT(SIWC) + ChatGPT 플랜 사용량, 상용 앱 | 선정된 파트너만 돼요 | developers.openai.com/siwc/request-client-id — "Sign in with ChatGPT is currently offered to a select group of commercial partners." | 대기 명단·관심 신청서로 들어가요. 웹사이트·플러그인용 페이지는 "OpenAI 담당자에게 연락"하라고 해요. |
| SIWC, 유료·원격 호스팅 앱 | 신청 필요 | developers.openai.com/siwc/token-sharing-open-source — "offering it in a paid or remotely hosted app, complete the interest form" | 오픈소스·로컬 호스팅 앱은 문서만 보고 바로 쓸 수 있어요. CatchUp은 유료·원격 호스팅에 해당해요. |
| SIWC 약관상 실행 위치 | 사용자만 제어하는 런타임 | openai.com/policies/sign-in-with-chatgpt-terms (시행 2026-11-04) — "originate from the user's local runtime or a remote runtime only that user controls" | CatchUp의 "사용자별 클라우드 서버"가 "그 사용자만 제어하는 원격 런타임"으로 인정되는지는 불분명해요(확인 필요). |
| SIWC 토큰을 CatchUp 서버에 영구 저장 | 안 될 가능성이 커요 | 같은 약관 — "Any persistent storage of Authentication Tokens must be local and under the user's control" | 약관은 "remote or managed environment" 저장을 제외한다고 해요. 파트너 계약으로 달라질 수 있는지는 확인 필요. |
| SIWC 사용자에게 플랜 사용 대가로 요금 부과 | 안 돼요 | 같은 약관 — "Users must be able to use their ChatGPT plan through SIWC without paying you" | 앱 자체 요금은 따로 받을 수 있어요("the app may have its own fees", learn.chatgpt.com). 사용량 공유·재판매·토큰 공유도 금지예요. |
| SIWC로 쓸 수 있는 기능 범위 | 제한 있어요 | developers.openai.com/siwc/token-sharing-open-source/preview-limitations.md — "Your app must refresh the OAuth token." | Responses API 일부만 돼요. 호스팅 MCP/커넥터, 파일 검색, Code Interpreter 등은 안 돼요. Codex app-server는 셸·MCP 도구 실행이 돼요. |
| SIWC 사용량 계산 | 플랜 한도에서 차감 | learn.chatgpt.com/docs/sign-in-with-chatgpt.md — "App usage counts toward your existing plan limits." | 사용자가 앱별 상한을 정해요. 대상: Go/Plus/Pro/Business(help.openai.com/en/articles/20001542). 한국 제공 여부는 문서에 없어요(확인 필요). |
| Codex CLI ChatGPT 로그인을 CatchUp 클라우드에서 대신 운영 (auth.json 복사, app-server 인증) | 안 돼요 | learn.chatgpt.com/docs/app-server — "App-server authentication has never been permitted for commercial or hosted services." | 로컬·오픈소스 앱은 계속 쓸 수 있지만 SIWC로 옮기라고 권해요. 외부 토큰 모드(`chatgptAuthTokens`)는 실험 기능이에요. |
| 사용자가 자기 원격 머신에서 Codex CLI에 ChatGPT 로그인 | 돼요 (본인 사용) | learn.chatgpt.com/docs/auth — "prefer device code authentication (beta)" | 원격·헤드리스 환경용이에요. "Treat `~/.codex/auth.json` like a password"라고 해요. |
| Codex를 API 키로 실행 (`codex login --api-key`) | 돼요 | learn.chatgpt.com/docs/auth — "When you sign in with an API key, Codex uses standard API pricing" | CI 같은 자동화엔 API 키를 쓰라고 해요. |
| ChatGPT 이용약관 | 계정 공유·자동 추출 금지 | openai.com/policies/terms-of-use (시행 2026-01-01) — "may not share your account credentials or make your account available to anyone else" | "Automatically or programmatically extract data or Output"도 금지 항목이에요. |
| CatchUp을 ChatGPT·Codex 안의 플러그인(구 Apps SDK)으로 배포 | 돼요 (심사 후) | developers.openai.com/plugins — "Build an MCP server for ChatGPT and Codex, with optional UI in ChatGPT." | MCP 서버 + 스킬 묶음이에요. 디렉터리 심사가 있어요. 모델 호출은 사용자가 ChatGPT 안에서 하므로 사용자 플랜으로 돌아가는 구조예요. 이 점을 문서가 명시하진 않아요(확인 필요). |

**참고**
- SIWC 신원 로그인은 2026년 7월 말부터 Airtable, GitLab, HubSpot, Notion, Supabase, Vercel 등으로 시작했다는 릴리스 노트 요약이 있어요(원문 미열람, 확인 필요).
- 플랜 사용량 공유는 DevDay 2026(2026-09-29)에 약 16개 파트너(Devin 등)로 발표됐다는 2차 보도가 있어요(확인 필요). learn.chatgpt.com 도움말에 Devin이 실제로 언급돼 있어요.
- 자체 VM 이전 가이드는 "Host-specific usage attribution and revocation … are not yet available"이라고 해요.

## Google Gemini (간단히)

| 방식 | 허용? | 근거 (URL + 짧은 인용) | 비고 |
|---|---|---|---|
| Gemini CLI Google 로그인을 제3자 소프트웨어로 사용 | 안 돼요 | github.com/google-gemini/gemini-cli/blob/main/docs/resources/tos-privacy.md — "Such actions may be grounds for suspension or termination of your account." | OpenClaw을 예로 들어요. |
| 집행 | 강화됐어요 | github.com/google-gemini/gemini-cli/discussions/22970 (2026-03-18) — "using Gemini CLI oAuth with third-party software" | 탐지를 강화한다고 했어요. 2026년 2월부터 대량 정지 보도가 있어요(2차, 확인 필요). |
| 개인 구독(Google AI Pro/Ultra)으로 Gemini CLI 사용 | 2026-06-18부터 끝났어요 | developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ — "Gemini CLI will remain accessible via paid Gemini and Gemini Enterprise Agent Platform API keys." | 개인 계정은 Antigravity CLI로 옮겼어요. Antigravity CLI를 제3자가 호스팅해도 되는지는 못 찾았어요(확인 필요). |

## 대안 (선택하지 않아요)

| 대안 | 무엇이 허용되나 | 비용 | UX | 위험 |
|---|---|---|---|---|
| (a) BYOK: 사용자가 자기 API 키를 붙여 넣음 | Anthropic·OpenAI·Google 모두 API 키 사용은 문서상 정식 경로예요. 단 Anthropic 소비자 약관은 API 키 공유를 금지하므로, 키 보관 방식은 Commercial Terms 기준으로 따로 봐야 해요(확인 필요). | CatchUp 모델 비용 0. 사용자는 구독과 별도로 종량제 요금을 내요. | 일반 소비자에게 "API 키 발급"은 어려워요. 한국 소비자 대상이면 이탈이 클 수 있어요. | 키 유출 책임이 CatchUp에 생겨요. 키를 안전하게 보관해야 해요. |
| (a') Anthropic Linked billing | 베타로 공식 지원돼요. 사용자가 Console 조직을 앱에 연결하고 월 한도를 정해요. | CatchUp 모델 비용 0. 사용자는 API 정가로 Anthropic에 직접 내요. 구독·월 API 크레딧은 안 써져요. | 키 복사 없이 OAuth 연결이에요. 하지만 사용자가 Console 조직과 결제 수단을 따로 가져야 해요. | 베타라 바뀔 수 있어요. 앱 공개 전 Anthropic 심사가 있을 수 있어요. Anthropic 전용이에요. |
| (b) CatchUp이 API 비용을 내고 사용자에게 과금 | 모든 공급사에서 정식 경로예요. Claude Code를 제품에 넣을 땐 법무 페이지 조건(재판매·중계 금지)을 따로 확인해야 해요. Agent SDK 직접 사용은 Commercial Terms 적용이에요. | 모델 비용이 CatchUp 원가가 돼요. 요금제·사용량 상한 설계가 필요해요. | 가장 단순해요. 가입만 하면 돼요. | 헤비 유저 원가 폭주. "Claude Code를 넣고 CatchUp이 대신 결제"는 법무 페이지가 막는 것으로 읽혀요("Customers may not pay for … Claude usage"). 이 경우 Claude Code 대신 Agent SDK·API를 직접 써야 할 수 있어요(확인 필요). |
| (c) Anthropic·OpenAI 승인·파트너십 신청 | Anthropic: "previously approved" 예외가 있지만 공개 신청 절차는 못 찾았어요(영업팀 문의). OpenAI: SIWC 관심 신청서로 들어가요. | 사용자 구독으로 돌리면 CatchUp 모델 비용이 줄어요. | 원하던 "내 구독으로 로그인" UX에 가장 가까워요. | 승인 여부·시점을 알 수 없어요. 승인돼도 SIWC는 토큰 로컬 저장·실행 위치 조건이 있어요. 기능 제약(Responses API 일부)이 있어요. |
| (d) 사용자가 공식 에이전트를 직접 돌리고 CatchUp은 공식 통로로만 연결 | Claude: 클라우드 세션, GitHub Actions, 예약 작업 API 트리거, 수정 안 한 Claude Code에 사용자가 직접 로그인. OpenAI: Codex 클라우드, 사용자 본인 머신의 Codex CLI. | 사용자 구독 사용량을 써요. CatchUp 모델 비용 0. | 사용자가 GitHub 연결, 토큰 발급, 설정을 해야 해요. 이메일 분류처럼 코딩이 아닌 일엔 맞지 않을 수 있어요. | 호스팅 Claude Code가 2026-04 이후 "제3자 하네스"로 취급돼 extra usage로 빠질 수 있어요(확인 필요). 예약 작업은 연구 프리뷰예요. |
| (e) CatchUp을 ChatGPT·Claude 안의 앱으로 배포 (ChatGPT 플러그인, Claude 커넥터/MCP App) | 둘 다 공개 심사 경로가 있어요. Claude 커넥터는 유료 플랜 누구나 제출 가능, OAuth 2.0 필요. ChatGPT 플러그인은 디렉터리 심사가 있어요. | 모델 호출은 사용자가 공식 앱 안에서 하므로 사용자 구독으로 처리돼요. CatchUp은 MCP 서버 운영비만 내요. | 사용자는 ChatGPT·Claude 앱 안에서 CatchUp을 불러야 해요. 백그라운드 자동 분류(사용자가 대화하지 않을 때)는 어려워요. | 공급사 UI·정책에 묶여요. CatchUp 자체 화면(결정 카드)이 공식 앱 안으로 들어가야 해요. 심사 지연 사례가 있어요(포럼 보고). |

## 소유자에게 물을 것

1. **에이전트가 돌아가는 곳을 어디로 둘까요?**
   - A. CatchUp 클라우드에서 직접 돌림 (API 키·Linked billing·CatchUp 결제 중 하나 필요)
   - B. 공급사 공식 환경에서 돌림 (Claude Code 클라우드, Codex 클라우드, ChatGPT·Claude 앱 안) — 사용자 구독을 쓸 수 있지만 CatchUp 통제가 줄어요
   - C. 둘 다 (코딩 에이전트는 B, 메일 분류는 A 등)
2. **모델 비용은 누가 낼까요?**
   - A. 사용자 (BYOK 또는 Anthropic Linked billing)
   - B. CatchUp이 내고 요금제로 회수
   - C. 사용자 구독 (공식 승인·파트너십이 나올 때까지는 B나 A로 시작)
3. **Anthropic 영업팀과 OpenAI SIWC 신청을 지금 넣을까요?**
   - A. 둘 다 신청
   - B. OpenAI SIWC만 (공개 신청 경로가 있음)
   - C. 신청하지 않음
4. **"수정 안 한 Claude Code를 CatchUp 샌드박스에 두고 사용자가 직접 로그인" 방식을 후보로 둘까요?**
   - A. 후보로 두고 Anthropic에 extra usage 처리 여부를 먼저 문의
   - B. 후보에서 뺌 (제3자 하네스 과금·정책 변동 위험)

## 확인하지 못한 것

- Anthropic "사전 승인(previously approved)"의 공개 신청 절차와 기준. 법무 페이지는 영업팀 문의만 안내해요.
- CatchUp이 수정 안 한 Claude Code를 호스팅하고 사용자가 직접 로그인할 때, 그 사용량이 구독 한도에서 나가는지, 2026-04-04 정책의 "제3자 하네스"로 분류돼 extra usage로 빠지는지.
- 예약 작업(routines) API 트리거 토큰을 제3자 서비스가 보관·호출해도 되는지.
- Anthropic Commercial Terms 본문의 관련 조항(재판매·중계). 이번엔 Claude Code 법무 페이지 기준으로만 봤어요.
- Linked billing 문서 뒷부분(약 2만 자)을 다 읽지 못했어요. 지출 한도 세부, 심사 기준은 원문에서 다시 봐야 해요.
- SIWC에서 "그 사용자만 제어하는 원격 런타임"의 정의. 사용자별로 격리된 CatchUp 클라우드 서버가 해당되는지.
- SIWC 상용 파트너 계약이 약관(토큰 로컬 저장 등)과 다른 조건을 줄 수 있는지.
- SIWC·Codex 플랜 사용량 공유의 한국 제공 여부.
- ChatGPT 플러그인·Claude 커넥터 안에서 모델 호출이 사용자 플랜 사용량으로 처리된다는 명시 문구.
- 2026-01 서버 차단, 2026-02 정책 갱신, OpenCode 승인 주장 같은 날짜·세부는 2차 보도만 봤어요.
- Antigravity CLI의 제3자 호스팅 허용 여부.

## 근거 URL

Anthropic
- https://code.claude.com/docs/en/agent-sdk/overview
- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/authentication
- https://code.claude.com/docs/en/github-actions
- https://code.claude.com/docs/en/claude-code-on-the-web
- https://code.claude.com/docs/en/routines
- https://www.anthropic.com/legal/consumer-terms
- https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account
- https://platform.claude.com/docs/en/manage-claude/oauth-apps/organization-billing-connections
- https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers
- https://claude.com/docs/connectors/building/submission
- 보도: https://techcrunch.com/2026/04/04/anthropic-says-claude-code-subscribers-will-need-to-pay-extra-for-openclaw-support/
- 보도: https://www.threads.com/@boris_cherny/post/DWsAWeND5nm/
- 보도(2차, 확인 필요): https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/

OpenAI
- https://developers.openai.com/siwc
- https://developers.openai.com/siwc/request-client-id
- https://developers.openai.com/siwc/website
- https://developers.openai.com/siwc/chatgpt-plugin
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations.md
- https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms.md
- https://openai.com/policies/sign-in-with-chatgpt-terms/
- https://openai.com/policies/terms-of-use/
- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/auth
- https://learn.chatgpt.com/docs/sign-in-with-chatgpt.md
- https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites
- https://developers.openai.com/plugins

Google
- https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/tos-privacy.md
- https://github.com/google-gemini/gemini-cli/discussions/22970
- https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
