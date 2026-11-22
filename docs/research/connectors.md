# CatchUp 커넥터 조사

조사일: 2026-11-21 · 본문 대괄호 숫자 [n]은 맨 아래 "근거"의 번호예요. 1차 자료(공식 문서·공식 발표)로 확인하지 못한 내용에는 "(확인 필요)"를 붙였어요.

## 결론

카카오톡 대화를 클라우드에서 공식적으로 "읽는" 길은 지금 없어요. 카카오 공식 API는 모두 보내기용이에요 [17]. 비공식 프로토콜(LOCO)이나 PC 카톡 원격 조작은 카카오 운영정책에 정면으로 걸려요 [24]. 피클이 바로 이 길로 갔다가 하루 만에 멈췄고, 카카오는 법적 검토에 들어갔어요 [7][8]. 그래서 카카오톡은 두 갈래로 나눠서 가는 걸 제안해요. 첫째, **카카오톡을 "결정 카드가 도착하는 곳"으로 먼저 써요.** CatchUp 카카오톡 채널 챗봇과 "나에게 보내기"는 클라우드만으로 되고 위험도 낮아요 [17][18][19]. 둘째, **카카오톡을 "읽는" 일은 사용자가 고르는 보조 경로로 미뤄요.** 대화 내보내기 파일 올리기(사람 손), 그리고 안드로이드 동반 앱의 알림 읽기(기기 필요, 아이폰 불가)예요. 나머지 커넥터 중 Gmail은 서버에서 메일을 읽으려면 매년 외부 보안 심사(CASA)를 받아야 해서 몇 주가 걸려요 [41]. Slack은 마켓플레이스 등록 전에는 기록 조회가 분당 1회로 묶여요 [47]. 둘 다 일찍 신청을 시작해야 해요. 코딩 에이전트(Claude Code, Codex)는 사용자 컴퓨터에 훅 설정을 한 번 넣거나, 아예 CatchUp 클라우드 서버에서 에이전트를 돌리면 돼요 [70][71].

---

## 1. 참고 서비스

사장님이 말한 "그록봇"과 "피클"은 둘 다 실제로 있어요. 둘 다 2026년에 나온 서비스예요.

### 그록봇 (Grok Bot) — xAI(SpaceX Super Intelligence)

- **정체**: 2026-08-11 초기 베타로 나온 "AI 팀원" 서비스예요. 봇마다 클라우드 컴퓨터가 붙어서, 사용자가 자리를 비워도 일을 계속해요 [1][4].
- **연결 방식**: 공식 발표는 봇이 "사용자가 이미 쓰는 도구에 로그인해서" 앱·메일함·웹사이트를 오가며 일한다고 해요. API나 MCP가 없는 곳도 된다고 해요 [1]. 즉 **클라우드 컴퓨터 위 브라우저로 직접 로그인하는 방식**이 중심이에요. 1.0(2026-11-11)에서 Gmail·Google Calendar·GitHub 연결을 강화했고, Slack·Microsoft Teams 안에서 쓰는 팀 봇, 화상회의 참석, 브라우저 로그인 개선이 들어갔어요 [2]. X는 X API 개발자 계정을 대신 만들어 주는 방식으로 붙여요 [3].
- **메신저**: 사용자는 그록봇 전용 데스크톱·iOS 앱에서 봇에게 메시지를 보내요 [1]. 공식 발표에 카카오톡·WhatsApp·텔레그램·iMessage 연결은 없어요 [1][2].
- **요금**: SuperGrok, Cursor 일부 요금제에 포함돼요 [1]. 금액은 출처마다 달라요 (확인 필요).

### 피클 (Pickle) — Pickle, Inc.

- **정체**: 한국인 창업자가 미국에서 세운 스타트업의 AI 비서 앱이에요. Y Combinator 투자를 받았다고 보도됐어요 [7][10]. 2026-11-10 전후 국내 앱스토어 무료 생산성 1위를 했어요 [8]. 출시 시점은 앱스토어 기록(1.0이 8월 10일)과 보도(10월 14일 iOS 베타)가 서로 달라요 [6][11] (확인 필요).
- **하는 일**: 전화 대신 걸기, 쿠팡·다이소몰 주문, 식당·KTX 예약, 메일·캘린더를 보고 먼저 할 일 제안 등이에요. 결제와 예약은 사용자 승인을 받아요 [6].
- **연결 방식**: 사용자가 네이버·쿠팡·정부24 같은 서비스의 아이디와 비밀번호를 맡기면, 피클이 그 계정으로 로그인해서 일해요. 플랫폼과 사전 제휴는 없어요 [9][10]. 앱 설명에 "브라우저 작업을 실시간으로 볼 수 있다"고 나와요 [6].
- **카카오톡**: 2026-11-11에 "카톡 대화방을 읽고 메시지를 보낼 수 있다"며 열었다가 하루 만에 멈췄어요. 피클은 "연결 속도가 느려서"라고 안내했어요 [7]. 카카오는 이 구조를 "이용자가 PC 카카오톡 접속 권한을 피클에 맡기고, 피클이 원격으로 조작하는 것"으로 봤어요. 그리고 정책·법령 문제를 검토하겠다고 했어요 [8]. 피클이 직접 기술 방식을 설명한 1차 자료는 찾지 못했어요 (확인 필요). 재개 소식도 없어요 [7][8].
- **데이터**: 미국 서부 AWS에 저장하고, 대화 내용은 OpenAI·Anthropic·Google·xAI 등 해외 모델 업체로 갈 수 있다고 처리방침에 적혀 있다고 보도됐어요 [10].
- **다른 차단**: 코레일도 피클 같은 자동화 도구 접근을 막았어요. 미국 유나이티드 항공은 제3자 AI 에이전트 예약을 약관으로 금지했어요 [9].

