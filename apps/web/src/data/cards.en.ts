import type { Dataset } from './types';

// Sample cards. The first 7 are the same "Monday morning" as the mockup board. The other 13 arrive with "Get more cards".
export const en: Dataset = {
  today: ['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07'],
  cards: [
    {
      id: 'c01', source: 'gmail', who: 'Seoyeon Park', meta: 'Hanbit Design · Gmail · 8:12 AM', due: { text: 'Reply by 6 PM today', tone: 'wait' },
      question: 'Rebrand quote: go with plan A or plan B?',
      summary: [
        { strong: 'A: $11,200 · 6 weeks', text: ' — logo and 5 detail screens, 2 rounds of edits' },
        { strong: 'B: $8,700 · 4 weeks', text: ' — logo and 3 detail screens, 1 round of edits' },
        { text: 'The budget set in October is $9,800. Launch is Jan 12.', dim: true },
      ],
      evidence: ['3 emails', 'quote_hanbit_v2.pdf', 'Q4 budget'],
      options: [
        { label: 'Go with plan B', detail: 'Fits the budget and leaves two weeks before launch', done: 'Told Seoyeon you’re going with plan B', effect: { kind: 'send', to: 'Seoyeon', text: 'Hi Seoyeon, we’d like to go ahead with plan B. Send over the contract draft and I’ll review it this week.' } },
        { label: 'Go with plan A', detail: '$1,400 over budget', risk: 'money', done: 'Told Seoyeon you’re going with plan A', effect: { kind: 'send', to: 'Seoyeon', text: 'Hi Seoyeon, we’d like to go ahead with plan A. Send over the contract draft and I’ll review it this week.' } },
        { label: 'Ask if plan A can fit $9,800', detail: 'You’ll get a new card when they reply', done: 'Asked Seoyeon whether plan A can fit the budget', effect: { kind: 'send', to: 'Seoyeon', text: 'Hi Seoyeon, we like plan A, but our budget is $9,800. Could you trim the scope to fit?' } },
      ],
      recommended: 0,
      followUp: {
        work: 'Checked the quote and the Q4 budget again', workIcon: 'file', reply: 'Adding one more round of edits should still fit the budget. Here are new options.', recommended: 0,
        options: [
          { label: 'Ask to add one more round of edits to plan B', detail: 'Usually under $800 extra', done: 'Asked Seoyeon to add a round of edits to plan B', effect: { kind: 'send', to: 'Seoyeon', text: 'Hi Seoyeon, could you add one more round of edits to plan B? Please include the extra cost if there is one.' } },
          { label: 'Go with plan B as is', detail: 'Same as the first suggestion', done: 'Told Seoyeon you’re going with plan B', effect: { kind: 'send', to: 'Seoyeon', text: 'Hi Seoyeon, we’ll go with plan B as is. Could you send over the contract draft?' } },
        ],
      },
    },
    {
      id: 'c02', source: 'claude', who: 'Claude Code', meta: 'shop repo · Add payment retries', due: { text: 'Waiting 12 min', tone: 'wait' },
      question: 'Where should payment retries happen?',
      summary: [{ text: 'Making failed payments retry up to 3 times.' }, { text: 'Right now retries only exist on the checkout page, so failed subscriptions just stop.' }],
      evidence: ['6 steps so far', '12 files read', '38 tests passing'],
      options: [
        { label: 'Retry in the payment service', detail: 'Covers subscriptions too · 4 files · about 10 min', done: 'Told Claude Code to retry in the payment service', effect: { kind: 'tell', to: 'Claude Code', code: { file: 'services/payments/retry.ts', add: 18, del: 2, files: 4, lines: [{ t: 'del', s: '- return charge(order)' }, { t: 'add', s: '+ return withRetry(() => charge(order), { times: 3, onlyWhen: isTemporaryFailure })' }] } } },
        { label: 'Retry on the checkout page only', detail: 'Smallest change · 1 file · subscriptions stay as they are', done: 'Told Claude Code to retry on the checkout page only', effect: { kind: 'tell', to: 'Claude Code' } },
        { label: 'Stop here and write up both options', detail: 'No code changes. I’ll look later.', done: 'Told Claude Code to stop and write up both options', effect: { kind: 'tell', to: 'Claude Code' } },
      ],
      recommended: 0,
    },
    {
      id: 'c03', source: 'calendar', who: 'Calendar', meta: 'Invite from Taeho Kim · 7:50 AM', due: { text: 'For Thursday', tone: 'wait' },
      question: 'Two meetings overlap Thursday at 3. Which one moves?',
      summary: [],
      options: [
        { label: 'Move the sync to 4:30', detail: 'All six are free then', done: 'Moved the weekly product sync to Thu 4:30 and sent updated invites to 6 people', effect: { kind: 'change', undo: true } },
        { label: 'Ask to move the investor meeting to Fri 10 AM', detail: 'You’ll hear back when Taeho replies', done: 'Asked Taeho if the investor meeting can move to Fri 10 AM', effect: { kind: 'send', to: 'Taeho', text: 'Hi Taeho, I have a team sync Thursday at 3. Could we move the investor meeting to Friday at 10 AM?' } },
        { label: 'Skip the sync this week', detail: 'Ask Dohyun to run it', done: 'Asked Dohyun to run this week’s sync', effect: { kind: 'send', to: 'Dohyun', text: 'Dohyun, I have to miss this week’s product sync. Could you run it?' } },
      ],
      recommended: 0,
      context: { kind: 'slots', slots: [{ time: '3:00 – 4:00 PM', name: 'Bluepoint investor meeting', who: 'New invite · Taeho and 2 others', isNew: true }, { time: '3:00 – 3:30 PM', name: 'Weekly product sync', who: 'Weekly · 6 people' }] },
    },
    {
      id: 'c04', source: 'kakao', who: 'Mom', meta: 'Sent via KakaoTalk channel · yesterday 9:40 PM', due: { text: 'Not urgent', tone: 'calm' },
      question: 'Family dinner on Saturday: what time should you say?',
      summary: [{ text: 'She wants everyone home for a meal on Saturday.' }, { text: 'Minji’s wedding is on your calendar Saturday afternoon.', dim: true }],
      options: [
        { label: 'Come for dinner at 6', detail: 'The wedding ends around 4', done: 'Copied a reply for Mom (dinner at 6)', effect: { kind: 'copy', to: 'Mom', text: 'Mom, I’ll come by around 6 after the wedding on Saturday!' } },
        { label: 'Come for lunch at 12', detail: 'You can make it before the wedding', done: 'Copied a reply for Mom (lunch at 12)', effect: { kind: 'copy', to: 'Mom', text: 'Mom, I’ll come by around 12 on Saturday, before the wedding!' } },
        { label: 'Can’t make it this time', detail: 'Ask about next weekend', done: 'Copied a reply for Mom (next weekend)', effect: { kind: 'copy', to: 'Mom', text: 'Mom, I can’t make it this Saturday. How about next weekend?' } },
      ],
      recommended: 0,
      followUp: {
        work: 'Checked your calendar for Nov 29', workIcon: 'calendar', reply: 'You’re free on Sunday from noon. Here are new options.', recommended: 0,
        options: [
          { label: 'Ask about Sunday at 12:30', detail: 'If Mom says yes, it goes on your calendar', done: 'Copied a reply for Mom (Sunday 12:30)', effect: { kind: 'copy', to: 'Mom', text: 'Mom, I have a wedding on Saturday. How about Sunday lunch at 12:30?' } },
          { label: 'Ask about Sunday at 6', detail: 'The night before your Monday morning meeting', done: 'Copied a reply for Mom (Sunday at 6)', effect: { kind: 'copy', to: 'Mom', text: 'Mom, I have a wedding on Saturday. How about Sunday dinner at 6?' } },
        ],
      },
    },
    {
      id: 'c05', source: 'codex', who: 'Codex', meta: 'shop repo · Add a column to orders', due: { text: 'Changes production data', tone: 'risk' },
      question: 'Run this command on the production database?',
      summary: [{ text: 'Adds a “retry count” column to the orders table. Nothing is deleted.' }, { text: 'A rollback script is included. It hasn’t run on staging yet.', dim: true }],
      options: [
        { label: 'Run it on staging first', detail: 'You’ll be asked again before production', done: 'Told Codex to run the migration on staging first', effect: { kind: 'tell', to: 'Codex' } },
        { label: 'Allow just this once', detail: 'Runs on production now · asks you to confirm', risk: 'production', done: 'Allowed Codex’s production migration once', effect: { kind: 'tell', to: 'Codex' } },
        { label: 'Decline', detail: 'Codex skips this step and carries on', done: 'Declined Codex’s production migration', effect: { kind: 'tell', to: 'Codex' } },
      ],
      recommended: 0,
      context: { kind: 'command', cmd: '$ pnpm db:migrate --env production' },
    },
    {
      id: 'c06', source: 'slack', who: 'Dohyun Lee', meta: '#design · Slack · 8:40 AM', due: { text: 'This morning', tone: 'wait' },
      question: 'What time should tomorrow’s design review be?',
      summary: [{ text: 'Three mockups are up for review, and everyone wants to do it tomorrow.' }, { text: 'You’re free tomorrow at 11 AM and 2 PM.', dim: true }],
      evidence: ['14 messages', '3 mockups'],
      options: [
        { label: '11 AM', detail: 'All five people are free', done: 'Replied in #design: review tomorrow at 11 AM', effect: { kind: 'send', to: '#design', text: 'Let’s review tomorrow at 11! I’ll look at the three mockups before then.' } },
        { label: '2 PM', detail: 'Yuna will be 30 minutes late', done: 'Replied in #design: review tomorrow at 2 PM', effect: { kind: 'send', to: '#design', text: 'Let’s review tomorrow at 2! Yuna, join us at 2:30.' } },
        { label: 'Review in comments this time', detail: 'Everyone comments on the mockups', done: 'Replied in #design: review in comments this time', effect: { kind: 'send', to: '#design', text: 'Let’s review in comments this time. Please leave your notes on the mockups.' } },
      ],
      recommended: 0,
    },
    {
      id: 'c07', source: 'gmail', who: 'Daon Tax', meta: 'Gmail · you decided at 9:47', due: { text: 'Couldn’t send', tone: 'risk' },
      question: 'The VAT files didn’t go out. What now?',
      summary: [{ text: 'The 5 attachments add up to 31 MB, over Gmail’s 25 MB limit.' }, { text: 'Nothing has been sent. They’re due Wednesday.', dim: true }],
      options: [
        { label: 'Send a Google Drive link instead', detail: 'Only Daon’s contact can open it', done: 'Sent the VAT files to Daon Tax as a Drive link', effect: { kind: 'send', to: 'Daon Tax', text: 'Hello, the attachments were too large, so here is a Drive link to the 5 VAT files.' } },
        { label: 'Split it into two emails', detail: '3 sales files · 2 purchase files', done: 'Sent the VAT files to Daon Tax in two emails', effect: { kind: 'send', to: 'Daon Tax', text: 'Hello, I’m sending the VAT files in two emails: 3 sales files and 2 purchase files.' } },
        { label: 'I’ll send it myself', detail: 'Draft and attachments stay in Gmail drafts', done: 'Left the VAT email in your drafts', effect: { kind: 'none' } },
      ],
      recommended: 0,
    },
    {
      id: 'c08', source: 'github', who: 'Yuna Jung', meta: 'shop · PR #214 · review requested', due: { text: 'Waiting since yesterday', tone: 'wait' },
      question: 'Review the payments PR now?',
      summary: [{ text: 'Sends payment failure alerts to Slack. 6 files, tests passing.' }, { text: 'Yuna wants it in Friday’s release.', dim: true }],
      options: [
        { label: 'Review this afternoon', detail: 'Let Yuna know you’ll look later today', done: 'Told Yuna you’ll review PR #214 this afternoon', effect: { kind: 'send', to: 'Yuna', text: 'Yuna, I’ll review PR #214 this afternoon.' } },
        { label: 'Approve', detail: 'CI is all green', done: 'Approved PR #214', effect: { kind: 'change' } },
        { label: 'Hand it to Dohyun', detail: 'He co-wrote the payments module', done: 'Handed the PR #214 review to Dohyun', effect: { kind: 'send', to: 'Dohyun', text: 'Dohyun, could you review PR #214? Yuna wants it in Friday’s release.' } },
      ],
      recommended: 0,
    },
    {
      id: 'c09', source: 'gmail', who: 'Jihoon Choi', meta: 'Bluepoint · Gmail · 9:05 AM', due: { text: 'Before Thursday', tone: 'wait' },
      question: 'Share the IR folder with the investor?',
      summary: [{ text: 'He’d like to see metrics and financials before Thursday’s meeting.' }, { text: 'The IR folder mixes material from before and after an NDA.', dim: true }],
      options: [
        { label: 'Share the public deck only, view-only', detail: 'Financials after the NDA', done: 'Gave Jihoon view access to the public IR deck', effect: { kind: 'change' } },
        { label: 'Share the whole folder', detail: 'No NDA signed yet', risk: 'irreversible', done: 'Shared the whole IR folder with Jihoon', effect: { kind: 'change' } },
        { label: 'Say you’ll walk through it in the meeting', detail: 'Nothing gets shared', done: 'Told Jihoon you’ll walk through it in the meeting', effect: { kind: 'send', to: 'Jihoon', text: 'Hi Jihoon, I’ll walk you through the metrics and financials in Thursday’s meeting.' } },
      ],
      recommended: 0,
    },
    {
      id: 'c10', source: 'calendar', who: 'Yuna Jung', meta: '1:1 · Calendar · 8:20 AM', due: { text: 'Today 4 PM', tone: 'wait' },
      question: 'Yuna wants to move today’s 1:1 to tomorrow. When?',
      summary: [{ text: 'A customer meeting came up for her this afternoon.' }],
      options: [
        { label: 'Tomorrow at 10 AM', detail: 'You’re both free', done: 'Moved your 1:1 with Yuna to tomorrow 10 AM', effect: { kind: 'change', undo: true } },
        { label: 'Tomorrow at 4 PM', detail: 'Same time', done: 'Moved your 1:1 with Yuna to tomorrow 4 PM', effect: { kind: 'change', undo: true } },
        { label: 'Skip this week', detail: 'Make next week’s 30 minutes longer', done: 'Skipped this week’s 1:1 with Yuna', effect: { kind: 'change', undo: true } },
      ],
      recommended: 0,
    },
    {
      id: 'c11', source: 'slack', who: 'Dohyun Lee', meta: 'DM · Slack · 9:12 AM', due: { text: 'This week', tone: 'calm' },
      question: 'Dohyun wants Dec 24 off. Approve?',
      summary: [{ text: 'Nobody else on the team is out that day.' }, { text: 'There’s a release planned for the afternoon of the 24th.', dim: true }],
      options: [
        { label: 'Approve', detail: 'Yuna can take the release', done: 'Approved Dohyun’s day off on Dec 24', effect: { kind: 'send', to: 'Dohyun', text: 'Dohyun, the 24th is approved. Enjoy the day off!' } },
        { label: 'Suggest a half day', detail: 'Prep the release together in the morning', done: 'Suggested a half day to Dohyun', effect: { kind: 'send', to: 'Dohyun', text: 'Dohyun, there’s a release on the 24th. Could we prep it together that morning and you take the afternoon off?' } },
      ],
      recommended: 0,
    },
    {
      id: 'c12', source: 'gmail', who: 'AWS', meta: 'Billing alert · Gmail · 6:00 AM', due: { text: '92% of limit', tone: 'risk' },
      question: 'Raise this month’s AWS limit?',
      summary: [{ text: 'This month is tracking to $346, 92% of your $375 limit.' }, { text: 'Three test servers from last week are still running.', dim: true }],
      options: [
        { label: 'Shut down the 3 test servers', detail: 'Saves about $70 a month', done: 'Shut down 3 unused test servers', effect: { kind: 'change', undo: true } },
        { label: 'Raise the limit to $450', detail: 'Costs more · asks you to confirm', risk: 'money', done: 'Raised the AWS limit to $450', effect: { kind: 'change' } },
        { label: 'Leave it', detail: 'You’ll hear again if it hits the limit', done: 'Left the AWS limit as is', effect: { kind: 'none' } },
      ],
      recommended: 0,
    },
    {
      id: 'c13', source: 'claude', who: 'Claude Code', meta: 'shop repo · Clean up tests', due: { text: 'Waiting 5 min', tone: 'wait' },
      question: 'What should happen to the 3 flaky tests?',
      summary: [{ text: 'They fail depending on the time zone. The cause is date math.' }],
      evidence: ['11 failures', '2 files'],
      options: [
        { label: 'Fix them by pinning the time zone', detail: '2 files · about 5 min', done: 'Told Claude Code to pin the time zone in the tests', effect: { kind: 'tell', to: 'Claude Code' } },
        { label: 'Skip them and file an issue', detail: 'Doesn’t block today’s release', done: 'Told Claude Code to skip the 3 tests and file an issue', effect: { kind: 'tell', to: 'Claude Code' } },
      ],
      recommended: 0,
    },
    {
      id: 'c14', source: 'kakao', who: 'College friends', meta: 'From a chat you uploaded · yesterday', due: { text: 'Closes Friday', tone: 'calm' },
      question: 'Year-end dinner: which date do you vote for?',
      summary: [{ text: 'It’s between Fri Dec 19 and Sat Dec 20.' }, { text: 'You have a team dinner on the evening of the 19th.', dim: true }],
      options: [
        { label: 'Saturday the 20th', detail: 'Your calendar is free', done: 'Copied a reply for College friends (the 20th)', effect: { kind: 'copy', to: 'College friends', text: 'Saturday the 20th works for me!' } },
        { label: 'Friday the 19th', detail: 'Clashes with the team dinner', done: 'Copied a reply for College friends (the 19th)', effect: { kind: 'copy', to: 'College friends', text: 'I vote for Friday the 19th!' } },
      ],
      recommended: 0,
    },
    {
      id: 'c15', source: 'gmail', who: 'Haeun Kim', meta: 'Candidate · Gmail · yesterday 7:30 PM', due: { text: 'By tomorrow', tone: 'wait' },
      question: 'When should the designer interview be?',
      summary: [{ text: 'Haeun is free Tue, Wed and Thu afternoons next week.' }, { text: 'Both interviewers are free Wednesday at 3.', dim: true }],
      options: [
        { label: 'Wednesday at 3 PM', detail: 'Both interviewers are free', done: 'Sent Haeun an interview invite for Wed 3 PM', effect: { kind: 'send', to: 'Haeun', text: 'Hi Haeun, how about next Wednesday at 3 PM for the interview? I’ll send an invite if that works.' } },
        { label: 'Thursday at 4 PM', detail: 'Only Yuna is free', done: 'Sent Haeun an interview invite for Thu 4 PM', effect: { kind: 'send', to: 'Haeun', text: 'Hi Haeun, how about next Thursday at 4 PM for the interview? I’ll send an invite if that works.' } },
      ],
      recommended: 0,
    },
    {
      id: 'c16', source: 'codex', who: 'Codex', meta: 'shop repo · Upgrade dependencies', due: { text: 'Waiting 3 min', tone: 'wait' },
      question: 'Upgrade React to 19.3?',
      summary: [{ text: 'This version includes a security fix. Only the lockfile changes.' }, { text: 'All 212 tests pass.', dim: true }],
      options: [
        { label: 'Upgrade', detail: 'Open it as a PR', done: 'Told Codex to open a PR upgrading React to 19.3', effect: { kind: 'tell', to: 'Codex' } },
        { label: 'Next week', detail: 'After this week’s release', done: 'Pushed the React upgrade to next week', effect: { kind: 'tell', to: 'Codex' } },
      ],
      recommended: 0,
    },
    {
      id: 'c17', source: 'slack', who: 'Support', meta: '#support · Slack · 9:30 AM', due: { text: 'A customer is waiting', tone: 'wait' },
      question: 'A customer was charged twice. How should we reply?',
      summary: [{ text: 'The same order went through twice. $29 each.' }, { text: 'The duplicate shows up in the payment log.', dim: true }],
      options: [
        { label: 'Reply that we’re looking into it', detail: 'The on-call person refunds it today', done: 'Replied in #support that we’re looking into it', effect: { kind: 'send', to: '#support', text: 'We’re looking into the double charge. The on-call person will refund it today.' } },
        { label: 'Refund one charge now', detail: '$29 · asks you to confirm', risk: 'money', done: 'Refunded the duplicate $29 charge', effect: { kind: 'change' } },
      ],
      recommended: 0,
    },
    {
      id: 'c18', source: 'gmail', who: 'Oneul Supply', meta: 'Vendor · Gmail · yesterday', due: { text: 'This week', tone: 'calm' },
      question: 'They want the November tax invoice. What should you say?',
      summary: [{ text: 'Two November deliveries, $2,500 in total.' }],
      options: [
        { label: 'Issue it today', detail: 'You’ll file it on Hometax yourself', done: 'Told Oneul Supply the invoice goes out today', effect: { kind: 'send', to: 'Oneul Supply', text: 'Hello, I’ll issue the November tax invoice today.' } },
        { label: 'Issue it at month end', detail: 'You’ll get a reminder on Dec 1', done: 'Told Oneul Supply the invoice goes out at month end', effect: { kind: 'send', to: 'Oneul Supply', text: 'Hello, I’ll issue the November tax invoice at month end.' } },
      ],
      recommended: 0,
    },
    {
      id: 'c19', source: 'gmail', who: 'Frontend Conference', meta: 'Gmail · 2 days ago', due: { text: 'By Friday', tone: 'calm' },
      question: 'Accept the invitation to speak?',
      summary: [{ text: 'Feb 20, a 20-minute talk. Any topic.' }, { text: 'Your launch is the third week of February.', dim: true }],
      options: [
        { label: 'Politely decline', detail: 'It’s launch week', done: 'Politely declined the conference talk', effect: { kind: 'send', to: 'Frontend Conference', text: 'Thank you for the invitation. It falls on our launch week, so I’ll have to pass this time.' } },
        { label: 'Say yes', detail: 'Pick a topic later', done: 'Accepted the conference talk', effect: { kind: 'send', to: 'Frontend Conference', text: 'Thank you for the invitation. I’d be glad to speak. I’ll follow up with a topic.' } },
      ],
      recommended: 0,
    },
    {
      id: 'c20', source: 'gmail', who: 'Landlord', meta: 'Gmail · yesterday 6:10 PM', due: { text: 'By Dec 10', tone: 'risk' },
      question: 'Lease renewal: how should you respond?',
      summary: [{ text: 'Same deposit, but rent goes up by $40 a month.' }, { text: 'Still below similar places nearby.', dim: true }],
      options: [
        { label: 'Counter with $25', detail: 'You’ll get a card when they reply', done: 'Offered the landlord a $25 increase', effect: { kind: 'send', to: 'the landlord', text: 'Hello, I’d like to renew. Could we make the rent increase $25?' } },
        { label: 'Agree to $40', detail: 'Costs more · asks you to confirm', risk: 'money', done: 'Agreed to the $40 rent increase', effect: { kind: 'send', to: 'the landlord', text: 'Hello, I agree to renew with the $40 rent increase.' } },
      ],
      recommended: 0,
    },
  ],
  fyi: [
    { id: 'f01', source: 'slack', title: '#product — December launch is set for Dec 9', sub: 'Dohyun and 4 others · 23 messages, summarized' },
    { id: 'f02', source: 'github', title: '3 PRs merged, and the nightly deploy went fine', sub: 'shop · reviewed by Yuna' },
    { id: 'f03', source: 'gmail', title: 'AWS November estimate is $312', sub: 'Up 8% from last month · within your limit' },
    { id: 'f04', source: 'kakao', title: 'College friends — voting on a date for the year-end dinner', sub: 'From a chat you uploaded · you haven’t voted yet' },
    { id: 'f05', source: 'calendar', title: 'Wednesday’s dentist moved from 2 PM to 3 PM', sub: 'Nothing else is booked then' },
  ],
  runs: [
    { title: 'Add payment retries', agent: 'Claude Code', status: 'Waiting on you', waiting: true },
    { title: 'Draft weekly report', agent: 'Codex', status: 'Running 6 min' },
    { title: 'Sort 41 overnight emails', agent: 'Assistant', status: 'Done at 8:55' },
  ],
  routines: [
    { id: 'r1', icon: 'calendar', title: 'Accept recurring team meeting invites', sub: 'Turned on after you said yes 5 times · used 8 times this month', on: true },
    { id: 'r2', icon: 'terminal', title: 'Let coding agents run tests', sub: 'Claude Code · Codex · used 41 times this month', on: true },
    { id: 'r3', icon: 'archive', title: 'Archive newsletters unread', sub: 'Turned on after you said yes 5 times · 212 this month', on: true },
    { id: 'r4', icon: 'money', title: 'Always ask before any payment, whatever the amount', sub: 'Set by you · can’t be turned off', on: true, locked: true },
  ],
  autoDone: [
    { id: 'a1', source: 'archive', title: 'Archived 19 newsletters and promos', sub: 'Rule · archive newsletters unread', time: '8:55 AM', min: 535, undo: true },
    { id: 'a2', source: 'calendar', title: 'Accepted 2 recurring team meeting invites', sub: 'Rule · you said yes the last 5 times', time: '8:52 AM', min: 532, undo: true },
    { id: 'a3', source: 'gmail', title: 'Filed 2 receipts under “November spending”', sub: 'Coupang $29 · Kakao T $9', time: '8:50 AM', min: 530, undo: true },
  ],
  sources: [
    { source: 'gmail', name: 'Gmail', count: 41 }, { source: 'slack', name: 'Slack', count: 63 }, { source: 'kakao', name: 'KakaoTalk channel', count: 2 },
    { source: 'calendar', name: 'Calendar', count: 5 }, { source: 'github', name: 'GitHub', count: 9 }, { source: 'claude', name: 'Claude Code', count: 2 }, { source: 'codex', name: 'Codex', count: 3 },
  ],
};
