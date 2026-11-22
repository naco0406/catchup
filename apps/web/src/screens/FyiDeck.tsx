import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Dataset, FyiItem } from '../data/types';
import { stateOf, type State } from '../state/store';
import { I, SourceIcon } from '../components/icons';
import { Toast, type ToastView } from '../components/Toast';
import { useDeck, type Pull } from '../components/useDeck';
import { Empty } from './Pages';

/** 읽은 뒤 토스트에서 되돌릴 수 있는 시간 */
const UNDO_MS = 5_000;

/** 알려만 드려요 — 결정이 없는 소식을 한 장씩 넘겨요(Q7 · docs/design/swipe-deck 10장).
 *  오른쪽으로 밀면 읽음, 왼쪽으로 밀면 나중에(읽음으로 치지 않고 맨 뒤로). 손동작과 단추의 자리는 캐치업과 같아요.
 *  추천 답이 없어서 빨강을 쓰지 않아요. */
export function FyiDeck({ s, ds, onMenu, onPromote, onRead, onUnread, toast, later, setLater }: {
  s: State; ds: Dataset; onMenu: () => void;
  onPromote: (id: string) => void; onRead: (id: string) => void; onUnread: (id: string) => void;
  /** 앱이 알릴 것(서버에 다시 잇는 중 등) */
  toast: ToastView | null;
  /** 나중에 보기로 한 것 — 다른 화면에 다녀와도 맨 뒤에 있어요. 서버에는 안 읽음 그대로예요 */
  later: string[]; setLater: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const [done, setDone] = useState<{ id: string; title: string; at: number } | null>(null);
  const open = ds.fyi.filter(f => stateOf(s, f.id) === 'open' && !s.deck.includes(`p-${f.id}`));
  const order = [...open.filter(f => !later.includes(f.id)), ...later.flatMap(id => open.filter(f => f.id === id))];
  const f = order[0], next = order[1];
  const api = useRef<ReturnType<typeof useDeck> | null>(null);

  const read = () => {
    if (!f) return;
    api.current?.capture(1);
    const at = Date.now();
    onRead(f.id);
    setDone({ id: f.id, title: f.title, at });
    setTimeout(() => setDone(x => (x?.at === at ? null : x)), UNDO_MS);
  };
  const putOff = () => {
    if (!f || !next) return;
    api.current?.capture(-1);
    setLater([...later.filter(x => x !== f.id), f.id]);
  };
  const promote = () => { if (f) { api.current?.capture(-1); onPromote(f.id); } };
  const undo = () => { if (done) { onUnread(done.id); setLater(later.filter(x => x !== done.id)); setDone(null); } };

  const deck = useDeck({ cardId: f?.id ?? '', can: { left: Boolean(next), right: Boolean(f) }, onLeft: putOff, onRight: read, rightKey: f?.id ?? '' });
  api.current = deck;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 소식이 바뀔 때 한 번만 정해요
  const arrive = useMemo(() => deck.arrival(f?.id ?? ''), [f?.id]);

  // 키보드 — → 읽음 · ← 나중에 · Z 되돌리기
  const keys = useRef({ read, putOff, undo });
  keys.current = { read, putOff, undo };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); keys.current.read(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); keys.current.putOff(); }
      else if (e.key.toLowerCase() === 'z') keys.current.undo();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const say: ToastView | null = deck.pull ? pullToast(deck.pull, t)
    : done ? { text: t('toast.read'), sub: done.title, icon: 'check', undo }
    : toast;
  const toastEl = say && <Toast v={say} />;
  // 누른 단추에 초점 테두리가 남지 않게
  const tap = (fn: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.blur(); fn(); };

  return (
    <>
      <div className="cu-top deck-top-bar">
        <span className="ttl"><button type="button" className="cu-ib menu" onClick={onMenu} aria-label={t('side.menu')}><I.list aria-hidden /></button><h1>{t('fyi.title')}</h1>{f && <span className="left">{t('fyi.sub', { count: order.length })}</span>}</span>
        {say ? <div className="top-toast" aria-live="polite">{toastEl}</div> : <span />}
        <span className="tools" />
      </div>
      {f ? (
        <div className="scroll">
          <div className="cu-stage">
            <div className="cu-deck" ref={deck.deckRef} {...deck.handlers}>
              {next && <div className="deck-next" inert aria-hidden><News key={next.id} f={next} /></div>}
              <div key={f.id} className={`deck-top ${arrive}`}><News f={f} top /></div>
              {order.length > 1 && <div className="cu-peek p1" />}
              {order.length > 2 && <div className="cu-peek p2" />}
            </div>
            <div className="cu-acts">
              <button type="button" className="cu-btn ghost act-l" onClick={tap(putOff)} disabled={!next} aria-keyshortcuts="ArrowLeft"><span className="cu-kbd">←</span>{t('fyi.later')}</button>
              <button type="button" className="cu-btn ghost act-m" onClick={tap(promote)}><I.cards aria-hidden />{t('fyi.promote')}</button>
              <span className="sp" />
              <button type="button" className="cu-btn ghost act-r ink" onClick={tap(read)} aria-keyshortcuts="ArrowRight">{t('fyi.read')}<span className="cu-kbd">→</span></button>
            </div>
          </div>
        </div>
      ) : <div className="cu-page"><div className="cu-page-in"><Empty text={t('fyi.allRead')} /></div></div>}
      <div className="phone-dock">
        {toastEl && <div className="dock-toast" aria-live="polite">{toastEl}</div>}
        {f && (
          <div className="cu-pacts">
            <button type="button" className="act-l" onClick={tap(putOff)} disabled={!next}><I.left aria-hidden />{t('fyi.later')}</button>
            <button type="button" className="act-m" onClick={tap(promote)}><I.cards aria-hidden />{t('fyi.promote')}</button>
            <button type="button" className="act-r ink" onClick={tap(read)}>{t('fyi.read')}<I.right aria-hidden /></button>
          </div>
        )}
      </div>
    </>
  );
}

/** 소식 한 장 — 어디서 왔는지, 무슨 일인지, 한 줄 덧붙임. 고를 답이 없어요 */
function News({ f, top }: { f: FyiItem; top?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="cu-card" data-fyi={top ? f.id : undefined}>
      <div className="cu-from"><span className="cu-tile"><SourceIcon source={f.source} /></span><span className="who">{t(`src.${f.source}`)}</span><span className="sp" /><span className="cu-due calm">{t('nav.fyi')}</span></div>
      <h2 className="cu-ask">{f.title}</h2>
      {f.sub && <ul className="cu-sum"><li className="dim">{f.sub}</li></ul>}
    </div>
  );
}

/** 미는 동안 토스트 자리에 미리 서는 말 */
function pullToast(pull: Pull, t: ReturnType<typeof useTranslation>['t']): ToastView {
  if (pull.blocked) return { text: t('swipe.lastOne'), icon: 'clock', ring: 0, preview: true };
  const ring = pull.armed ? 'full' : 'pull';
  return pull.side === 'right'
    ? { text: t(pull.armed ? 'swipe.readArmed' : 'swipe.read'), sub: t('swipe.readSub'), icon: 'check', ring, preview: true }
    : { text: t(pull.armed ? 'swipe.laterArmed' : 'swipe.later'), sub: t('swipe.laterSub'), icon: 'clock', ring, preview: true };
}