### 함께 볼 만한 서비스

| 서비스 | 무엇과 연결 | 방식 | 근거 |
|---|---|---|---|
| Poke (The Interaction Company) | 사용자가 iMessage·WhatsApp·텔레그램·RCS로 Poke에게 말을 걺. 메일·캘린더 읽기 | 메신저는 "비서와 대화하는 창구"로만 씀. 사용자의 다른 대화는 안 읽는 것으로 보임. Apple Messages for Business 승인을 받았다고 보도됨 | [12][13] |
| Crew | 카카오톡 채널을 추가하고 웹에서 받은 6자리 코드로 짝을 지음. Gmail·캘린더 연결 | 카카오톡 채널 = 대화 창구. 카톡 대화는 안 읽음 | [15] (홍보성 글, 확인 필요) |
| 카나나 스페이스 (카카오) | 카카오톡 안의 AI 비서. 안 읽은 업무 메시지 요약, 답장 초안, 과거 대화 검색 시연 | 카카오 자체 서비스. 외부 서비스는 MCP·A2A 직접 연동과 클라우드 브라우저(CUA)를 병행. 2026-12 사전 신청자 대상 시범, 외부 에이전트 연결 공간은 2027 상반기 예정 | [22][23] |
| 뮤즈(메타)·닷츠(OpenAI) | 클라우드 컴퓨터·브라우저로 일을 이어감 | 국내 2차 보도만 확인 | [16] (확인 필요) |

**교훈**: 해외 서비스들은 메신저를 "사용자와 비서가 대화하는 창구"로 써요(Poke, Crew). 남의 대화를 읽는 쪽은 브라우저나 PC 앱을 대신 조작해요(그록봇, 피클). 피클 사례는 카카오가 두 번째 방식을 허용하지 않는다는 신호예요.

---

## 2. 카카오톡

### 경로별 표

표기: ☁️ 클라우드만 / 📱 기기에 무엇을 깔아야 함 / ✋ 사람 손이 필요함

