// UI strings (English). Card text lives in data/cards.en.ts.
export const en = {
  nav: { catchup: 'Catch up', fyi: 'FYI', snoozed: 'Snoozed', activity: 'Activity' },
  side: { working: 'Assistant is working on', incoming: 'Incoming · overnight', settings: 'Settings', user: 'Jiwoo Han', initials: 'JH', menu: 'Menu', close: 'Close' },
  lang: { label: 'Language' },
  proto: { label: 'Prototype', more: 'Get more cards', reset: 'Start over', note: 'Sample data. Nothing is sent.' },
  top: { list: 'List view', deck: 'Card view', search: 'Search cards', searchPh: 'Search by person, place or question', open: 'To decide', none: 'Nothing matches.', decideNow: 'Decide now', of: '{{n}} of {{total}}', allDone: 'All {{total}} decided', doneSplit: '{{decided}} decided · {{snoozed}} snoozed', undo: 'Undo', progress: 'Cards' },
  card: {
    edit: 'Edit', editDone: 'Done', edited: 'edited', mic: 'Voice', micStop: 'Stop listening', listening: 'Listening…',
    suggested: 'Suggested', ifPick: 'If you pick {{n}}, {{to}} gets this', ifPickCopy: 'Pick {{n}} and the reply is copied for you',
    codeIf: 'If you pick {{n}}', files_one: '{{count}} file', files_other: '{{count}} files', riskWord: 'Risky', command: 'Command it wants to run', confirm: 'Press again to confirm', confirmHint: 'This one is risky. Press it again to go ahead.',
    composer: 'Answer differently — tell the assistant in your own words', composerShort: 'Answer differently', more: 'Say more', send: 'Send',
    firstOptions: 'First {{n}} options — {{list}}', risky: 'Cards like this can’t be swiped away and never decide themselves.', riskyNoSwipe: 'Cards like this never decide themselves, however long you wait.', snooze: 'Snooze', myself: 'I’ll do it myself', myselfShort: 'Myself',
    auto: 'Handle these for me', autoShort: 'Automate', autoToast: 'Give the same answer five times and the assistant will offer to handle these.', swipe: 'Swipe left to snooze', options: 'Answers',
  },
  generic: { reply: 'Got it. Here’s a new option based on what you said.', work: 'Read your note', asSaid: 'Answer the way you said', asSaidDone: 'Answered in your words: “{{text}}”' },
  toast: { runsSend: 'Sends in {{s}}s', runsCopy: 'Copies in {{s}}s', runsDo: 'Runs in {{s}}s', ran: 'Done', copied: 'Reply copied. Paste it in {{to}}.', snoozed: 'Snoozed until 2 PM', handed: 'Left for you to handle', undone: 'Undone. Nothing was sent.' },
  done: { title: 'All caught up', sub: 'You decided {{decided}} in {{time}} and snoozed {{snoozed}}.', subNone: 'You decided {{decided}} in {{time}}.', subSnoozedOnly: 'You snoozed all {{snoozed}}. They come back at 2 PM.', sub2: 'New cards will come as notifications.', auto: 'What the assistant handled meanwhile', all: 'See all', left: 'Still here', fyi_one: '{{count}} FYI', fyi_other: '{{count}} FYIs', fyiSub: 'Release date · nightly deploy · AWS estimate …', snoozed: '{{n}} snoozed', snoozedSub: 'They come back at 2 PM', skim: 'Skim', view: 'View', more: 'Get more cards' },
  first: { title: 'What should I keep an eye on?', sub: 'The assistant reads what comes into the places you connect and turns only the decisions into cards.', connected: 'Connected', connect: 'Connect', addChannel: 'Add channel', promise: 'At first it does nothing on its own. It asks about everything, and offers to take over only after the same answer keeps coming up.', start: 'Start catching up',
    rows: { gmail: ['Gmail', 'jiwoo@hanbit.studio'], calendar: ['Google Calendar', '3 calendars'], slack: ['Slack', 'Only mentions and DMs'], agents: ['Claude Code · Codex', 'Cards when an agent has a question or needs approval'], kakao: ['KakaoTalk', 'Chats can’t be read. Add the channel to get cards in KakaoTalk'] } },
  fyi: { title: 'FYI', sub_one: '{{count}} thing worth knowing, nothing to decide', sub_other: '{{count}} things worth knowing, nothing to decide', section: 'Overnight', promote: 'Make a card', promoted: 'Made a card', empty: 'Nothing here.', promoteQ: 'Anything to do about this?', promoteOk: 'Mark it as seen', promoteOkDetail: 'Nothing is sent', promoteOkDone: 'Marked as seen: {{title}}', promoteLater: 'Look at it later', promoteLaterDetail: 'Comes back this afternoon', promoteLaterDone: 'Set aside for later: {{title}}' },
  snoozed: { title: 'Snoozed', sub_one: '{{count}} card', sub_other: '{{count}} cards', back: 'Bring back', empty: 'Nothing snoozed. Cards you put off land here.', at: 'Back at 2 PM' },
  log: { pending: 'Goes out shortly — you can still undo', edited: 'edited the draft', title: 'Activity', today: 'Today', count: '{{n}} today', all: 'All', mine: 'By me', auto: 'By assistant', byMe: 'By me', subSnoozed: 'By me', subHanded: 'By me', suggested: 'took the suggestion', inWords: 'answered in words', snoozed: 'Snoozed: {{q}}', handed: 'You’ll handle it: {{q}}', undo: 'Undo', undone: 'Undone', routines: 'What it can handle on its own', routinesSub: '3 learned from you · 1 set by you', empty: 'Nothing yet today.' },
  src: { gmail: 'Gmail', calendar: 'Calendar', slack: 'Slack', kakao: 'KakaoTalk', github: 'GitHub', claude: 'Claude Code', codex: 'Codex' },
};
export type Messages = typeof en;
