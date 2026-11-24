// 실제 모드 — 서버가 정본이에요. 화면의 동작(Action)을 API 로 옮기고, 바뀌면 SSE 로 듣고 다시 읽어요.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Backend } from '../backend';
import { draftKey, type Action } from '../state/store';
import { ApiError, call, newKey, type ApiActivity, type ApiList, type ApiReceipt, type ApiSession } from './api';
import { build, localKey, snoozeUntil, type Device, type Snapshot } from './map';

const EMPTY: Snapshot = { open: [], snoozed: [], activity: [], sessions: [], at: 0 };
const surface = () => (Math.min(innerWidth, innerHeight) < 600 ? 'iphone' : matchMedia('(pointer: coarse)').matches ? 'ipad' : 'web');

export function useLive(): Backend {
  const { t, i18n } = useTranslation();
  const [auth, setAuth] = useState<Backend['auth']>('checking');
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<{ text: string; n: number }>();
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [device, setDevice] = useState<Device>({ confirm: {}, drafts: {}, front: [], leaving: new Set() });
  const cursor = useRef<number | undefined>(undefined);
  const turn = useRef(0);
  const sending = useRef(new Map<string, Promise<string | undefined>>());
  const snapRef = useRef(snap); snapRef.current = snap;
  const deviceRef = useRef(device); deviceRef.current = device;

  const refresh = useCallback(async () => {
    const mine = ++turn.current;
    try {
      const [open, snoozed, activity, sessions] = await Promise.all([
        call<ApiList>('GET', '/me/cards?state=open'), call<ApiList>('GET', '/me/cards?state=snoozed'), call<ApiActivity[]>('GET', '/me/activity'),
        call<ApiSession[]>('GET', '/me/agent-sessions'),
      ]);
      if (mine !== turn.current) return; // 늦게 온 옛 목록
      cursor.current ??= open.cursor;
      setSnap({ open: open.cards, snoozed: snoozed.cards, activity, sessions, at: Date.now() });
      setAuth('in'); setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { cursor.current = undefined; setAuth('out'); setSnap(EMPTY); } else setOffline(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  // 언어 잇기 — 화면의 언어가 계정의 언어예요. 토마토가 쓰는 글(카드, 답, 초안)이 그 언어로 나와요.
  // 로그인하면 한 번 맞추고, 화면에서 언어를 바꾸면 따라 바꿔요. 서버가 아직 이 주소를 모르면 조용히 넘어가요.
  useEffect(() => {
    if (auth !== 'in') return;
    let here = true;
    const push = (lang: string) => { void call('PUT', '/me', { lang }).catch(() => undefined); };
    void call<{ lang: string }>('GET', '/me').then(me => { if (here && me.lang !== i18n.language) push(i18n.language); }, () => undefined);
    i18n.on('languageChanged', push);
    return () => { here = false; i18n.off('languageChanged', push); };
  }, [auth, i18n]);
  // 처음 못 닿았으면 닿을 때까지
  useEffect(() => {
    if (!offline) return;
    const again = setInterval(() => void refresh(), 3000);
    return () => clearInterval(again);
  }, [offline, refresh]);

  useEffect(() => {
    if (auth !== 'in') return;
    let soon: ReturnType<typeof setTimeout> | undefined;
    const es = new EventSource(`/v1/me/cards/stream${cursor.current === undefined ? '' : `?after=${cursor.current}`}`);
    const later = () => { clearTimeout(soon); soon = setTimeout(() => void refresh(), 60); };
    es.addEventListener('change', e => { cursor.current = Number((e as MessageEvent).lastEventId); later(); });
    es.onopen = later;
    es.onerror = () => { setOffline(true); later(); };
    const back = () => { if (document.visibilityState === 'visible') later(); };
    document.addEventListener('visibilitychange', back);
    return () => { es.close(); clearTimeout(soon); document.removeEventListener('visibilitychange', back); };
  }, [auth, refresh]);

  const fail = useCallback((e: unknown) => {
    const status = e instanceof ApiError ? e.status : -1;
    const code = e instanceof ApiError ? e.code : '';
    if (status === 401) setAuth('out');
    const text = status === 0 ? t('live.offline') : code === 'too_late' ? t('live.tooLate') : status === 409 ? t('live.conflict') : t('live.error');
    setError({ text, n: Date.now() });
  }, [t]);

  /** 카드를 덱에서 먼저 빼고 보내요. 실패하면 돌아와요 */
  const leave = useCallback((id: string, send: () => Promise<string | undefined>) => {
    if (sending.current.has(id)) return;
    setDevice(d => ({ ...d, leaving: new Set([...d.leaving, id]) }));
    const job = send().catch(e => { fail(e); return undefined; });
    sending.current.set(id, job);
    void job.then(refresh).finally(() => {
      sending.current.delete(id);
      setDevice(d => ({ ...d, leaving: new Set([...d.leaving].filter(x => x !== id)) }));
    });
  }, [fail, refresh]);

  const act = useCallback((a: Action) => {
    const now = snapRef.current;
    const find = (id: string) => now.open.find(c => c.id === id);
    const post = (path: string, body: unknown) => { void call('POST', path, body).catch(fail).then(refresh); };
    switch (a.type) {
      case 'pick': {
        const c = find(a.cardId); if (!c) return;
        const key = localKey(c);
        const local = deviceRef.current;
        if (a.risky && !a.confirmed && local.confirm[key] !== a.pick) { setDevice(d => ({ ...d, confirm: { ...d.confirm, [key]: a.pick } })); return; }
        const said = c.turns.map(x => x.said);
        const draft = local.drafts[key]?.[draftKey({ state: 'open', turns: said }, a.pick)];
        const body = { request_key: newKey(), version: c.version, turn_seq: c.turns.at(-1)?.seq ?? 0, option: a.pick, draft, confirmed: a.risky, surface: surface() };
        leave(c.id, async () => (await call<ApiReceipt>('POST', `/me/cards/${c.id}/answer`, body)).id);
        return;
      }
      case 'snooze': case 'handoff': {
        const c = find(a.cardId); if (!c) return;
        const body = { request_key: newKey(), version: c.version, surface: surface(), until: a.type === 'snooze' ? snoozeUntil(a.now).toISOString() : undefined };
        leave(c.id, async () => { await call('POST', `/me/cards/${c.id}/${a.type}`, body); return undefined; });
        return;
      }
      case 'read': {
        const c = find(a.fyiId); if (!c) return;
        const body = { request_key: newKey(), version: c.version, surface: surface() };
        leave(c.id, async () => { await call('POST', `/me/cards/${c.id}/read`, body); return undefined; });
        return;
      }
      case 'unread': {
        void (async () => {
          // 읽음이 아직 가는 중이면 닿은 다음에 되돌려요
          try { await sending.current.get(a.fyiId); await call('POST', `/me/cards/${a.fyiId}/undo`, {}); } catch (e) { fail(e); }
          await refresh();
        })();
        return;
      }
      case 'undo': {
        void (async () => {
          try {
            const waiting = build(now, deviceRef.current, t, i18n.language).s.pending;
            const id = a.cardId ?? waiting.at(-1)?.cardId;
            if (!id) return;
            // 보내는 중이면 영수증을 받은 다음 그 실행만 되돌려요
            const inFlight = sending.current.get(id);
            const receipt = inFlight ? await inFlight : waiting.find(p => p.cardId === id)?.receipt;
            if (receipt) await call('POST', `/me/cards/${id}/undo`, { receipt });
          } catch (e) { fail(e); }
          await refresh();
        })();
        return;
      }
      case 'undoEntry': {
        const e = now.activity.find(x => x.id === a.entryId);
        if (e) post(`/me/cards/${e.card}/undo`, e.receipt ? { receipt: e.receipt } : {});
        return;
      }
      case 'unsnooze': post(`/me/cards/${a.cardId}/undo`, {}); return;
      case 'say': post(`/me/cards/${a.cardId}/turns`, { request_key: newKey(), text: a.text }); return;
      case 'promote': post(`/me/cards/${a.fyiId}/promote`, {}); return;
      case 'draft': {
        const c = find(a.cardId); if (!c) return;
        const key = localKey(c);
        const drafts = { ...deviceRef.current.drafts, [key]: { ...deviceRef.current.drafts[key], [a.key]: a.text } };
        deviceRef.current = { ...deviceRef.current, drafts }; // 고치자마자 답을 눌러도 고친 글로
        setDevice(d => ({ ...d, drafts }));
        return;
      }
      case 'focus': setDevice(d => ({ ...d, front: [a.cardId, ...d.front.filter(x => x !== a.cardId)] })); return;
      case 'commit': void refresh(); return;
      default: return; // 예시 모드에만 있는 동작
    }
  }, [fail, i18n.language, leave, refresh, t]);

  const built = useMemo(() => build(snap, device, t, i18n.language), [snap, device, t, i18n.language]);
  const getCard = useCallback((id: string) => built.cards.get(id), [built]);
  const logout = useCallback(() => { void call('DELETE', '/auth/session').then(() => { setAuth('out'); setSnap(EMPTY); cursor.current = undefined; }, fail); }, [fail]);

  return { live: true, sessions: snap.sessions, s: built.s, ds: built.ds, act, getCard, auth, offline, error, refresh, logout };
}