| # | 경로 | 읽을 수 있는 것 | 답장 | 공식? | 약관·정지 위험 | 클라우드 적합 | 안정성 |
|---|---|---|---|---|---|---|---|
| A | 카카오 로그인 + 메시지 API "나에게 보내기" [17] | 없음 (읽기 API가 없어요) | 사용자 본인의 "나와의 채팅방"으로만 보냄. 횟수 제한 없음 | 공식 | 낮음 | ☁️ (처음 한 번 카카오 로그인 ✋) | 높음 |
| B | 메시지 API "친구에게 보내기" [17] | 없음 | 같은 앱을 쓰는 카톡 친구에게만. 비즈 앱 전환·심사 필요. 승인 후 발신자당 하루 100건, 같은 사람끼리 20건 | 공식 | 낮음. 단, "사용자 간 상호작용" 용도로만 써야 해서 대리 답장 용도는 심사에서 막힐 수 있어요 (확인 필요) | ☁️ | 높음 |
| C | CatchUp 카카오톡 채널 + 챗봇(카카오 i 오픈빌더 스킬) [18][19] | 사용자가 **CatchUp 채널에** 보낸 말만 | 채널 대화방 안에서 답함. 스킬은 5초 안에 답해야 하고, 길면 콜백(5분, 1회)으로 답함. 먼저 말 걸기(Event API)는 채널 친구에게만, 건당 15원, 비즈 인증 채널·앱 필요 | 공식 | 낮음. 광고성이면 시간·표기 규칙 지켜야 함 | ☁️ | 높음. LLM 챗봇 선례도 있어요(업스테이지 AskUp) [38] |
| D | PlayMCP (카카오 MCP 도구함) [20][21] | 확인된 것은 내 일정·받은 선물 등. 대화 읽기는 없어요 | "나와의 채팅방"으로 보내기 | 공식 | 낮음 | ☁️ 단, ChatGPT·Claude에 붙이는 용도로 안내돼요. CatchUp 같은 제3자 MCP 클라이언트가 써도 되는지는 (확인 필요) | 중간 (베타) |
| E | 카나나 스페이스 외부 에이전트 연결 [22][23] | 미정. 외부 에이전트가 카톡 대화에 접근할 수 있는지 발표 없음 | 미정 | 공식(예정) | — | 2027 상반기 예정 | 아직 없음 |
| F | 알림톡·비즈메시지 | 없음 | 사업자가 고객에게 보내는 정보성 메시지 | 공식 | 낮음 | ☁️ | CatchUp 용도와 안 맞아요 (확인 필요) |
| G | 안드로이드 알림 읽기 (NotificationListenerService) [27][25] | 알림에 뜨는 것만: 방 이름, 보낸 사람, 메시지 글자 [25]. 그 방을 열어 두면 알림이 안 와서 놓쳐요. 사진·파일은 안 돼요 [25] | 알림의 "답장" 버튼(RemoteInput)으로 글자 답장이 된다고 커뮤니티에서 설명해요 [25] (공식 근거는 확인 필요) | 안드로이드 공식 API. 카카오가 허용한 방식은 아님 | 중간. 카톡 운영정책은 "허용되지 않은 프로그램"과 봇·매크로 배포를 금지해요 [24]. 2021년 봇 계정 대량 정지 사례가 있는데 주로 해외 가상번호 부계정이었다고 해요 [26] (2차 자료). 알림 기록 앱(노티스타 등)은 흔히 쓰여요 [39] | 📱 안드로이드 폰에 CatchUp 앱 + 알림 접근 허용. 폰이 켜져 있어야 함. 아이폰 불가 | 중간. 카톡 알림 형식이 바뀌면 깨져요. 안드로이드 15부터 OTP 같은 민감 알림은 가려져요 [28] |
| H | 아이폰에서 다른 앱 알림 읽기 | 앱으로는 불가. 애플은 블루투스 액세서리(ANCS)에게만 알림 제목·본문을 줘요. 액션은 "예/아니오" 두 가지뿐이고 글자 답장은 없어요 [29]. 서드파티 기기로 알림 전달은 EU에서만 열렸어요 [30] | 불가 | — | — | 📱 별도 블루투스 하드웨어가 있어야 함. 한국에선 사실상 불가 | — |
| I | PC/Mac 카카오톡 화면 조작 (클라우드 윈도우 PC에 PC 카톡 띄우기 포함) | 다 읽을 수 있음 | 보낼 수 있음 | 비공식 | **높음.** 피클이 이 계열로 보도됐고 카카오가 법적 검토 중이에요 [8]. PC 로그인 때 휴대폰 인증이 필요해요 [73] | 클라우드 VM으로 할 수는 있지만, 사용자 계정 권한을 넘겨받는 구조예요. ✋ 첫 로그인 인증 | 낮음 (느리고, 화면이 바뀌면 깨짐) |
| J | LOCO 비공식 클라이언트 (node-kakao, OpenKakao, agent-kakaotalk) [31][32][33][34] | 다 읽을 수 있음 | 보낼 수 있음 | 비공식(역분석) | **가장 높음.** 운영정책이 프로토콜 부정 호출, 역분석 코드 활용, 봇 배포를 명시해서 금지하고 영구 정지까지 둬요 [24]. node-kakao는 지원이 끊겼고 README에 영구 제한 경고가 있어요 [34]. OpenKakao 문서도 "다중 사용자 SaaS용이 아니다"라고 적었어요 [32] | 클라우드에서 돌릴 수는 있음. 하지만 서비스로 남에게 제공하면 "타인에게 제공"에 해당해요 [24] | 낮음 |
| K | 대화 내보내기 파일 올리기 [35] | 과거 대화 전체 (텍스트, 또는 사진 포함) | 불가 | 공식 기능 | 없음 | ✋ 사용자가 방마다 내보내서 올려야 함. 실시간 아님 | 높음 (형식 변경 정도만) |
| L | 카카오톡 자체 AI (안 읽은 대화 요약, ChatGPT in 카카오톡, 카나나 인 카카오톡) [36][37] | 카카오 안에서만 | — | 공식 | — | 외부에 데이터를 주지 않아요. CatchUp이 가져다 쓸 수 없어요 | — |

### 추천 순위

1. **먼저 만들 것 — C + A: "카톡으로 결정 카드 받기"** ☁️
   - CatchUp 카카오톡 채널을 만들고, 결정 카드를 채널 메시지로 보내요. 사용자는 채널 대화방에서 버튼을 눌러 고르면 돼요.
   - 급한 알림은 "나에게 보내기"로 보낼 수도 있어요. 이건 비용도 없고 횟수 제한도 없어요 [17].
   - 사용자가 카톡에서 본 내용을 채널에 붙여 넣으면 CatchUp이 받아서 카드로 만들어요. 메시지 "전달" 기능으로 채널 방에 바로 보낼 수 있는지는 확인하지 못했어요 (확인 필요).
   - 카카오톡을 "읽지"는 못하지만, 한국 사용자가 매일 여는 곳에 카드가 도착해요. 사장님 목표와 가장 잘 맞고 위험이 없어요.
2. **보조로 만들 것 — K: 대화 내보내기 올리기** ✋
   - 단톡방 따라잡기("밀린 단톡 정리") 같은 일회성 쓰임에 좋아요. 위험이 없어요.
3. **선택형 베타 — G: 안드로이드 동반 앱** 📱
   - 안드로이드 사용자만, 본인이 켜는 경우에만 써요. 폰은 알림 글자를 클라우드로 보내기만 하고, 판단은 클라우드에서 해요. 사용자가 카드에서 답을 고르면 폰이 알림의 답장 버튼으로 보내요.
   - 시작 전에 법률 검토를 받아야 해요. 운영정책 해석 여지가 있어요 [24].
