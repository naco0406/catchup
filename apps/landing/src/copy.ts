// 소개 페이지의 모든 글. 영어를 먼저 고치고, 같은 자리의 한국어를 옮겨요.
// 두 언어가 같은 타입(Copy)이라 한쪽에만 있는 글은 타입 검사에서 걸려요.
// 'Try it' 안의 화면은 실제 앱이라, 그 글은 apps/web/src/locales 와 apps/web/src/data 에서 고쳐요.

export type Lang = 'en' | 'ko';
export type Shot = 'cal' | 'code' | 'risk' | 'words' | 'fyi' | 'fail' | 'log' | 'phone';
type Moment = { id: string; tab: string; shot: Shot; alt: string; title: string; body: string; facts: [string, string] };
type Row = { name: string; does: string };

export type Copy = {
  title: string;
  description: string;
  nav: { try: string; how: string; cards: string; trust: string; connect: string; faq: string; menu: string; other: string; otherLabel: string; action: string };
  hero: { title: [string, string]; lede: string; action: string; note: string };
  try: {
    title: string; lede: string; frame: string;
    keys: { pick: string; take: string; snooze: string; mine: string; undo: string };
    hint: string; reset: string; open: string; phone: string; phoneAlt: string;
  };
  how: {
    title: string; lede: string;
    figures: { in: string; inLabel: string; inSub: string; out: string; outLabel: string; outSub: string; each: string; eachLabel: string; eachSub: string };
    steps: { title: string; body: string }[];
    sources: string[];
    note: string;
  };
  cards: { title: string; lede: string; list: string; moments: Moment[]; action: string };
  trust: { title: string; lede: string; promises: { icon: 'shield' | 'undo' | 'lock' | 'mail'; title: string; body: string }[]; logAlt: string; logTitle: string; logBody: string };
  connect: {
    title: string; lede: string; when: string; service: string; does: string;
    groups: { label: string; rows: Row[] }[];
    phoneTitle: string; phoneBody: string; phoneNext: string;
  };
  faq: { title: string; items: { q: string; a: string }[] };
  end: { title: string; lede: string; action: string; open: string; shotAlt: string };
  foot: { note: string; rights: string };
};

