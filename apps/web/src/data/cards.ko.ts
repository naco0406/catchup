import type { Dataset } from './types';

// 예시 카드 — 앞의 7장은 시안 보드와 같은 '월요일 아침'이에요. 나머지 13장은 '카드 더 받기'로 와요.
export const ko: Dataset = {
  today: ['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07'],
  cards: [
    {
      id: 'c01', source: 'gmail', who: '박서연', meta: '한빛 디자인 · Gmail · 오전 8:12', due: { text: '오늘 18시까지 답해야 해요', tone: 'wait' },
      question: '리브랜딩 견적, A안과 B안\u00a0중 어느 쪽으로 할까요?',
      summary: [
        { strong: 'A안 1,480만 원 · 6주', text: ' — 로고와 상세 화면 5종, 수정 2번' },
        { strong: 'B안 1,150만 원 · 4주', text: ' — 로고와 상세 화면 3종, 수정 1번' },
        { text: '10월에 정한 예산은 1,300만 원이고, 출시는 1월 12일이에요.', dim: true },
      ],
      evidence: ['메일 3통', '견적서_한빛_v2.pdf', '4분기 예산'],
      options: [
        { label: 'B안으로 진행해요', detail: '예산 안에 들고, 출시까지 2주가 남아요', done: '박서연 님께 B안으로 진행한다고 답장했어요', effect: { kind: 'send', to: '박서연', text: '서연 님, 검토해 보니 B안으로 진행하면 좋겠습니다. 계약서 초안을 보내 주시면 이번 주 안에 확인하겠습니다.' } },
        { label: 'A안으로 진행해요', detail: '예산을 180만 원 넘어요', risk: 'money', done: '박서연 님께 A안으로 진행한다고 답장했어요', effect: { kind: 'send', to: '박서연', text: '서연 님, A안으로 진행하면 좋겠습니다. 계약서 초안을 보내 주시면 이번 주 안에 확인하겠습니다.' } },
        { label: 'A안을 예산에 맞출지 되물어요', detail: '1,300만 원에 맞출 수 있는지요. 답이 오면 다시 카드로 올려요', done: '박서연 님께 A안을 예산에 맞출 수 있는지 여쭤봤어요', effect: { kind: 'send', to: '박서연', text: '서연 님, A안이 마음에 드는데 예산이 1,300만 원이라서요. 범위를 줄여 맞출 수 있을지 여쭤봐도 될까요?' } },
      ],
      recommended: 0,
      followUp: {
        work: '견적서와 4분기 예산을 다시 확인했어요', workIcon: 'file', reply: '수정 횟수만 늘리면 예산 안에서 될 것 같아요. 이렇게 다시 골라 봤어요.', recommended: 0,
        options: [
          { label: 'B안에 수정 1번을 더할지 물어요', detail: '추가 비용은 보통 100만 원 안쪽이에요', done: '박서연 님께 B안에 수정 1번을 더할 수 있는지 여쭤봤어요', effect: { kind: 'send', to: '박서연', text: '서연 님, B안에 수정을 한 번 더 넣을 수 있을지 여쭤봐도 될까요? 가능하면 비용도 같이 알려 주세요.' } },
          { label: 'B안 그대로 진행해요', detail: '처음 추천과 같아요', done: '박서연 님께 B안으로 진행한다고 답장했어요', effect: { kind: 'send', to: '박서연', text: '서연 님, B안 그대로 진행하겠습니다. 계약서 초안을 보내 주세요.' } },
        ],
      },
    },
    {
      id: 'c02', source: 'claude', who: 'Claude Code', meta: 'shop 저장소 · 결제 재시도 넣기', due: { text: '12분째 멈춰 있어요', tone: 'wait' },
      question: '결제 재시도를 어디에서 하게 할까요?',
      summary: [{ text: '결제가 실패하면 3번까지 다시 시도하게 만드는 중이에요.' }, { text: '지금은 주문 화면에만 있어서, 정기 결제는 실패하면 그대로 끝나요.' }],
      evidence: ['지금까지 한 일 6단계', '읽은 파일 12개', '테스트 38개 통과'],
      options: [
        { label: '결제 서버에서 다시 시도해요', detail: '정기 결제까지 한 번에 해결돼요 · 파일 4개 · 10분쯤', done: 'Claude Code에게 결제 서버에서 다시 시도하라고 했어요', effect: { kind: 'tell', to: 'Claude Code', code: { file: 'services/payments/retry.ts', add: 18, del: 2, files: 4, lines: [{ t: 'del', s: '- return charge(order)' }, { t: 'add', s: '+ return withRetry(() => charge(order), { times: 3, onlyWhen: isTemporaryFailure })' }] } } },
        { label: '주문 화면에서만 다시 시도해요', detail: '가장 작게 바꿔요 · 파일 1개 · 정기 결제는 그대로예요', done: 'Claude Code에게 주문 화면에서만 다시 시도하라고 했어요', effect: { kind: 'tell', to: 'Claude Code' } },
        { label: '여기서 멈추고 두 방법을 정리해 둬요', detail: '코드는 바꾸지 않고, 내가 나중에 직접 봐요', done: 'Claude Code에게 멈추고 두 방법을 정리하라고 했어요', effect: { kind: 'tell', to: 'Claude Code' } },
      ],
      recommended: 0,
    },
    {
      id: 'c03', source: 'calendar', who: '캘린더', meta: '김태호 님의 초대 · 오전 7:50', due: { text: '목요일 일정이에요', tone: 'wait' },
      question: '목요일 3시에 일정\u00a0둘이 겹쳐요. 어느 쪽을 옮길까요?',
      summary: [],
      options: [
        { label: '주간 회의를 4시 30분으로 옮겨요', detail: '6명 모두 그 시간에 비어 있어요', done: '제품 주간 회의를 목요일 4시 30분으로 옮기고 6명에게 바뀐 초대를 보냈어요', effect: { kind: 'change', undo: true } },
        { label: '투자 미팅을 금요일 10시로 되물어요', detail: '김태호 님 답이 오면 다시 알려 드려요', done: '김태호 님께 투자 미팅을 금요일 10시로 옮길 수 있는지 여쭤봤어요', effect: { kind: 'send', to: '김태호', text: '태호 님, 목요일 3시에 정기 회의가 있어서요. 투자 미팅을 금요일 오전 10시로 옮길 수 있을까요?' } },
        { label: '주간 회의는 이번 주만 빠져요', detail: '이도현 님께 진행을 부탁해요', done: '이도현 님께 이번 주 주간 회의 진행을 부탁했어요', effect: { kind: 'send', to: '이도현', text: '도현 님, 이번 주 제품 주간 회의는 제가 빠져야 해서요. 진행을 부탁드려도 될까요?' } },
      ],
      recommended: 0,
      context: { kind: 'slots', slots: [{ time: '15:00 – 16:00', name: '블루포인트 투자 미팅', who: '새 초대 · 김태호 외 2명', isNew: true }, { time: '15:00 – 15:30', name: '제품 주간 회의', who: '매주 · 6명' }] },
    },
    {
      id: 'c04', source: 'kakao', who: '엄마', meta: '카카오톡 채널로 보내 주신 대화 · 어제 오후 9:40', due: { text: '급하지 않아요', tone: 'calm' },
      question: '토요일 가족 식사, 몇 시로 답할까요?',
      summary: [{ text: '토요일에 집에서 다 같이 밥 먹자고 하셨어요.' }, { text: '토요일 오후에는 이민지 님 결혼식이 캘린더에 있어요.', dim: true }],
      options: [
        { label: '저녁 6시에 갈게요', detail: '결혼식은 오후 4시쯤 끝나요', done: '엄마께 보낼 답장(저녁 6시)을 복사해 드렸어요', effect: { kind: 'copy', to: '엄마', text: '엄마, 토요일은 결혼식 끝나고 저녁 6시쯤 갈게요!' } },
        { label: '점심 12시에 갈게요', detail: '결혼식 전에 다녀올 수 있어요', done: '엄마께 보낼 답장(점심 12시)을 복사해 드렸어요', effect: { kind: 'copy', to: '엄마', text: '엄마, 토요일은 결혼식 전에 점심 12시쯤 갈게요!' } },
        { label: '이번엔 못 가요', detail: '다음 주말을 여쭤봐요', done: '엄마께 보낼 답장(다음 주말)을 복사해 드렸어요', effect: { kind: 'copy', to: '엄마', text: '엄마, 이번 토요일은 못 갈 것 같아요. 다음 주말은 어떠세요?' } },
      ],
      recommended: 0,
      followUp: {
        work: '캘린더에서 11월 29일을 확인했어요', workIcon: 'calendar', reply: '일요일은 낮 12시부터 비어 있어요. 이렇게 다시 골라 봤어요.', recommended: 0,
        options: [
          { label: '일요일 12시 30분이 어떤지 여쭤봐요', detail: '엄마가 좋다고 하시면 캘린더에 넣어요', done: '엄마께 보낼 답장(일요일 12시 30분)을 복사해 드렸어요', effect: { kind: 'copy', to: '엄마', text: '엄마, 토요일은 결혼식이 있어서요. 일요일 점심 12시 반은 어떠세요?' } },
          { label: '일요일 저녁 6시가 어떤지 여쭤봐요', detail: '월요일 아침 회의 전날이에요', done: '엄마께 보낼 답장(일요일 저녁 6시)을 복사해 드렸어요', effect: { kind: 'copy', to: '엄마', text: '엄마, 토요일은 결혼식이 있어서요. 일요일 저녁 6시는 어떠세요?' } },
        ],
      },
    },
    {
      id: 'c05', source: 'codex', who: 'Codex', meta: 'shop 저장소 · 주문 표에 칸 추가', due: { text: '운영 데이터가 바뀌어요', tone: 'risk' },
      question: '운영 DB에 이 명령을 실행해도 될까요?',
      summary: [{ text: '주문 표에 ‘다시 시도한 횟수’ 칸을 더해요. 지우는 것은 없어요.' }, { text: '되돌리는 스크립트가 같이 들어 있고, 스테이징에는 아직 안 돌렸어요.', dim: true }],
      options: [
        { label: '스테이징에서 먼저 돌려요', detail: '잘 되면 운영은 다시 물어봐요', done: 'Codex에게 스테이징에서 먼저 마이그레이션을 돌리라고 했어요', effect: { kind: 'tell', to: 'Codex' } },
        { label: '이번 한 번만 허용해요', detail: '운영에 바로 실행해요 · 한 번 더 확인해요', risk: 'production', done: 'Codex의 운영 DB 마이그레이션을 한 번 허용했어요', effect: { kind: 'tell', to: 'Codex' } },
        { label: '거절해요', detail: 'Codex는 이 단계를 건너뛰고 나머지를 이어서 해요', done: 'Codex의 운영 DB 마이그레이션을 거절했어요', effect: { kind: 'tell', to: 'Codex' } },
      ],
      recommended: 0,
      context: { kind: 'command', cmd: '$ pnpm db:migrate --env production' },
    },
    {
      id: 'c06', source: 'slack', who: '이도현', meta: '#디자인 · Slack · 오전 8:40', due: { text: '오늘 오전 중', tone: 'wait' },
      question: '내일 디자인 리뷰를 몇 시에 할까요?',
      summary: [{ text: '리뷰할 시안 3개가 올라왔고, 다들 내일 하자고 해요.' }, { text: '내일 비어 있는 시간은 11시와 오후 2시예요.', dim: true }],
      evidence: ['글 14개', '시안 3개'],
      options: [
        { label: '오전 11시로 해요', detail: '참석자 5명 모두 비어 있어요', done: '#디자인에 내일 오전 11시 리뷰로 답했어요', effect: { kind: 'send', to: '#디자인', text: '내일 오전 11시에 리뷰해요! 시안 3개 미리 보고 올게요.' } },
        { label: '오후 2시로 해요', detail: '정유나 님이 30분 늦어요', done: '#디자인에 내일 오후 2시 리뷰로 답했어요', effect: { kind: 'send', to: '#디자인', text: '내일 오후 2시에 리뷰해요! 유나 님은 30분 뒤에 합류해 주세요.' } },
        { label: '이번엔 글로 리뷰해요', detail: '각자 시안에 댓글을 달아요', done: '#디자인에 이번 리뷰는 댓글로 하자고 답했어요', effect: { kind: 'send', to: '#디자인', text: '이번 리뷰는 댓글로 해요. 시안에 의견을 남겨 주세요.' } },
      ],
      recommended: 0,
    },
    {
      id: 'c07', source: 'gmail', who: '세무법인 다온', meta: 'Gmail · 내가 9:47에 정했어요', due: { text: '보내지 못했어요', tone: 'risk' },
      question: '부가세 자료를 보내지 못했어요. 어떻게 할까요?',
      summary: [{ text: '첨부 5개를 합치면 31MB라서 Gmail 한도 25MB를 넘어요.' }, { text: '답장은 아직 나가지 않았고, 수요일까지 내야 해요.', dim: true }],
      options: [
        { label: 'Google 드라이브 링크로 보내요', detail: '다온 담당자만 열 수 있게 해요', done: '세무법인 다온에 드라이브 링크로 부가세 자료를 보냈어요', effect: { kind: 'send', to: '세무법인 다온', text: '안녕하세요, 첨부 용량이 커서 부가세 자료 5개를 드라이브 링크로 보내 드립니다.' } },
        { label: '메일 두 통으로 나눠 보내요', detail: '매출 3개 · 매입 2개', done: '세무법인 다온에 부가세 자료를 두 통으로 나눠 보냈어요', effect: { kind: 'send', to: '세무법인 다온', text: '안녕하세요, 부가세 자료를 매출 3개와 매입 2개로 나눠 메일 두 통으로 보내 드립니다.' } },
        { label: '내가 직접 보낼게요', detail: '초안과 첨부는 Gmail 임시 보관함에 둬요', done: '부가세 자료 메일을 임시 보관함에 두었어요', effect: { kind: 'none' } },
      ],
      recommended: 0,
    },
    {
      id: 'c08', source: 'github', who: '정유나', meta: 'shop · PR #214 · 검토 요청', due: { text: '어제부터 기다려요', tone: 'wait' },
      question: '결제 모듈 PR을 지금 검토할까요?',
      summary: [{ text: '결제 실패 알림을 슬랙으로 보내는 변경이에요. 파일 6개, 테스트 통과.' }, { text: '유나 님이 금요일 배포에 넣고 싶어 해요.', dim: true }],
      options: [
        { label: '오늘 오후에 볼게요', detail: '유나 님께 오후에 본다고 남겨요', done: '정유나 님께 PR #214를 오후에 본다고 남겼어요', effect: { kind: 'send', to: '정유나', text: '유나 님, PR #214는 오늘 오후에 볼게요.' } },
        { label: '승인해요', detail: 'CI가 모두 통과했어요', done: 'PR #214를 승인했어요', effect: { kind: 'change' } },
        { label: '도현 님께 넘겨요', detail: '결제 모듈을 같이 만든 분이에요', done: 'PR #214 검토를 이도현 님께 넘겼어요', effect: { kind: 'send', to: '이도현', text: '도현 님, PR #214 검토를 부탁드려도 될까요? 유나 님이 금요일 배포에 넣고 싶어 하세요.' } },
      ],
      recommended: 0,
    },
    {
      id: 'c09', source: 'gmail', who: '최지훈', meta: '블루포인트 · Gmail · 오전 9:05', due: { text: '목요일 미팅 전', tone: 'wait' },
      question: '투자사에 IR 자료 폴더를 열어 줄까요?',
      summary: [{ text: '목요일 미팅 전에 지표와 재무 자료를 보고 싶다고 해요.' }, { text: '드라이브의 IR 폴더에는 비밀 유지 계약 전 자료와 후 자료가 섞여 있어요.', dim: true }],
      options: [
        { label: '공개용 자료만 보기 권한으로 줘요', detail: '재무 상세는 계약 뒤에 줘요', done: '최지훈 님께 IR 공개용 자료 보기 권한을 드렸어요', effect: { kind: 'change' } },
        { label: '폴더 전체를 열어 줘요', detail: '비밀 유지 계약 전이에요', risk: 'irreversible', done: '최지훈 님께 IR 폴더 전체를 열어 드렸어요', effect: { kind: 'change' } },
        { label: '미팅에서 직접 보여 준다고 답해요', detail: '자료는 보내지 않아요', done: '최지훈 님께 미팅에서 직접 보여 드린다고 답했어요', effect: { kind: 'send', to: '최지훈', text: '지훈 님, 지표와 재무 자료는 목요일 미팅에서 직접 보여 드리겠습니다.' } },
      ],
      recommended: 0,
    },
    {
      id: 'c10', source: 'calendar', who: '정유나', meta: '1:1 · 캘린더 · 오전 8:20', due: { text: '오늘 오후 4시', tone: 'wait' },
      question: '오늘 1:1을 내일로 옮겨 달래요. 언제로 할까요?',
      summary: [{ text: '유나 님이 오후에 고객 미팅이 생겼대요.' }],
      options: [
        { label: '내일 오전 10시', detail: '둘 다 비어 있어요', done: '정유나 님과의 1:1을 내일 오전 10시로 옮겼어요', effect: { kind: 'change', undo: true } },
        { label: '내일 오후 4시', detail: '같은 시간이에요', done: '정유나 님과의 1:1을 내일 오후 4시로 옮겼어요', effect: { kind: 'change', undo: true } },
        { label: '이번 주는 건너뛰어요', detail: '다음 주에 30분 더 길게 해요', done: '이번 주 정유나 님과의 1:1을 건너뛰었어요', effect: { kind: 'change', undo: true } },
      ],
      recommended: 0,
    },
    {
      id: 'c11', source: 'slack', who: '이도현', meta: 'DM · Slack · 오전 9:12', due: { text: '이번 주 안에', tone: 'calm' },
      question: '도현 님이 12월 24일 휴가를 내고 싶대요. 승인할까요?',
      summary: [{ text: '그날 팀에 다른 휴가는 없어요.' }, { text: '24일 오후에 배포 계획이 있어요.', dim: true }],
      options: [
        { label: '승인해요', detail: '배포는 유나 님이 맡을 수 있어요', done: '이도현 님의 12월 24일 휴가를 승인했어요', effect: { kind: 'send', to: '이도현', text: '도현 님, 24일 휴가 승인할게요. 잘 다녀오세요!' } },
        { label: '오후 반차를 제안해요', detail: '오전 배포 준비는 함께해요', done: '이도현 님께 24일 오후 반차를 제안했어요', effect: { kind: 'send', to: '이도현', text: '도현 님, 24일에 배포가 있어서 오전 준비만 같이 하고 오후 반차로 하면 어떨까요?' } },
      ],
      recommended: 0,
    },
    {
      id: 'c12', source: 'gmail', who: 'AWS', meta: '청구 알림 · Gmail · 오전 6:00', due: { text: '한도의 92%', tone: 'risk' },
      question: '이번 달 AWS 한도를 올릴까요?',
      summary: [{ text: '이번 달 예상액이 46만 원으로, 한도 50만 원의 92%예요.' }, { text: '지난주 테스트 서버 3대가 꺼지지 않고 있어요.', dim: true }],
      options: [
        { label: '테스트 서버 3대를 꺼요', detail: '한 달에 약 9만 원을 아껴요', done: '쓰지 않는 테스트 서버 3대를 껐어요', effect: { kind: 'change', undo: true } },
        { label: '한도를 60만 원으로 올려요', detail: '돈이 더 나가요 · 한 번 더 확인해요', risk: 'money', done: 'AWS 한도를 60만 원으로 올렸어요', effect: { kind: 'change' } },
        { label: '그대로 둬요', detail: '한도에 닿으면 다시 알려 드려요', done: 'AWS 한도를 그대로 두었어요', effect: { kind: 'none' } },
      ],
      recommended: 0,
    },
    {
      id: 'c13', source: 'claude', who: 'Claude Code', meta: 'shop 저장소 · 테스트 정리', due: { text: '5분째 멈춰 있어요', tone: 'wait' },
      question: '가끔 실패하는 테스트 3개를 어떻게 할까요?',
      summary: [{ text: '시간대에 따라 실패하는 테스트예요. 원인은 날짜 계산이에요.' }],
      evidence: ['실패 기록 11번', '파일 2개'],
      options: [
        { label: '시간대를 고정해 고쳐요', detail: '파일 2개 · 5분쯤', done: 'Claude Code에게 테스트의 시간대를 고정해 고치라고 했어요', effect: { kind: 'tell', to: 'Claude Code' } },
        { label: '일단 건너뛰고 이슈로 남겨요', detail: '오늘 배포를 막지 않아요', done: 'Claude Code에게 테스트 3개를 건너뛰고 이슈로 남기라고 했어요', effect: { kind: 'tell', to: 'Claude Code' } },
      ],
      recommended: 0,
    },
    {
      id: 'c14', source: 'kakao', who: '대학 동기 방', meta: '올려 주신 대화 내보내기 · 어제', due: { text: '금요일 마감', tone: 'calm' },
      question: '송년회 날짜, 어디에 표를 줄까요?',
      summary: [{ text: '12월 19일(금)과 20일(토) 중에 정하는 중이에요.' }, { text: '19일 저녁엔 팀 회식이 캘린더에 있어요.', dim: true }],
      options: [
        { label: '20일 토요일', detail: '캘린더가 비어 있어요', done: '대학 동기 방에 보낼 답(20일)을 복사해 드렸어요', effect: { kind: 'copy', to: '대학 동기 방', text: '나는 20일 토요일 좋아!' } },
        { label: '19일 금요일', detail: '팀 회식과 겹쳐요', done: '대학 동기 방에 보낼 답(19일)을 복사해 드렸어요', effect: { kind: 'copy', to: '대학 동기 방', text: '나는 19일 금요일에 한 표!' } },
      ],
      recommended: 0,
    },
    {
      id: 'c15', source: 'gmail', who: '김하은', meta: '지원자 · Gmail · 어제 오후 7:30', due: { text: '내일까지', tone: 'wait' },
      question: '디자이너 지원자 면접, 어느 시간으로 잡을까요?',
      summary: [{ text: '하은 님이 다음 주 화 · 수 · 목 오후가 된대요.' }, { text: '면접관 두 분이 함께 비는 때는 수요일 3시예요.', dim: true }],
      options: [
        { label: '수요일 오후 3시', detail: '면접관 둘 다 비어요', done: '김하은 님께 수요일 오후 3시 면접을 보냈어요', effect: { kind: 'send', to: '김하은', text: '하은 님, 면접은 다음 주 수요일 오후 3시로 잡으면 어떨까요? 괜찮으시면 초대를 보내 드리겠습니다.' } },
        { label: '목요일 오후 4시', detail: '유나 님만 비어요', done: '김하은 님께 목요일 오후 4시 면접을 보냈어요', effect: { kind: 'send', to: '김하은', text: '하은 님, 면접은 다음 주 목요일 오후 4시로 잡으면 어떨까요? 괜찮으시면 초대를 보내 드리겠습니다.' } },
      ],
      recommended: 0,
    },
    {
      id: 'c16', source: 'codex', who: 'Codex', meta: 'shop 저장소 · 의존성 올리기', due: { text: '3분째 멈춰 있어요', tone: 'wait' },
      question: 'React를 19.3으로 올려도 될까요?',
      summary: [{ text: '보안 수정이 들어 있는 판이에요. 바뀌는 파일은 lockfile뿐이에요.' }, { text: '테스트 212개는 모두 통과했어요.', dim: true }],
      options: [
        { label: '올려요', detail: 'PR로 만들어 둬요', done: 'Codex에게 React 19.3 업그레이드 PR을 만들라고 했어요', effect: { kind: 'tell', to: 'Codex' } },
        { label: '다음 주에 해요', detail: '이번 주 배포가 끝난 뒤에요', done: 'React 업그레이드를 다음 주로 미뤘어요', effect: { kind: 'tell', to: 'Codex' } },
      ],
      recommended: 0,
    },
    {
      id: 'c17', source: 'slack', who: '고객 지원', meta: '#지원 · Slack · 오전 9:30', due: { text: '고객이 기다려요', tone: 'wait' },
      question: '결제가 두 번 된 고객, 어떻게 답할까요?',
      summary: [{ text: '같은 주문이 두 번 결제됐어요. 39,000원이에요.' }, { text: '결제 기록에서 중복이 확인됐어요.', dim: true }],
      options: [
        { label: '확인 중이라고 먼저 답해요', detail: '환불은 담당자가 오늘 처리해요', done: '#지원에 확인 중이라고 먼저 답했어요', effect: { kind: 'send', to: '#지원', text: '결제가 두 번 된 것을 확인하고 있어요. 환불은 담당자가 오늘 처리할게요.' } },
        { label: '한 건을 바로 환불해요', detail: '39,000원 · 한 번 더 확인해요', risk: 'money', done: '중복 결제 39,000원을 환불했어요', effect: { kind: 'change' } },
      ],
      recommended: 0,
    },
    {
      id: 'c18', source: 'gmail', who: '오늘상회', meta: '거래처 · Gmail · 어제', due: { text: '이번 주 안에', tone: 'calm' },
      question: '11월 세금계산서를 발행해 달래요. 어떻게 할까요?',
      summary: [{ text: '11월 납품 2건, 합계 330만 원이에요.' }],
      options: [
        { label: '오늘 발행해요', detail: '홈택스 발행은 직접 해 주세요', done: '오늘상회에 세금계산서를 오늘 발행한다고 답했어요', effect: { kind: 'send', to: '오늘상회', text: '안녕하세요, 11월 납품분 세금계산서는 오늘 발행해 드리겠습니다.' } },
        { label: '월말에 한 번에 발행해요', detail: '12월 1일에 다시 알려 드려요', done: '오늘상회에 월말에 발행한다고 답했어요', effect: { kind: 'send', to: '오늘상회', text: '안녕하세요, 11월 납품분 세금계산서는 월말에 한 번에 발행해 드리겠습니다.' } },
      ],
      recommended: 0,
    },
    {
      id: 'c19', source: 'gmail', who: '프론트엔드 컨퍼런스', meta: 'Gmail · 이틀 전', due: { text: '금요일까지', tone: 'calm' },
      question: '컨퍼런스 발표 제안을 받을까요?',
      summary: [{ text: '2월 20일, 20분 발표예요. 주제는 자유래요.' }, { text: '2월 셋째 주에는 출시 일정이 있어요.', dim: true }],
      options: [
        { label: '정중히 거절해요', detail: '출시 주라서요', done: '컨퍼런스 발표를 정중히 거절했어요', effect: { kind: 'send', to: '프론트엔드 컨퍼런스', text: '초대해 주셔서 감사합니다. 출시 일정과 겹쳐 이번에는 어렵겠습니다.' } },
        { label: '좋다고 답해요', detail: '주제는 나중에 정해요', done: '컨퍼런스 발표를 하겠다고 답했어요', effect: { kind: 'send', to: '프론트엔드 컨퍼런스', text: '초대해 주셔서 감사합니다. 발표하겠습니다. 주제는 정해서 다시 알려 드릴게요.' } },
      ],
      recommended: 0,
    },
    {
      id: 'c20', source: 'gmail', who: '집주인', meta: 'Gmail · 어제 오후 6:10', due: { text: '12월 10일까지', tone: 'risk' },
      question: '월세 재계약, 어떻게 답할까요?',
      summary: [{ text: '보증금은 그대로, 월세를 5만 원 올리고 싶대요.' }, { text: '근처 같은 평수 시세보다는 낮아요.', dim: true }],
      options: [
        { label: '3만 원 인상을 제안해요', detail: '답이 오면 다시 카드로 올려요', done: '집주인께 3만 원 인상을 제안했어요', effect: { kind: 'send', to: '집주인', text: '안녕하세요, 재계약은 하고 싶은데 월세 인상은 3만 원으로 조정해 주실 수 있을까요?' } },
        { label: '5만 원 인상에 동의해요', detail: '돈이 나가요 · 한 번 더 확인해요', risk: 'money', done: '월세 5만 원 인상에 동의했어요', effect: { kind: 'send', to: '집주인', text: '안녕하세요, 월세 5만 원 인상으로 재계약하겠습니다.' } },
      ],
      recommended: 0,
    },
  ],
  fyi: [
    { id: 'f01', source: 'slack', title: '#제품 — 12월 출시 일정이 12월 9일로 확정됐어요', sub: '이도현 외 4명 · 글 23개를 줄였어요' },
    { id: 'f02', source: 'github', title: 'PR 3개가 합쳐졌고, 밤 배포는 문제없이 끝났어요', sub: 'shop · 검토는 정유나 님이 했어요' },
    { id: 'f03', source: 'gmail', title: 'AWS 11월 청구 예상액은 412,000원이에요', sub: '지난달보다 8% 늘었어요 · 정해 둔 한도 안이에요' },
    { id: 'f04', source: 'kakao', title: '대학 동기 방 — 12월 송년회 날짜를 투표 중이에요', sub: '올려 주신 대화 내보내기에서 · 아직 내 표가 없어요' },
    { id: 'f05', source: 'calendar', title: '수요일 치과 예약이 오후 2시에서 3시로 바뀌었어요', sub: '그 시간에 다른 일정은 없어요' },
  ],
  runs: [
    { title: '결제 재시도 넣기', agent: 'Claude Code', status: '답을 기다려요', waiting: true },
    { title: '주간 보고 초안 쓰기', agent: 'Codex', status: '6분째 하는 중' },
    { title: '밤사이 메일 41통 정리', agent: '비서', status: '8:55에 끝났어요' },
  ],
  routines: [
    { id: 'r1', icon: 'calendar', title: '팀 정기 회의 초대는 수락해요', sub: '같은 답을 5번 하셔서 물어보고 켰어요 · 이번 달 8번 썼어요', on: true },
    { id: 'r2', icon: 'terminal', title: '코딩 에이전트의 테스트 실행은 허용해요', sub: 'Claude Code · Codex · 이번 달 41번 썼어요', on: true },
    { id: 'r3', icon: 'archive', title: '뉴스레터는 읽지 않고 보관해요', sub: '같은 답을 5번 하셔서 물어보고 켰어요 · 이번 달 212통', on: true },
    { id: 'r4', icon: 'money', title: '돈이 나가는 일은 금액과 상관없이 늘 물어봐요', sub: '내가 정했어요 · 끌 수 없어요', on: true, locked: true },
  ],
  autoDone: [
    { id: 'a1', source: 'archive', title: '뉴스레터와 광고 메일 19통을 보관했어요', sub: '규칙 · 뉴스레터는 읽지 않고 보관해요', time: '오전 8:55', min: 535, undo: true },
    { id: 'a2', source: 'calendar', title: '팀 정기 회의 초대 2개를 수락했어요', sub: '규칙 · 지난 5번 모두 수락하셨어요', time: '오전 8:52', min: 532, undo: true },
    { id: 'a3', source: 'gmail', title: '영수증 2장을 ‘11월 지출’에 정리했어요', sub: '쿠팡 38,900원 · 카카오 T 12,400원', time: '오전 8:50', min: 530, undo: true },
  ],
  sources: [
    { source: 'gmail', name: 'Gmail', count: 41 }, { source: 'slack', name: 'Slack', count: 63 }, { source: 'kakao', name: '카카오톡 채널', count: 2 },
    { source: 'calendar', name: '캘린더', count: 5 }, { source: 'github', name: 'GitHub', count: 9 }, { source: 'claude', name: 'Claude Code', count: 2 }, { source: 'codex', name: 'Codex', count: 3 },
  ],
};