4. **문 두드릴 것 — E, D: 카카오 공식 협력**
   - 카나나 스페이스 외부 에이전트 공간(2027 상반기)과 PlayMCP에 파트너로 들어갈 수 있는지 카카오에 문의해요 [22][20].
5. **하지 말 것 — I, J**
   - PC 카톡 원격 조작과 LOCO 클라이언트는 하지 마세요. 사용자 계정이 영구 정지될 수 있고, 카카오가 피클에 법적 대응을 검토하고 있어요 [8][24].

---

## 3. 나머지 커넥터

표기는 위와 같아요: ☁️ 클라우드만 / 📱 기기 필요 / ✋ 사람 손 필요

| 서비스 | 경로 | 읽기 | 답장·쓰기 | 공식? | 약관·심사 위험 | 클라우드 적합 | 근거 |
|---|---|---|---|---|---|---|---|
| Claude Code | 사용자 PC의 훅 설정 | 알림, 권한 요청, 작업 끝남 이벤트 | 됨. `http` 타입 훅이 이벤트를 CatchUp 서버로 보내고, 응답으로 허용/거부를 돌려줄 수 있어요 (PermissionRequest) | 공식 | 낮음 | 📱 사용자 PC 설정 파일에 훅 한 번 추가 (프로그램 설치는 필요 없음) | [70] |
| Claude Code | CatchUp 서버에서 에이전트 실행 | 전부 | 전부 | 공식 (Agent SDK) | 구독/키 사용 조건 확인 필요 | ☁️ | [70] (확인 필요) |
| Codex | 사용자 PC의 훅 + notify | PermissionRequest, Stop 등. notify는 "턴 끝남"만 | PermissionRequest 훅이 허용/거부 가능. 핸들러는 command·mcp_tool만 돼서 작은 스크립트가 필요해요 | 공식 | 낮음 | 📱 작은 스크립트 + 설정 | [71] |
| Codex | app-server (JSON-RPC) | 전부 | 승인 요청을 서버가 받아서 처리 | 공식 | 낮음 | ☁️ (클라우드에서 Codex를 돌릴 때) | [71] |
| Gmail | Gmail API + OAuth | 됨. `gmail.readonly` 등은 **제한(restricted) 범위**예요 [40] | 됨 | 공식 | 서버에서 읽으면 **매년 외부 보안 심사(CASA)** 필수. 검증에 "몇 주" 걸려요 [41]. 비용은 업체 블로그 기준 대략 $500~$5,400 (확인 필요) [43]. 사용자 데이터로 일반 AI 모델 학습 금지, "생성형 AI 요약"은 허용된 쓰임으로 명시 [42] | ☁️ 새 메일은 Pub/Sub 푸시로 받아요. watch는 7일마다 갱신 [46] | [40][41][42][46] |
| Gmail (우회) | 사용자가 CatchUp 주소로 자동 전달 설정 | 전달된 메일 | `gmail.send`로 보내기 (제한 목록에 없어 민감 범위로 보임, 확인 필요) | 공식 기능 | 낮음 | ☁️ + ✋ 전달 설정 한 번 | [40] |
| Google Calendar | Calendar API + OAuth | 됨 | 됨 | 공식 | **민감(sensitive) 범위**라 구글 검증은 필요하지만 보안 심사는 없어요. 보통 3~5영업일 [44][45] | ☁️ | [44][45] |
| Outlook / Microsoft 365 (메일·캘린더) | Microsoft Graph + OAuth | 됨 | 됨 | 공식 | 보안 심사 없음. 다른 조직 사용자 동의를 받으려면 **게시자 확인(무료)**이 사실상 필요해요 [49]. 회사 계정은 관리자가 막을 수 있어요 | ☁️ | [49] |
| Slack | Slack 앱 (Events API + Web API) | 됨. 실시간 이벤트는 받을 수 있어요. 단, 마켓플레이스에 없는 상용 앱은 `conversations.history/replies`가 **분당 1회, 15건**으로 묶여요 [47] | 됨 | 공식 | API 데이터로 LLM 학습 금지, 대량 내보내기 금지, 보관 최소화 [48]. 상용 배포는 마켓플레이스가 정식 경로 [47] | ☁️ | [47][48] |
| Microsoft Teams | Graph (Chat.Read 등) | 됨. 전체 채팅을 앱 권한으로 읽으려면 관리자 동의 필요 | 위임 권한으로 보내기 | 공식 | 회사 관리자 승인 벽이 높아요 | ☁️ | [50] |
| Discord | 봇 계정 | 봇이 들어간 서버와 봇과의 DM만 | 됨 | 공식 | 일반 사용자 계정 자동화(셀프봇)는 금지, 계정 해지 사유 [51] | ☁️ | [51] |
| Telegram | 비즈니스 봇 연결 | **사용자의 개인 대화를 읽을 수 있어요.** 사용자가 고른 대화(기존/새 대화, 연락처 등) | 됨. 사용자 대신 답장, 읽음 표시 등 권한 범위 안에서. 받는 쪽엔 봇이 보냈다고 표시돼요 | 공식 | 낮음. Premium 필요 없음. 계정당 봇 1개 [52] | ☁️ | [52] |
| Telegram | 사용자 API (MTProto, 자체 api_id) | 전부 | 전부 | 공식 API지만 | 사용자 몰래 하는 행동 금지. 비공식 클라이언트 로그인은 자동 감시 대상 [53] | ☁️ + ✋ 로그인 코드 | [53] |
| WhatsApp | Business Platform (Cloud API) | 사업자 번호로 온 메시지만 | 됨 | 공식 | **2026-01-15부터 범용 AI 비서는 금지** [14]. CatchUp은 여기에 해당할 가능성이 커요 | ☁️ | [14] |
| WhatsApp | 새 "Agents" 기능 (베타) | 에이전트와의 1:1 대화만. 다른 대화는 못 읽는 것으로 보도 | 됨 | 공식(베타) | 일부 국가 베타. 한국 포함 여부 모름 (확인 필요) | ☁️ | [54][55] |
| WhatsApp | 개인 계정 비공식 클라이언트 | 전부 | 전부 | 비공식 | 일시·영구 정지 명시 [54] | — | [54] |
| LINE | Messaging API (공식 계정) | 공식 계정으로 온 메시지만 | 됨 | 공식 | 낮음 | ☁️ | [56] |
| Instagram DM | Instagram API (Instagram 로그인) | **프로페셔널 계정**으로 온 DM만. 상대가 먼저 보내야 하고, 그룹 DM 불가 | 24시간 안에만 (사람 상담 태그는 7일) | 공식 | 남의 계정을 다루려면 Advanced Access 필요 [57] | ☁️ | [57] |
| Facebook Messenger | Messenger Platform | 페이지로 온 메시지만 | 됨 | 공식 | 개인 메신저 불가 (확인 필요) | ☁️ | [58] |
| LinkedIn | Messages API | 일반 개발자는 불가 | 승인 파트너만, 그것도 사용자가 직접 보내기를 누른 경우만 | 공식(제한) | **승인된 파트너만** 쓸 수 있다고 명시 [59] | — | [59] |
| X (트위터) DM | X API | 됨. DM 이벤트 읽기 1건 $0.010 | 보내기 1건 $0.015 | 공식 | 사용량 과금 [60] | ☁️ | [60] |
| iMessage / 문자 | 공개 API 없음. 맥 중계(BlueBubbles 등) | 맥에 로그인된 대화 | 됨 | 비공식 | 애플 약관 위험 (확인 필요) | 📱 항상 켜진 맥 + Messages 로그인 [61] | [61] |
| Notion | Notion API + 웹훅 | 페이지 변경, 댓글 생성 등 | 됨 | 공식 | 낮음 | ☁️ | [62] |
| Notion Calendar | 공개 API 못 찾음 | — | — | — | — | Google·Outlook 캘린더를 직접 연결하면 같은 일정이 와요 (확인 필요) | — |
| GitHub | GitHub App + 웹훅 | 이슈, PR, 리뷰 요청 등 | 됨 | 공식 | 낮음 | ☁️ | [64] (확인 필요) |
| Linear | OAuth 앱 + 웹훅 | 이슈·댓글·프로젝트 변경 | 됨 | 공식 | 낮음. 웹훅 생성엔 admin 범위 필요 | ☁️ | [63] |
| Jira | Atlassian OAuth 2.0 + 웹훅 | 됨 | 됨 | 공식 | 낮음 | ☁️ | [64] (확인 필요) |
| 네이버 메일 | IMAP/SMTP | 됨 | 됨 | 공식 프로토콜 (OAuth 없음) | 2025년부터 2단계 인증 + 애플리케이션 비밀번호가 필요하다고 해요 [65] (2차 자료). 앱 비밀번호를 서버에 보관해야 해요 | ☁️ + ✋ 사용자가 IMAP 켜고 앱 비밀번호 만들어 붙여 넣기 | [65] |
| 다음(카카오) 메일 | IMAP/SMTP | 됨 | 됨 | 공식 프로토콜 | 2025-01부터 카카오계정 2단계 인증 + 앱 비밀번호 필요하다고 해요 [67] (2차 자료). 서버 주소는 imap.kakao.com으로 안내돼요 (확인 필요) | ☁️ + ✋ 같은 방식 | [67] |
| 네이버웍스 | NAVER WORKS API 2.0 (봇, OAuth) | 봇에게 온 메시지. 메일·캘린더 API 범위는 커뮤니티 자료만 있어요 | 됨 | 공식 | 회사 관리자 승인 필요 (확인 필요) | ☁️ | [66] |
| 잔디 | 웹훅 (들어오는/나가는) | 나가는 웹훅은 **특정 단어로 시작하는 메시지만**, 유료 요금제만, 팀당 10개 | 들어오는 웹훅으로 글 올리기 | 공식 | 낮음. 메시지를 일반적으로 읽는 공개 API는 못 찾았어요 | ☁️ | [68] |
| 채널톡 | Open API + 웹훅 | 회사의 고객 상담·팀 채팅 메시지 | 됨 | 공식 | 낮음. 회사(관리자)용이에요 | ☁️ | [69] |
| Apple 캘린더 (iCloud) | CalDAV | 됨 | 됨 | 공식 프로토콜 | 앱 전용 암호를 서버에 보관해야 해요 | ☁️ + ✋ 사용자가 앱 전용 암호 발급 | [72] (확인 필요) |

