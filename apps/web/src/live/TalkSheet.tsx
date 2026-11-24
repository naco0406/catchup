import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Card } from '../data/types';
import { I, SourceIcon } from '../components/icons';
import { TalkForm, TalkTurn, useTalk, type TalkNav } from './talk';

/** 덱에서 바로 비서에게 말하기 — 덱을 떠나지 않고 여는 시트예요.
 *  말할 때 보고 있던 카드(`card`)를 같이 보내서 '이 분' · '이 카드'를 그 카드로 알아듣게 해요.
 *  카드를 가리키기만 해요: 여기서 한 말은 카드의 답이 되지 않고(그건 카드의 '다르게 답하기'), 아무것도 밖으로 나가지 않아요.
 *  `mine` 은 이번에 덱에서 한 말들이에요 — 닫았다 열어도 그대로 보여요. 전체는 비서 화면에 있어요. */
export function TalkSheet({ card, mine, onSaid, onClose, onNav }: {
  card?: Card; mine: string[]; onSaid: (id: string) => void; onClose: () => void; onNav: (r: TalkNav) => void;
}) {
  const { t } = useTranslation();
  const talk = useTalk();
  const turns = (talk.items ?? []).filter(m => mine.includes(m.id));
  const end = useRef<HTMLDivElement>(null);
  const last = turns.at(-1);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns.length, last?.state]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [onClose]);

  const coding = card?.source === 'codex' || card?.source === 'claude';
  const examples = t(`assistant.deckExamples.${coding ? 'project' : 'person'}`, { returnObjects: true }) as string[];
  const send = async () => { const m = await talk.send(card?.id); if (m) onSaid(m.id); };

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <section className="talk-sheet" role="dialog" aria-modal="true" aria-label={t('nav.assistant')}>
        <header className="talk-sheet-head">
          <I.chat aria-hidden /><h2>{t('nav.assistant')}</h2>
          <button type="button" className="cu-ib" onClick={onClose} aria-label={t('side.close')}><I.close aria-hidden /></button>
        </header>
        {card && <div className="cu-work talk-seen"><SourceIcon source={card.source} /><span>{card.who}, {card.question}</span></div>}
        <div className="talk-sheet-body">
          {turns.length === 0 && card && (
            <div className="talk-empty">
              <div className="talk-examples">{examples.map(x => <button type="button" key={x} className="cu-chip line" onClick={() => talk.write(x)}>{x}</button>)}</div>
            </div>
          )}
          {turns.map(m => <TalkTurn key={m.id} m={m} talk={talk} onNav={onNav} />)}
          <div ref={end} />
        </div>
        <div className="talk-sheet-foot">
          {talk.bad && <p className="cu-fail" role="alert">{talk.bad}</p>}
          <TalkForm talk={talk} onSend={() => void send()} label={t('nav.assistant')} placeholder={t('assistant.ph')} />
          <button type="button" className="cu-link" onClick={() => onNav('assistant')}>{t('assistant.all')}</button>
        </div>
      </section>
    </>
  );
}