const en: Copy = {
  title: 'CatchUp: only the decisions, as cards',
  description: 'CatchUp reads your email, chats, calendar and coding agents first, and turns only what needs your decision into a card.',
  nav: { try: 'Try it', how: 'How it works', cards: 'Cards', trust: 'Trust', connect: 'Integrations', faq: 'Questions', menu: 'Sections', other: '한국어', otherLabel: 'Read this page in Korean', action: 'Try it' },
  hero: {
    title: ['It reads everything.', 'You answer the cards.'],
    lede: 'CatchUp reads mail, chats and coding agents, and brings back only decisions.',
    action: 'Try the prototype',
    note: 'In development. Web first, then iPhone and iPad.',
  },
  try: {
    title: 'Answer a few cards right here.',
    lede: 'This is the actual web app, running on sample cards. Answer, undo, snooze, or reply in your own words. Nothing leaves this page.',
    frame: 'CatchUp prototype',
    keys: { pick: 'Pick by number', take: 'Take the suggestion', snooze: 'Snooze', mine: 'Do it myself', undo: 'Undo' },
    hint: 'Click inside first to use the keyboard.',
    reset: 'Start over',
    open: 'Open in a new tab',
    phone: 'On a phone, it opens in a new tab. Same prototype.',
    phoneAlt: 'The CatchUp deck on a phone: a card asks about a rebrand quote, with three answers',
  },
  how: {
    title: 'A lot comes in. Very little of it needs you.',
    lede: 'Instead of opening your inbox, Slack, group chats and calendar one by one, let CatchUp read them first and bring back only what’s waiting on you.',
    figures: {
      in: '140', inLabel: 'came in overnight', inSub: '41 emails, 63 Slack messages, 5 invites, 5 agent updates …',
      out: '7', outLabel: 'need you', outSub: 'The rest was handled, or folded into one FYI digest.',
      each: '10 sec', eachLabel: 'per card', eachSub: 'One question, three lines of context, a few options. No need to open the original.',
    },
    steps: [
      { title: 'It reads first', body: 'Everything from the places you connect, grouped by conversation. It runs in the cloud, so it keeps working while your devices are off.' },
      { title: 'It sorts into three', body: 'Handled, FYI, or needs you. When in doubt, it asks. A missed decision costs more than an extra card.' },
      { title: 'It asks with a card', body: 'Answer with a number, or say what you want instead.' },
    ],
    sources: ['Gmail', 'Slack', 'Calendar', 'Claude Code', 'Codex', 'KakaoTalk channel'],
    note: 'Numbers are from the sample cards.',
  },
  cards: {
    title: 'Same card, wherever it came from.',
    lede: 'An email reply, a calendar clash, an agent asking for approval: each one is a question with a few answers.',
    list: 'Card types',
    moments: [
      { id: 'calendar', tab: 'Calendar clash', shot: 'cal', alt: 'A card showing two meetings that overlap on Thursday at 3, laid out on a slice of the day, with three ways to fix it',
        title: 'Suggestions come with the facts checked', body: 'It looks at everyone’s calendar before it suggests a time.',
        facts: ['New events are marked as new', 'Updated invites go out only after you choose'] },
      { id: 'agents', tab: 'Coding agents', shot: 'code', alt: 'Claude Code asking where payment retries should happen, with the code change it would make, file by file',
        title: 'Less time with your agents waiting on you', body: 'Claude Code and Codex run in your own space in the cloud. You only hear from them when they have a question or need approval, and they pick up the moment you answer.',
        facts: ['You see the change before you answer', 'One card per question, not per message'] },
      { id: 'risky', tab: 'Risky approval', shot: 'risk', alt: 'Codex asking to run a command on the production database, marked as risky',
        title: 'Risky actions never decide themselves', body: 'Production data, money and anything irreversible can’t be swiped away or time out. You confirm twice.',
        facts: ['Risk is labeled with an icon and a word', 'The suggestion is always the safe option'] },
      { id: 'words', tab: 'Answer in words', shot: 'words', alt: 'After the user says they have a wedding on Saturday, the assistant checks the calendar and comes back with new options',
        title: 'Not what you want? Say so.', body: 'Tell it “I have a wedding on Saturday” and it checks your calendar and comes back with new options. You still finish with one number.',
        facts: ['The first options stay, folded', 'Where it can’t send for you, it copies the reply'] },
      { id: 'fyi', tab: 'FYI', shot: 'fyi', alt: 'The FYI deck: news worth knowing, with nothing to decide',
        title: 'News you don’t need to act on, in one place', body: 'Release dates, deploy results, billing estimates. Worth knowing, nothing to decide.',
        facts: ['Promote anything to a card in one tap', 'Your corrections improve the sorting'] },
      { id: 'fails', tab: 'When it fails', shot: 'fail', alt: 'A card saying the VAT files didn’t go out, with ways to fix it',
        title: 'Failures come back as questions', body: 'No bare error messages. You get what went wrong, where things stand, and ways to fix it.',
        facts: ['One broken connection doesn’t stop the others', 'It says clearly that nothing went out'] },
    ],
    action: 'Try these in the prototype',
  },
  trust: {
    title: 'At first, it does nothing on its own.',
    lede: 'You decide what to hand over. Everything it does is logged, and anything reversible can be undone.',
    promises: [
      { icon: 'shield', title: 'It asks about everything', body: 'After you give the same answer five times, it asks whether to handle it from now on.' },
      { icon: 'undo', title: 'Ten seconds to undo', body: 'Replies, invites and comments wait ten seconds before they go out.' },
      { icon: 'lock', title: 'Money always asks', body: 'Payments, production data and irreversible actions are rules you can’t turn off.' },
      { icon: 'mail', title: 'Emails don’t give orders', body: 'Text from outside is something to summarize, never an instruction to follow.' },
    ],
    logAlt: 'The activity log: what it did today with an undo on each line, and what it can handle on its own, each with a switch',
    logTitle: 'Your decisions and its actions, side by side',
    logBody: 'The activity log shows what happened, when, and under which rule. Turn auto-handling on or off from the same place.',
  },
  connect: {
    title: 'Coding agents first, then one at a time.',
    lede: 'We only connect through official, permitted APIs, and we say plainly what works and what doesn’t.',
    when: 'When', service: 'Service', does: 'What it does',
    groups: [
      { label: 'From day one', rows: [
        { name: 'Codex', does: 'Questions and approvals' }, { name: 'Claude Code', does: 'Questions and approvals' },
        { name: 'Gmail', does: 'Read and reply' }, { name: 'Google Calendar', does: 'Accept and reschedule' } ] },
      { label: 'Next', rows: [
        { name: 'Slack', does: 'Mentions and replies' }, { name: 'KakaoTalk channel', does: 'Get cards, paste in chats' },
        { name: 'GitHub', does: 'Review requests' }, { name: 'Telegram', does: 'Chats and replies' } ] },
      { label: 'Later', rows: [
        { name: 'Outlook and Microsoft 365', does: 'Mail and calendar' }, { name: 'Naver and Daum Mail', does: 'Read and reply' },
        { name: 'Notion, Linear and Jira', does: 'Comments and changes' }, { name: 'Instagram and X', does: 'Business messages' } ] },
    ],
    phoneTitle: 'Urgent ones end on the lock screen',
    phoneBody: 'Only cards someone is waiting on, or that are due today, send a notification. Long-press to answer in place. Risky ones open the app.',
    phoneNext: 'Web first, then iPhone and iPad apps.',
  },
  faq: {
    title: 'Questions',
    items: [
      { q: 'Does it read my KakaoTalk chats?', a: 'No. KakaoTalk has no official way to read chats, so we don’t. Add the CatchUp KakaoTalk channel to get your cards there, and paste in any conversation you want sorted.' },
      { q: 'Does it work while my devices are off?', a: 'Yes. The assistant runs in your own space in the cloud. Your cards will be waiting when you’re back.' },
      { q: 'Will it send replies without asking?', a: 'Not at first. It only does what you choose, and anything outgoing waits ten seconds so you can undo it. It offers to take over only after the same answer keeps coming up.' },
      { q: 'Is my data kept apart from other people’s?', a: 'Every person gets a separate space in the cloud, with their data and connections encrypted under their own key.' },
      { q: 'When can I try it?', a: 'We’re building it now. The web app comes first, then iPhone and iPad. In English and Korean.' },
    ],
  },
  end: {
    title: 'Let CatchUp read what piled up today.',
    lede: 'Only the decisions, as cards. Coming soon.',
    action: 'Try the prototype',
    open: 'Open in a new tab',
    shotAlt: 'The deck on a phone, the first card of the morning',
  },
  foot: { note: 'Screens are from the prototype running on sample cards. Names and numbers are examples.', rights: '© 2026 CatchUp' },
};