---

## 4. 제안하는 순서

사장님 순서(코딩 에이전트 → Gmail·캘린더 → Slack → 기타)는 그대로 둬요. 카카오톡은 "출구"와 "입구"로 나눠서 넣어요.

1. **코딩 에이전트 (Claude Code, Codex)**
   - Claude Code는 `http` 훅으로 권한 요청을 CatchUp 서버에 보내고, 카드에서 고른 답을 응답으로 돌려줘요 [70]. 사용자 PC엔 설정만 넣어요 📱.
   - Codex는 PermissionRequest 훅에 작은 스크립트가 필요해요 [71] 📱.
   - "모두 클라우드" 원칙에 맞추려면, CatchUp 개인 서버에서 에이전트를 직접 돌리는 모드도 같이 준비해요 ☁️.
2. **카카오톡 출구 (채널 챗봇 + 나에게 보내기)** — 1번과 같이, 늦어도 2번과 같이 해요.
   - 클라우드만으로 되고 위험이 낮아요 [17][18]. 결정 카드가 카톡에 도착하는 경험을 일찍 만들 수 있어요.
   - 비즈니스 인증 채널·앱과 월렛이 필요하니 준비를 바로 시작해요 [18].
3. **Gmail + Google Calendar**
   - 캘린더는 민감 범위라 검증이 며칠이면 돼요 [44].
   - Gmail은 CASA 심사를 **지금 신청 준비**해요. 그 사이에는 테스트 사용자 한도 안에서 베타를 돌리거나 [41], 자동 전달 방식으로 먼저 받아요.
