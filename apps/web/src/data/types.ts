// 카드와 그 둘레의 자료 모양 — docs/design/decision-inbox/design.md 7장의 카드를 프로토타입에 맞게 줄였어요.
export type Lang = 'ko' | 'en';
export type Source = 'gmail' | 'calendar' | 'slack' | 'kakao' | 'github' | 'claude' | 'codex' | 'local';
export type Risk = 'low' | 'money' | 'production' | 'irreversible';

export interface Option {
  label: string;
  detail: string;
  risk?: Risk;
  /** 실행하면 처리 기록에 남는 한 줄 */
  done: string;
  effect: Effect;
}

export interface CodeChange { file: string; add: number; del: number; files: number; lines: { t: 'add' | 'del' | 'ctx'; s: string }[] }

/** 고르면 일어나는 일 — 선택지마다 하나. 보여 준 글(text)이 곧 실행하는 글이에요
 *  send 밖으로 보내요 · copy 누르는 순간 복사만 해요 · tell 에이전트에게 답을 전해요 · change 밖의 것을 바꿔요 · none 기록만 남겨요 */
export type Effect =
  | { kind: 'send'; to: string; text: string }
  | { kind: 'copy'; to: string; text: string }
  | { kind: 'tell'; to: string; text?: string; code?: CodeChange }
  | { kind: 'change'; undo?: true }
  | { kind: 'none' };

/** 정하기 전에 보여 주는 자료 — 실행되지 않아요 */
export type Context =
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
  /** 같은 사람 · 같은 일에 대해 비서가 기억하는 것(실제 모드) */
  remembered?: string[];
  context?: Context;
  /** 서버가 만든 주고받기와 새 선택지(실제 모드) */
  talk?: { options: Option[]; recommended: number; exchanges: { said: string; work: string; reply: string; icon: 'chat' }[] };
  /** 주관식으로 답하면 비서가 다시 만들어 오는 선택지(첫 번째 주고받기) */
  followUp?: { reply: string; work: string; workIcon?: 'calendar' | 'file'; options: Option[]; recommended: number };
}

export interface FyiItem { id: string; source: Source; title: string; sub: string }
export interface Run { id?: string; title: string; agent: string; status: string; waiting?: boolean }
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
