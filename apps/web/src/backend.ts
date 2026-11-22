import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { datasets, getCard as findCard } from './data';
import type { Card, Dataset, Lang } from './data/types';
import type { ApiSession } from './live/api';
import { useLive } from './live/useLive';
import { initial, reduce, restore, type Action, type State } from './state/store';
import { memoriesOf, recallFor, type Memory } from './state/memory';

/** 화면에 상태를 대는 쪽. 예시(소개 페이지 · 프로토타입)와 실제(서버)가 같은 모양이에요 */
export interface Backend {
  live: boolean;
  /** 코딩 세션(실제 모드) */
  sessions: ApiSession[];
  s: State;
  ds: Dataset;
  act: (a: Action) => void;
  getCard: (id: string) => Card | undefined;
  /** 비서가 아는 것(예시 모드). 실제 모드는 화면이 서버에서 읽어요 */
  memories?: Memory[];
  auth: 'checking' | 'in' | 'out';
  offline: boolean;
  error?: { text: string; n: number };
  refresh: () => Promise<void>;
  logout: () => void;
}

const KEY = 'catchup-proto-v1';

/** 주소로 여는 방법 — 소개 페이지가 프로토타입을 품을 때 써요. ?start=1 처음 화면을 건너뛰어요 · ?reset=1 처음부터 다시 */
function fromUrl(s: State, today: string[]): State {
  const q = new URLSearchParams(location.search);
  let out = s;
  if (q.get('reset') === '1') out = reduce(out, { type: 'reset', today });
  if (q.get('start') === '1' && !out.started) out = reduce(out, { type: 'start' });
  if (q.has('reset') || q.has('start')) { q.delete('reset'); q.delete('start'); history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`); }
  return out;
}

function load(today: string[]): State {
  // 기다리던 답은 남은 시간만큼 더 기다려요. 이미 10초가 지난 것만 실행된 것으로 남겨요
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw) as State; if (Array.isArray(s.deck) && s.progress) return restore(s, Date.now()); } } catch { /* 처음부터 */ }
  return initial(today);
}

const idle = async () => undefined;
const NO_SESSIONS: ApiSession[] = [];

function useSample(): Backend {
  const { t, i18n } = useTranslation();
  const ds = datasets[(i18n.language as Lang) in datasets ? (i18n.language as Lang) : 'en'];
  const [s, act] = useReducer(reduce, ds.today, today => fromUrl(load(today), today));
  // 저장 — 막혀 있으면 이 화면에서만 기억해요
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 무시 */ } }, [s]);
  const plain = useCallback((id: string) => findCard(ds, t, id), [ds, t]);
  const memories = useMemo(() => memoriesOf(s, plain, t), [s, plain, t]);
  // 같은 사람 · 같은 일의 지난 결정을 카드에 붙여요(서버의 remembered 와 같아요)
  const getCard = useCallback((id: string) => { const c = plain(id); if (!c) return c; const remembered = recallFor(memories, c); return remembered.length ? { ...c, remembered } : c; }, [plain, memories]);
  return { live: false, sessions: NO_SESSIONS, s, ds, act, getCard, memories, auth: 'in', offline: false, refresh: idle, logout: idle };
}

/** 구울 때 정해져요(vite --mode live). 예시 자료로 도는 소개 페이지의 앱은 서버를 부르지 않아요 */
export const useBackend: () => Backend = import.meta.env.MODE === 'live' ? useLive : useSample;