4. **Slack**
   - 상용 배포면 마켓플레이스 등록을 처음부터 목표로 해요. 안 하면 기록 조회가 분당 1회예요 [47].
   - 실시간 이벤트로 받고, 데이터는 오래 보관하지 않게 설계해요 [48].
5. **카카오톡 입구 (보조)**
   - 대화 내보내기 올리기 ✋ 먼저.
   - 안드로이드 동반 앱(알림 읽기) 📱은 법률 검토 뒤 선택형 베타로.
   - 카카오 파트너십(카나나 스페이스, PlayMCP) 문의는 지금부터 병행해요 [22][20].
6. **그다음 공식 API가 좋은 것들** ☁️: Outlook/M365, Notion, GitHub, Linear, Jira, 텔레그램 비즈니스 봇, 채널톡, 네이버웍스.
7. **사람 손이 필요한 메일·캘린더** ☁️+✋: 네이버 메일, 다음 메일, iCloud 캘린더 (앱 비밀번호 붙여 넣기).
8. **제한이 큰 것**: 인스타그램·메신저(비즈니스 계정만), X DM(유료), Teams(관리자 승인).
9. **보류**: LinkedIn 메시지(파트너만), WhatsApp 개인 계정(비공식은 정지), iMessage(맥 필요), 카카오톡 LOCO·PC 원격 조작(금지).

---

## 5. 확인하지 못한 것

- 피클이 카카오톡에 붙은 실제 기술 방식. 카카오 측 설명("PC 카톡 원격 조작")만 있고 피클의 1차 설명은 없어요. 출시일도 출처마다 달라요.
- 피클 카톡 연동 재개 여부, 카카오 법적 검토 결과.
- 카나나 스페이스의 외부 에이전트가 카톡 대화를 읽을 수 있는지. 2027 상반기 공개 예정이라는 것만 있어요.
- PlayMCP를 ChatGPT·Claude가 아닌 제3자 서비스(CatchUp)의 MCP 클라이언트에서 써도 되는지, 조건과 약관.
- 카톡 메시지를 CatchUp 채널 대화방으로 바로 "전달"할 수 있는지.
- 카톡 알림의 답장 버튼(RemoteInput)으로 보내기가 지금 버전에서도 되는지 공식 근거. 카카오가 알림 읽기 앱을 제재한 사례가 있는지(가상번호 부계정 정지 외).
- 구글 플레이가 알림 접근 권한 앱에 별도 신고를 요구하는지.
- CASA 실제 비용과 등급. 업체 블로그 수치뿐이에요.
- Slack 기존 설치 앱에도 분당 1회 제한이 적용됐다는 날짜(2026-03-03). 2차 자료만 있어요.
- Notion Calendar 공개 API 유무, 네이버웍스 메일 API 공식 범위, 잔디 메시지 조회 API 유무.
- PC 카카오톡 동시 로그인 기기 수.
- 그록봇 정확한 요금과 전체 커넥터 목록(공식 문서 페이지 미확인).
- WhatsApp Agents 기능의 한국 제공 여부.
- Claude Agent SDK를 개인 구독으로 서버에서 돌려도 되는지(조건 확인 필요).

---

## 6. 근거

