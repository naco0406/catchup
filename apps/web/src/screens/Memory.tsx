import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { I } from '../components/icons';
import type { Memory, MemoryKind } from '../state/memory';

/** 켜져 있는 감시 규칙(실제 모드) — design.md 17장 제안 2 */
export interface Watching { id: string; kind: string; value: string; lane: string; until: string }
import { InfoPop } from '../components/Popover';
import { Empty, Top } from './Pages';

const KINDS: MemoryKind[] = ['promise', 'preference', 'person', 'project'];
const ICON = { promise: I.calendarCheck, preference: I.chat, person: I.mail, project: I.code } as const;

/** 비서가 아는 것(3.6단계) — 기억을 보고, 고치고, 지우고, 직접 알려 줘요.
 *  기억은 내 답, 내가 고친 초안, 내가 한 말, 내가 보낸 글의 약속, 끝난 코딩 세션에서만 생겨요. 지우면 다음 카드부터 쓰지 않아요.
 *  이 설명은 화면에 늘 두지 않고 제목 옆 ⓘ 뒤에 둬요. */
export function MemoryView({ items, failed, onTell, onEdit, onForget, onMenu, watching, onStop }: {
  items?: Memory[]; failed?: string; onTell: (text: string) => void; onEdit: (key: string, text: string) => void; onForget: (key: string) => void; onMenu: () => void;
  watching?: Watching[]; onStop?: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<{ key: string; text: string }>();
  const tell = (e: FormEvent) => { e.preventDefault(); const text = note.trim(); if (!text) return; onTell(text); setNote(''); };
  const save = () => { if (editing?.text.trim()) { onEdit(editing.key, editing.text.trim()); setEditing(undefined); } };
  const when = (at?: string | null) => (at ? new Date(at).toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' }) : '');

  return (
    <>
      <Top page title={t('nav.memory')} left={items?.length ? t('memory.count', { count: items.length }) : undefined} info={<InfoPop label={t('memory.about')} text={t('memory.promise')} />} onMenu={onMenu} />
      <div className="cu-page"><div className="cu-page-in memory">
        <form className="cu-composer" onSubmit={tell}>
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={600} placeholder={t('memory.tellPh')} aria-label={t('memory.tell')} onKeyDown={e => e.stopPropagation()} />
          <button type="submit" className={`cu-send${note.trim() ? ' go' : ''}`} aria-label={t('memory.tell')} disabled={!note.trim()}><I.up aria-hidden /></button>
        </form>
        {failed && <p className="cu-fail" role="alert">{failed}</p>}
        {watching && watching.length > 0 && (
          <section data-kind="watch">
            <div className="cu-h"><b>{t('watch.title')}</b><span>{watching.length}</span></div>
            {watching.map(w => (
              <div className="cu-row" key={w.id} data-watch={w.id}>
                <span className="cu-tile"><I.bell aria-hidden /></span>
                <div><div className="t">{t(w.kind === 'from' ? 'watch.from' : 'watch.words', { v: w.value })}</div><div className="s">{t(w.lane === 'fyi' ? 'watch.fyi' : 'watch.ask')}, {t('watch.until', { when: when(w.until) })}</div></div>
                <span className="acts"><button type="button" className="cu-link" onClick={() => onStop?.(w.id)}>{t('watch.stop')}</button></span>
              </div>
            ))}
          </section>
        )}
        {KINDS.map(kind => {
          const rows = items?.filter(m => m.kind === kind) ?? [];
          if (!rows.length) return null;
          const Icon = ICON[kind];
          return (
            <section key={kind} data-kind={kind}>
              <div className="cu-h"><b>{t(`memory.kind.${kind}`)}</b><span>{rows.length}</span></div>
              {rows.map(m => (
                <div className="cu-row" key={m.key} data-memory={m.key}>
                  <span className="cu-tile"><Icon aria-hidden /></span>
                  {editing?.key === m.key ? (
                    <div><textarea className="cu-textarea" rows={2} maxLength={600} value={editing.text} aria-label={t('memory.edit')} autoFocus
                      onChange={e => setEditing({ key: m.key, text: e.target.value })} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setEditing(undefined); }} /></div>
                  ) : (
                    <div><div className="t">{m.text}</div><div className="s">{[m.subject, when(m.at), m.edited ? t('memory.edited') : null].filter(Boolean).join(', ')}</div></div>
                  )}
                  <span className="acts">
                    {editing?.key === m.key
                      ? <><button type="button" className="cu-link" onClick={save}>{t('memory.save')}</button><button type="button" className="cu-link" onClick={() => setEditing(undefined)}>{t('memory.cancel')}</button></>
                      : <><button type="button" className="cu-link" onClick={() => setEditing({ key: m.key, text: m.text })}>{t('memory.edit')}</button><button type="button" className="cu-link" onClick={() => onForget(m.key)}>{t('memory.forget')}</button></>}
                  </span>
                </div>
              ))}
            </section>
          );
        })}
        {items?.length === 0 && !watching?.length && <Empty text={t('memory.empty')} face="thinking" />}
      </div></div>
    </>
  );
}