const ko: Copy = {
  title: 'CatchUp: 정할 것만 카드로',
  description: '메일, 메신저, 일정, 코딩 에이전트에서 들어오는 것을 CatchUp이 먼저 읽고, 내가 정할 것만 카드 한 장으로 올려요.',
  nav: { try: '눌러 보기', how: '어떻게', cards: '카드', trust: '안심', connect: '연결', faq: '묻고 답하기', menu: '차례', other: 'English', otherLabel: '이 페이지를 영어로 보기', action: '눌러 보기' },
  hero: {
    title: ['들어오는 건 비서가 다 읽고,', '나는 카드에 답만 해요'],
    lede: '메일, 메신저, 코딩 에이전트를 CatchUp이 먼저 읽고, 정할 것만 가져와요.',
    action: '프로토타입 써 보기',
    note: '만들고 있어요. 웹이 먼저, 아이폰과 아이패드는 그다음이에요.',
  },
  try: {
    title: '여기서 카드 몇 장에 답해 보세요',
    lede: '예시 카드로 돌아가는 실제 웹 앱이에요. 카드에 답하고, 되돌리고, 미루고, 말로 다르게 답해 보세요. 아무것도 밖으로 나가지 않아요.',
    frame: 'CatchUp 프로토타입',
    keys: { pick: '번호로 고르기', take: '추천대로', snooze: '미루기', mine: '내가 직접', undo: '되돌리기' },
    hint: '키보드는 화면 안을 한 번 누른 뒤에 써요.',
    reset: '처음부터 다시',
    open: '새 탭에서 열기',
    phone: '휴대폰에서는 새 탭에서 열어요. 같은 프로토타입이에요.',
    phoneAlt: '휴대폰의 CatchUp 덱. 리브랜딩 견적을 묻는 카드에 답이 셋 있어요',
  },
  how: {
    title: '들어오는 건 많아도, 내가 정할 건 몇 개 안 돼요',
    lede: '메일함, 슬랙, 단톡방, 캘린더를 하나씩 여는 대신, CatchUp이 먼저 다 읽고 내 답을 기다리는 것만 가져와요.',
    figures: {
      in: '140', inLabel: '밤사이 들어온 것', inSub: '메일 41, 슬랙 63, 초대 5, 코딩 에이전트 5 …',
      out: '7', outLabel: '내가 정할 것', outSub: '나머지는 처리했거나, 알아 두면 될 묶음으로 모았어요.',
      each: '10초', eachLabel: '카드 한 장에', eachSub: '질문 하나, 맥락 세 줄, 선택지 몇 개. 원문은 안 열어도 돼요.',
    },
    steps: [
      { title: '먼저 읽어요', body: '연결한 곳에 들어오는 걸 모두 읽고, 같은 대화끼리 묶어요. 클라우드에서 돌아서 내 기기가 꺼져 있어도 계속 읽어요.' },
      { title: '셋으로 갈라요', body: '처리했어요, 알아 두세요, 물어봐요. 애매하면 물어보는 쪽으로 보내요. 놓친 결정이 카드 한 장보다 비싸니까요.' },
      { title: '카드로 물어봐요', body: '번호 하나로 답하거나, 원하는 걸 말로 하면 돼요.' },
    ],
    sources: ['Gmail', 'Slack', '캘린더', 'Claude Code', 'Codex', '카카오톡 채널'],
    note: '숫자는 예시 카드의 것이에요.',
  },
  cards: {
    title: '어디서 왔든 같은 카드예요',
    lede: '메일 답장도, 겹친 일정도, 에이전트의 승인 요청도 질문 하나와 답 몇 개로 끝나요.',
    list: '카드 종류',
    moments: [
      { id: 'calendar', tab: '겹친 일정', shot: 'cal', alt: '목요일 3시에 겹친 두 일정을 하루 달력 조각에 보여 주고, 옮길 방법 셋을 묻는 카드',
        title: '추천은 사실을 확인한 뒤에 나와요', body: '시간을 추천하기 전에 모두의 캘린더를 먼저 봐요.',
        facts: ['새로 생긴 일정은 따로 표시해요', '바뀐 초대는 고른 뒤에야 나가요'] },
      { id: 'agents', tab: '코딩 에이전트', shot: 'code', alt: '결제 재시도를 어디서 할지 묻는 Claude Code 카드와, 파일마다 바뀔 코드',
        title: '에이전트가 나를 기다리는 시간을 줄여요', body: 'Claude Code와 Codex는 클라우드의 내 공간에서 돌아요. 질문이 있거나 승인이 필요할 때만 카드가 오고, 답하는 즉시 이어서 일해요.',
        facts: ['답하기 전에 바뀔 코드를 봐요', '메시지마다가 아니라 질문마다 카드 한 장'] },
      { id: 'risky', tab: '위험한 승인', shot: 'risk', alt: '운영 DB에 명령을 실행해도 되는지 묻는 Codex의 위험 카드',
        title: '위험한 일은 저절로 정해지지 않아요', body: '운영 데이터, 돈, 되돌릴 수 없는 일은 밀어서 넘기거나 시간이 지나 정해지지 않아요. 한 번 더 확인해요.',
        facts: ['위험은 아이콘과 낱말로 표시해요', '추천은 늘 안전한 쪽이에요'] },
      { id: 'words', tab: '말로 답하기', shot: 'words', alt: '토요일에 결혼식이 있다고 말하자 캘린더를 확인하고 선택지를 다시 만들어 온 카드',
        title: '보기가 맞지 않으면 말로 하세요', body: '“토요일엔 결혼식이 있어”라고 하면 캘린더를 확인하고 새 선택지를 가져와요. 끝은 여전히 번호 하나예요.',
        facts: ['처음 선택지는 지우지 않고 접어 둬요', '대신 보낼 수 없는 곳은 답장을 복사해 드려요'] },
      { id: 'fyi', tab: '알려만 드려요', shot: 'fyi', alt: '정할 것 없이 알아 두면 될 소식을 모은 덱',
        title: '정할 것 없는 소식은 한곳에', body: '출시일, 배포 결과, 청구 예상액처럼 알아 둘 만하지만 정할 건 없는 일들이에요.',
        facts: ['중요하면 한 번에 할 일로 올려요', '고친 건 다음 분류에 반영돼요'] },
      { id: 'fails', tab: '실패했을 때', shot: 'fail', alt: '부가세 자료가 나가지 못했다는 카드와 고칠 방법',
        title: '실패하면 다시 질문으로 돌아와요', body: '오류 문구만 남기지 않아요. 무엇이 안 됐는지, 지금 어떤 상태인지, 어떻게 고칠지를 알려 줘요.',
        facts: ['연결 하나가 막혀도 다른 건 계속 돌아요', '아직 아무것도 나가지 않았다고 분명히 말해요'] },
    ],
    action: '프로토타입에서 해 보기',
  },
  trust: {
    title: '처음엔 아무것도 알아서 하지 않아요',
    lede: '무엇을 맡길지는 내가 정해요. 한 일은 모두 기록에 남고, 되돌릴 수 있는 일은 되돌릴 수 있어요.',
    promises: [
      { icon: 'shield', title: '처음엔 전부 물어봐요', body: '같은 답을 다섯 번 하면, 그때 앞으로 알아서 할지 여쭤봐요.' },
      { icon: 'undo', title: '10초 안에 되돌리기', body: '답장, 초대, 댓글은 10초 뒤에 나가요.' },
      { icon: 'lock', title: '돈은 늘 물어봐요', body: '결제, 운영 데이터, 되돌릴 수 없는 일은 끌 수 없는 규칙이에요.' },
      { icon: 'mail', title: '메일은 명령이 아니에요', body: '밖에서 온 글은 요약할 내용일 뿐, 따를 지시가 아니에요.' },
    ],
    logAlt: '처리 기록 화면. 오늘 한 일마다 되돌리기가 있고, 알아서 할 수 있는 일마다 켜고 끄는 단추가 있어요',
    logTitle: '내가 정한 것과 비서가 한 일이 나란히',
    logBody: '처리 기록에서 무엇을 언제, 어떤 규칙으로 했는지 볼 수 있어요. 알아서 할 범위도 여기서 켜고 꺼요.',
  },
  connect: {
    title: '코딩 에이전트부터, 하나씩 늘려 가요',
    lede: '공식적으로 허용된 API로만 연결해요. 되는 것과 안 되는 것을 그대로 말해요.',
    when: '언제', service: '서비스', does: '하는 일',
    groups: [
      { label: '처음부터', rows: [
        { name: 'Codex', does: '질문과 승인' }, { name: 'Claude Code', does: '질문과 승인' },
        { name: 'Gmail', does: '읽기와 답장' }, { name: 'Google 캘린더', does: '수락과 옮기기' } ] },
      { label: '다음', rows: [
        { name: 'Slack', does: '나를 부른 글과 답장' }, { name: '카카오톡 채널', does: '카드 받기, 대화 붙여 넣기' },
        { name: 'GitHub', does: '리뷰 요청' }, { name: 'Telegram', does: '개인 대화와 답장' } ] },
      { label: '그다음', rows: [
        { name: 'Outlook과 Microsoft 365', does: '메일과 일정' }, { name: '네이버 메일과 다음 메일', does: '읽기와 답장' },
        { name: 'Notion, Linear, Jira', does: '댓글과 변경' }, { name: 'Instagram과 X', does: '비즈니스 메시지' } ] },
    ],
    phoneTitle: '급한 건 잠금 화면에서 끝나요',
    phoneBody: '누군가 기다리고 있거나 오늘이 기한인 카드만 알림이 와요. 알림을 길게 눌러 그 자리에서 답하면 돼요. 위험한 카드는 앱을 열어야 해요.',
    phoneNext: '웹으로 먼저 열고, 아이폰과 아이패드 앱이 뒤따라요.',
  },
  faq: {
    title: '궁금한 것들',
    items: [
      { q: '카카오톡 대화도 읽나요?', a: '아니요. 카카오톡은 대화를 읽는 공식 방법이 없어서 읽지 않아요. 대신 CatchUp 카카오톡 채널을 추가하면 카드를 카톡으로 받을 수 있고, 정리하고 싶은 대화는 채널에 붙여 넣으면 돼요.' },
      { q: '기기가 꺼져 있어도 되나요?', a: '네. 비서는 클라우드의 내 공간에서 돌아요. 다시 열면 카드가 기다리고 있어요.' },
      { q: '묻지 않고 답장을 보내지는 않나요?', a: '처음엔 그러지 않아요. 내가 고른 것만 하고, 밖으로 나가는 건 10초 기다리니 그사이 되돌릴 수 있어요. 같은 답이 계속 쌓였을 때만 맡길지 물어봐요.' },
      { q: '다른 사람의 데이터와 섞이지 않나요?', a: '사람마다 클라우드에 따로 공간이 있고, 데이터와 연결 정보는 각자의 키로 암호화해요.' },
      { q: '언제 써 볼 수 있나요?', a: '지금 만들고 있어요. 웹이 먼저 나오고, 아이폰과 아이패드가 뒤따라요. 영어와 한국어를 지원해요.' },
    ],
  },
  end: {
    title: '오늘 쌓인 건 CatchUp이 먼저 읽어 둘게요',
    lede: '정할 것만, 카드로. 곧 만나요.',
    action: '프로토타입 써 보기',
    open: '새 탭에서 열기',
    shotAlt: '휴대폰의 덱. 아침의 첫 카드',
  },
  foot: { note: '화면은 예시 카드로 돌아가는 프로토타입이에요. 이름과 숫자는 예시예요.', rights: '© 2026 CatchUp' },
};

export const copy: Record<Lang, Copy> = { en, ko };