1. xAI, Introducing Grok Bot — https://x.ai/news/introducing-grok-bot
2. xAI, Grok Bot 1.0 — https://x.ai/news/grok-bot-1-0
3. xAI, Grok Bot and X — https://x.ai/news/grok-bot-and-x
4. 디지털데일리, 그록 봇 출시 — https://www.ddaily.co.kr/page/view/2026081209091378647
5. Unite.AI, xAI Launches Grok Bot — https://www.unite.ai/xai-launches-grok-bot-always-on-ai-teammates-with-their-own-cloud-computers/
6. App Store, 피클: 나만의 AI 에이전트 — https://apps.apple.com/kr/app/%ED%94%BC%ED%81%B4-%EB%82%98%EB%A7%8C%EC%9D%98-ai-%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8/id6795790129
7. 서울신문, 피클 카톡 연동했다 중단 — https://www.seoul.co.kr/news/economy/industry/2026/11/12/20261112500344
8. 인사이트코리아, 카카오 법적 검토 — https://www.insightkorea.co.kr/news/articleView.html?idxno=258792
9. 테크42, 피클은 막히고 유나이티드는 금지했다 — https://www.tech42.co.kr/%ED%94%BC%ED%81%B4%EC%9D%80-%EB%A7%89%ED%9E%88%EA%B3%A0-%EC%9C%A0%EB%82%98%EC%9D%B4%ED%8B%B0%EB%93%9C%EB%8A%94-%EA%B8%88%EC%A7%80%ED%96%88%EB%8B%A4%EB%82%B4-%EB%8C%80%EC%8B%A0/
10. 시대일보, 피클 개인정보는 해외로 — https://www.sidae.com/article/2026111612161278314
11. 서플(한겨레 인용), 한국형 AI 비서 3파전 — https://supple.kr/news/cmwkgc8xqrhtpjkunfcf0rsya
12. Poke Docs — https://poke.com/docs
13. AppleInsider, First AI agent for Messages business chat approved by Apple — https://appleinsider.com/articles/26/06/04/first-ai-agent-for-messages-business-chat-approved-by-apple (페이지 직접 열람 실패, 검색 요약만 확인 · 확인 필요)
14. TechCrunch, WhatsApp bars general-purpose chatbots — https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform
15. MyIP 게시판, Crew 소개 — https://myip.co.kr/board/read.php?id=1712&table=tip
16. 메트로서울, 뮤즈·닷츠·그록봇 — https://www.metroseoul.co.kr/article/20261001500469
17. Kakao Developers, 카카오톡 메시지 API 이해하기 — https://developers.kakao.com/docs/ko/kakaotalk-message/common
18. 카카오 비즈니스 가이드, Event API — https://kakaobusiness.gitbook.io/main/tool/chatbot/main_notions/event-api
19. 카카오 비즈니스 가이드, AI 챗봇 콜백 개발 가이드 — https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/ai_chatbot_callback_guide
20. 다음 뉴스, 카카오 PlayMCP 대폭 업그레이드 (2025-11-24) — https://v.daum.net/v/20251124100838407
21. 위키독스, 카카오 MCP 연결법 (PlayMCP 게이트웨이 주소) — https://wikidocs.net/461910
22. 아이티데일리, 카카오톡에 직접 만든 AI 에이전트 연결…내년 상반기 공개 — https://www.itdaily.kr/news/articleView.html?idxno=242144
23. 디지털데일리, 카나나 스페이스 외부 연동 확대…브라우저 제어 병행 — https://www.ddaily.co.kr/page/view/2026110509160100452
24. 카카오 톡세이프티, 카카오톡이 허용하지 않는 방법에 의한 서비스 이용 — https://talksafety.kakao.com/policy/stability/abnormalusage
25. 카카오톡 봇 제작기 (구동 원리: 알림 리스너 + WearableExtender 답장) — https://mintyu.github.io/KakaoBot_1/
26. 나무위키, 카카오톡 봇 (2차 자료) — https://namu.wiki/w/%EC%B9%B4%EC%B9%B4%EC%98%A4%ED%86%A1%20%EB%B4%87
27. Android Developers, NotificationListenerService — https://developer.android.com/reference/android/service/notification/NotificationListenerService
28. Android Authority, Android 15 sensitive notifications — https://www.androidauthority.com/android-15-sensitive-notifications-3416414
29. Apple, Apple Notification Center Service (ANCS) Specification — https://developer.apple.com/library/archive/documentation/CoreBluetooth/Reference/AppleNotificationCenterServiceSpecification/Introduction/Introduction.html
30. MacRumors, iOS 26.3 Notification Forwarding (EU) — https://www.macrumors.com/2025/12/15/ios-26-3-notification-forwarding/
31. GeekNews, OpenKakao beta — https://news.hada.io/topic?id=27307
32. OpenKakao Docs, Limitations — https://openkakao.vercel.app/docs/overview/limitations
33. skills.sh, agent-kakaotalk — https://www.skills.sh/devxoul/agent-messenger/agent-kakaotalk
34. node-kakao (storycraft) 프로젝트 정보 — https://awesome.ecosyste.ms/projects/github.com%2Fstorycraft%2Fnode-kakao
35. 카카오 고객센터, 대화 내용을 저장하고 싶어요 — https://cs.kakao.com/helps_html/1073209354?locale=ko
36. 다음 뉴스, 카카오톡 '안읽음' 대화 AI 요약 도입 — https://v.daum.net/v/20251026140050653
37. 카카오, AI로 새로워지는 카카오톡 — https://kakaotalk-ai.kakao.com/
38. 뉴시스, 카톡 '아숙업' 써보니 — https://www.newsis.com/view/NISX20230310_0002222625
39. 익스트림 매뉴얼, 카카오톡 삭제된 메시지 보는 법 (알림 기록 앱) — https://extrememanual.net/28176
40. Google Cloud 도움말, 제한된 범위 목록 — https://support.google.com/cloud/answer/13464325
41. Google, Restricted scope verification — https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
42. Google, Workspace API User Data and Developer Policy — https://developers.google.com/workspace/workspace-api-user-data-developer-policy
43. CASA 비용(업체 블로그) — https://www.switchlabs.dev/post/casa-tier-2-tier-3-security-review-providers-pricing-and-the-cheapest-option , https://www.secusy.ai/blog/google-casa-assessment-cost
44. Google, Sensitive scope verification — https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
45. Nylas, Google verification and security assessment guide — https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide/
46. Google, Gmail push notifications — https://developers.google.com/workspace/gmail/api/guides/push
47. Slack, Rate limit changes for non-Marketplace apps (2025-05-29) — https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps
48. Slack, API Terms of Service (2025-10-10) — https://slack.com/terms-of-service/api
49. Microsoft, Publisher verification overview — https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview
50. Microsoft Graph, Teams 채팅 메시지 변경 알림 / 권한 참조 — https://learn.microsoft.com/en-us/graph/teams-changenotifications-chatmessage , https://learn.microsoft.com/en-us/graph/permissions-reference
51. Discord, Automated user accounts (self-bots) — https://support.discord.com/hc/articles/115002192352
52. Telegram, Connected business bots — https://core.telegram.org/api/bots/connected-business-bots
53. Telegram, API Terms of Service — https://core.telegram.org/api/terms
54. WhatsApp FAQ, About unofficial apps — https://faq.whatsapp.com/1217634902127718
55. 9to5Mac, WhatsApp third-party AI agents beta — https://9to5mac.com/2026/09/07/whatsapp-will-soon-let-users-chat-with-up-to-five-third-party-ai-agents/
56. LINE Developers, Messaging API overview — https://developers.line.biz/en/docs/messaging-api/overview/
57. Meta, Instagram Messaging API — https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
58. Meta, Messenger Platform — https://developers.facebook.com/docs/messenger-platform (직접 열람 안 함 · 확인 필요)
59. LinkedIn, Messages API — https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages
60. X, API Pricing — https://docs.x.com/x-api/getting-started/pricing
61. Hermes Agent Docs, BlueBubbles (맥 필요) — https://hermes-agent.nousresearch.com/docs/user-guide/messaging/bluebubbles
62. Notion, Webhooks — https://developers.notion.com/reference/webhooks
63. Linear, Webhooks — https://linear.app/developers/webhooks
64. GitHub Webhooks / Jira Webhooks (직접 열람 안 함 · 확인 필요) — https://docs.github.com/en/webhooks , https://developer.atlassian.com/cloud/jira/platform/webhooks/
65. 네이버 메일 IMAP·앱 비밀번호 (2차 자료) — https://wikidocs.net/344488 , https://extrememanual.net/60679
66. NAVER Cloud, NAVER WORKS 연동 (API 2.0) — https://guide.ncloud-docs.com/docs/en/chatbot-chatbot-5-5
67. 다음 메일 IMAP·2단계 인증 (2차 자료) — https://yellowit.co.kr/it-review/%eb%8b%a4%ec%9d%8c-%ed%95%9c%eb%a9%94%ec%9d%bc-%ec%b9%b4%ec%b9%b4%ec%98%a4%ea%b3%84%ec%a0%95-%ed%86%b5%ed%95%a9-imap-pop3-%ec%99%b8%eb%b6%80%eb%a9%94%ec%9d%bc-%ea%b0%80%ec%a0%b8%ec%98%a4%ea%b8%b0/
68. JANDI, Outgoing / Incoming Webhook — https://support.jandi.com/en/articles/connect-outgoing-webhook-2fb99ca7 , https://support.jandi.com/en/articles/connect-incoming-webhook-21bc249f
69. Channel Developers, Webhook events / 채널 캠퍼스 Open API — https://developers.channel.io/docs/webhook-events , https://docs.channel.io/channelcampus/ko/articles/Open-API-3f0a4dbc
70. Claude Code, Hooks — https://code.claude.com/docs/en/hooks
71. Codex, Hooks / Advanced config (notify) / App Server — https://learn.chatgpt.com/docs/hooks , https://learn.chatgpt.com/docs/config-file/config-advanced , https://developers.openai.com/codex/app-server
72. Apple, 앱 전용 암호 (직접 열람 안 함 · 확인 필요) — https://support.apple.com/en-us/102654
73. 카카오 고객센터, PC 버전 로그인 — https://cs.kakao.com/helps_html/767907336?locale=ko
