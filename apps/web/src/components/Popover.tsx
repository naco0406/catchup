import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I } from './icons';

/** 바깥을 누르거나 Esc 를 누르면 닫혀요 */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    addEventListener('keydown', key, true); addEventListener('pointerdown', down, true);
    return () => { removeEventListener('keydown', key, true); removeEventListener('pointerdown', down, true); };
  }, [open, close]);
  return ref;
}

/** <Popover> ⓘ — 늘 보일 필요가 없는 설명은 단추 뒤에 둬요. 누르면 그 아래에 떠요 */
export function InfoPop({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="cu-pop-anchor" ref={ref}>
      <button type="button" className={`cu-ib info${open ? ' on' : ''}`} onClick={() => setOpen(x => !x)} aria-expanded={open} aria-controls={id} aria-label={label}><I.info aria-hidden /></button>
      {open && <div className="cu-pop" id={id} role="note"><b>{label}</b><p>{text}</p></div>}
    </div>
  );
}

/** <Popover> 키 목록 — 화면의 키 표시를 걷고 한 곳에 모았어요. ? 로 열어요 */
export function KeysPop({ talk, onClose }: { /** 토마토에게 말하기(A)가 있는 모드인가 */ talk: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useDismiss(true, onClose);
  const rows: [string[], string][] = [[['1–5'], 'keys.pick'], [['↵', '→'], 'keys.suggested'], [['←', 'S'], 'keys.snooze'], [['D'], 'keys.myself'], [['Z'], 'keys.undo'], [['/'], 'keys.say'],
    ...(talk ? [[['A'], 'keys.talk'] as [string[], string]] : []), [['['], 'keys.menu'], [['?'], 'keys.title']];
  return (
    <div className="cu-pop keys-pop" ref={ref} role="dialog" aria-label={t('keys.title')}>
      <b>{t('keys.title')}</b>
      <dl className="cu-keys">{rows.map(([ks, label]) => <div key={label}><dt>{ks.map(k => <kbd key={k} className="cu-kbd">{k}</kbd>)}</dt><dd>{t(label)}</dd></div>)}</dl>
    </div>
  );
}
