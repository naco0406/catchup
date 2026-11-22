import type { Messages } from './en';

// 화면 문구(한국어). 카드 글은 data/cards.ko.ts 에 있어요.
export const ko: Messages = {
  nav: { catchup: '캐치업', fyi: '알려만 드려요', snoozed: '미뤄 둔 것', activity: '처리 기록' },
  side: { working: '비서가 하는 일', incoming: '들어오는 곳 · 밤사이', settings: '설정', user: '한지우', initials: '지우', menu: '메뉴', close: '닫기' },
  lang: { label: '언어' },
  proto: { label: '프로토타입', more: '카드 더 받기', reset: '처음부터 다시', note: '예시 자료예요. 아무것도 보내지 않아요.' },
  top: { list: '목록으로 보기', deck: '카드로 보기', search: '카드 찾기', searchPh: '사람 · 곳 · 질문으로 찾기', open: '정할 것', none: '맞는 카드가 없어요.', decideNow: '지금 정하기', of: '{{total}}개 중 {{n}}번째', allDone: '{{total}}개를 모두 정했어요', doneSplit: '정한 것 {{decided}} · 미룬 것 {{snoozed}}', undo: '되돌리기', progress: '카드' },
  card: {
    edit: '고치기', editDone: '완료', edited: '고쳤어요', mic: '음성', micStop: '받아쓰기 멈추기', listening: '듣고 있어요…',
    suggested: '추천', ifPick: '{{n}}번을 고르면 {{to}} 님께 이렇게 보내요', ifPickCopy: '{{n}}번을 고르면 답장을 복사해 드려요',
    codeIf: '{{n}}번을 고르면 이렇게 바꿔요', files_one: '파일 {{count}}개', files_other: '파일 {{count}}개', riskWord: '위험', command: '실행하려는 명령', confirm: '한 번 더 누르면 실행해요', confirmHint: '위험한 선택이에요. 한 번 더 누르면 진행해요.',
    composer: '다르게 답하기 — 비서에게 말로 알려 주세요', composerShort: '다르게 답하기', more: '더 말하기', send: '보내기',
    firstOptions: '처음 선택지 {{n}}개 — {{list}}', risky: '이런 카드는 밀어서 넘길 수 없고, 시간이 지나도 저절로 정해지지 않아요.', riskyNoSwipe: '이런 카드는 시간이 지나도 저절로 정해지지 않아요.', snooze: '미루기', myself: '내가 직접 할게요', myselfShort: '내가 직접',
    auto: '앞으로 이런 건 알아서', autoShort: '앞으로 알아서', autoToast: '같은 답이 다섯 번 쌓이면 맡길지 여쭤볼게요.', swipe: '왼쪽으로 밀면 미뤄요', options: '답',
  },
  generic: { reply: '알겠어요. 말씀하신 대로 선택지를 만들어 봤어요.', work: '남기신 말을 읽었어요', asSaid: '말씀하신 대로 답해요', asSaidDone: '말한 대로 답했어요: “{{text}}”' },
  toast: { runsSend: '{{s}}초 뒤에 보내요', runsCopy: '{{s}}초 뒤에 복사해요', runsDo: '{{s}}초 뒤에 실행해요', ran: '보냈어요', copied: '답장을 복사했어요. {{to}}에 붙여 넣으면 돼요.', snoozed: '오후 2시에 다시 올려요', handed: '직접 하실 일로 남겨 뒀어요', undone: '되돌렸어요. 아무것도 나가지 않았어요.' },
  done: { title: '다 봤어요', sub: '결정 {{decided}}개를 {{time}} 만에 끝냈고, {{snoozed}}개는 미뤄 뒀어요.', subNone: '결정 {{decided}}개를 {{time}} 만에 끝냈어요.', subSnoozedOnly: '{{snoozed}}개를 모두 미뤄 뒀어요. 오후 2시에 다시 올려요.', sub2: '새로 정할 일이 생기면 알림으로 알려 드릴게요.', auto: '그동안 비서가 알아서 한 일', all: '모두 보기', left: '남은 것', fyi_one: '알려만 드릴 일 {{count}}개', fyi_other: '알려만 드릴 일 {{count}}개', fyiSub: '출시 일정 확정 · 밤 배포 결과 · AWS 청구 예상액 …', snoozed: '미뤄 둔 것 {{n}}개', snoozedSub: '오후 2시에 다시 올려요', skim: '훑어보기', view: '지금 보기', more: '카드 더 받기' },
  first: { title: '무엇을 대신 봐 드릴까요?', sub: '연결한 곳에 들어오는 것을 비서가 먼저 읽고, 정할 일만 카드로 올려요.', connected: '연결했어요', connect: '연결', addChannel: '채널 추가', promise: '처음에는 아무것도 알아서 하지 않아요. 전부 물어보고, 같은 답이 쌓이면 맡길지 여쭤볼게요.', start: '캐치업 시작하기',
    rows: { gmail: ['Gmail', 'jiwoo@hanbit.studio'], calendar: ['Google 캘린더', '캘린더 3개'], slack: ['Slack', '나를 부른 글과 개인 메시지만 읽어요'], agents: ['Claude Code · Codex', '에이전트가 물어볼 때와 승인이 필요할 때 카드로 올려요'], kakao: ['카카오톡', '대화는 읽을 수 없어요. 채널을 추가하면 카드를 카톡으로 받아요'] } },
  fyi: { title: '알려만 드려요', sub_one: '알아 둘 일 {{count}}개 · 정할 것은 없어요', sub_other: '알아 둘 일 {{count}}개 · 정할 것은 없어요', section: '밤사이', promote: '카드로', promoted: '카드로 올렸어요', empty: '없어요.', promoteQ: '이 소식에 할 일이 있을까요?', promoteOk: '확인했다고 표시해요', promoteOkDetail: '아무것도 보내지 않아요', promoteOkDone: '확인했다고 표시했어요: {{title}}', promoteLater: '나중에 볼게요', promoteLaterDetail: '오후에 다시 올려요', promoteLaterDone: '나중에 보기로 했어요: {{title}}' },
  snoozed: { title: '미뤄 둔 것', sub_one: '{{count}}개', sub_other: '{{count}}개', back: '지금 보기', empty: '미뤄 둔 것이 없어요. 미룬 카드는 여기에 모여요.', at: '오후 2시에 다시 올려요' },
  log: { pending: '곧 보내요 — 아직 되돌릴 수 있어요', edited: '초안을 고쳤어요', title: '처리 기록', today: '오늘', count: '오늘 {{n}}개', all: '모두', mine: '내가 정한 것', auto: '비서가 한 것', byMe: '내가 정했어요', subSnoozed: '내가 미뤘어요', subHanded: '내가 맡았어요', suggested: '추천대로', inWords: '말로 다르게 답했어요', snoozed: '미뤘어요: {{q}}', handed: '직접 하기로 했어요: {{q}}', undo: '되돌리기', undone: '되돌렸어요', routines: '알아서 해도 되는 범위', routinesSub: '내 답에서 배운 것 3개 · 내가 정한 것 1개', empty: '오늘은 아직 없어요.' },
  src: { gmail: 'Gmail', calendar: '캘린더', slack: 'Slack', kakao: '카카오톡', github: 'GitHub', claude: 'Claude Code', codex: 'Codex' },
};
