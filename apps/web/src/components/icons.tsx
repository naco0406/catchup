import {
  Archive, ArrowLeft, Bell, GearSix, Info, Keyboard, Paperclip, PushPin, SignOut, Translate, ArrowRight, ArrowUp, ArrowUUpLeft, Brain, ClockCounterClockwise, CalendarBlank, CalendarCheck, Cards, CaretRight, ChatCircle, Check, CheckCircle, Clock, Code, Copy,
  CurrencyDollar, EnvelopeSimple, FilePdf, FileText, Image, GitBranch, GithubLogo, HandTap, Lightning, List, ListChecks, LockSimple, MagnifyingGlass,
  Microphone, PaperPlaneTilt, PlugsConnected, Receipt, Rows, ShieldCheck, SidebarSimple, SlackLogo, TerminalWindow, Warning, X,
} from '@phosphor-icons/react';
import type { Source } from '../data/types';
import sprite from '@catchup/design-system/sprite.svg?raw';

// 아이콘은 Phosphor(regular) 하나만 써요 — 디자인 시스템 README 의 아이콘 규칙.
export const I = {
  archive: Archive, brain: Brain, history: ClockCounterClockwise, left: ArrowLeft, right: ArrowRight, up: ArrowUp, undo: ArrowUUpLeft, calendar: CalendarBlank, calendarCheck: CalendarCheck, cards: Cards, caret: CaretRight,
  chat: ChatCircle, check: Check, checkCircle: CheckCircle, clock: Clock, code: Code, copy: Copy, money: CurrencyDollar, mail: EnvelopeSimple,
  file: FileText, pdf: FilePdf, image: Image, branch: GitBranch, github: GithubLogo, hand: HandTap, bolt: Lightning, list: List, listChecks: ListChecks, lock: LockSimple,
  search: MagnifyingGlass, mic: Microphone, send: PaperPlaneTilt, receipt: Receipt, rows: Rows, shield: ShieldCheck, sidebar: SidebarSimple,
  slack: SlackLogo, plug: PlugsConnected, terminal: TerminalWindow, warning: Warning, close: X,
  bell: Bell, gear: GearSix, info: Info, keyboard: Keyboard, clip: Paperclip, pin: PushPin, signOut: SignOut, translate: Translate,
};

const bySource: Record<Source, typeof Archive> = { gmail: EnvelopeSimple, calendar: CalendarBlank, slack: SlackLogo, kakao: ChatCircle, github: GithubLogo, claude: TerminalWindow, codex: Code, local: ChatCircle };
export function SourceIcon({ source }: { source: Source | 'archive' }) {
  const C = source === 'archive' ? Archive : bySource[source];
  return <C aria-hidden />;
}

/** 로고 · 캐릭터 스프라이트를 문서에 한 번 넣어요 */
export function Sprite() {
  return <div aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: sprite }} />;
}
export const Mark = ({ small }: { small?: boolean }) => <svg aria-hidden><use href={small ? '#cu-mark-small' : '#cu-mark'} /></svg>;
export const Mascot = ({ face }: { face: 'basic' | 'thinking' | 'done' | 'worried' }) => <svg aria-hidden><use href={`#cu-mascot-${face}`} /></svg>;
