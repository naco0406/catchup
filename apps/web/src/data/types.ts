// 카드와 그 둘레의 자료 모양 — docs/design/decision-inbox/design.md 7장의 카드를 프로토타입에 맞게 줄였어요.
export type Lang = 'ko' | 'en';
export type Source = 'gmail' | 'calendar' | 'slack' | 'kakao' | 'github' | 'claude' | 'codex';
export type Risk = 'low' | 'money' | 'production' | 'irreversible';

export interface Option {
  label: string;
  detail: string;
  risk?: Risk;
  /** 실행하면 처리 기록에 남는 한 줄 */
  done: string;
}

/** 고르면 일어나는 일 — 카드마다 하나 */
export type Effect =
  | { kind: 'reply'; to: string; text: string; copy?: boolean }
  | { kind: 'code'; file: string; add: number; del: number; files: number; lines: { t: 'add' | 'del' | 'ctx'; s: string }[] }
  | { kind: 'command'; cmd: string }
  | { kind: 'slots'; slots: { time: string; name: string; who: string; isNew?: boolean }[] };

export interface Card {
  id: string;
  source: Source;
  who: string;
  meta: string;
  due?: { text: string; tone: 'wait' | 'calm' | 'risk' };
  question: string;
  summary: { text: string; strong?: string; dim?: boolean }[];
  evidence?: string[];
  options: Option[];
  recommended: number;
  effect?: Effect;
  /** 주관식으로 답하면 비서가 다시 만들어 오는 선택지(첫 번째 주고받기) */
  followUp?: { reply: string; work: string; workIcon?: 'calendar' | 'file'; options: Option[]; recommended: number; preview?: string };
}

export interface FyiItem { id: string; source: Source; title: string; sub: string }
export interface Run { title: string; agent: string; status: string; waiting?: boolean }
export interface Routine { id: string; title: string; sub: string; on: boolean; locked?: boolean; icon: 'calendar' | 'terminal' | 'archive' | 'money' }
export interface SeedEntry { id: string; source: Source | 'archive'; title: string; sub: string; time: string; /** 오늘 몇 시 몇 분(분) — 처리 기록을 시간순으로 섞을 때 */ min: number; undo?: boolean; failed?: boolean }

export interface Dataset {
  cards: Card[];
  /** 처음 덱에 오는 카드(나머지는 '카드 더 받기'로 와요) */
  today: string[];
  fyi: FyiItem[];
  runs: Run[];
  routines: Routine[];
  autoDone: SeedEntry[];
  sources: { source: Source; name: string; count: number }[];
}
