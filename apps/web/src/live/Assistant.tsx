import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Top } from '../screens/Pages';
import { TalkForm, TalkTurn, useTalk, type TalkNav } from './talk';

/** 비서에게 말하기(3.6단계) — 명령이 들어오는 셋째 길이에요.
 *  말은 네 갈래로만 받아요: 기억해(내 말 그대로 남겨요) · 물어봐(답만 해요) · 일 맡겨(제안까지만, 눌러야 시작해요) ·
 *  카드(그 카드를 찾아 주고, 눌러야 내 말이 그 카드의 '말로 답하기'로 가요).
 *  보내기 · 결제처럼 밖으로 나가는 일은 여기서 하지 않고 카드로 여쭤봐요. 덱에서는 같은 것을 시트로 열어요(TalkSheet). */
export function Assistant({ onMenu, onNav }: { onMenu: () => void; onNav: (r: TalkNav) => void }) {
  const { t } = useTranslation();
  const talk = useTalk();
  const { items } = talk;
  const end = useRef<HTMLDivElement>(null);
  const last = items?.at(-1);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [items?.length, last?.state]);
  const examples = t('assistant.examples', { returnObjects: true }) as string[];

  return (
    <>
      <Top page title={t('nav.assistant')} onMenu={onMenu} />
      <div className="cu-page talk"><div className="cu-page-in">
        {items?.length === 0 && (
          <div className="talk-empty">
            <div className="talk-examples">{examples.map(x => <button type="button" key={x} className="cu-chip line" onClick={() => talk.write(x)}>{x}</button>)}</div>
          </div>
        )}
        {items?.map(m => <TalkTurn key={m.id} m={m} talk={talk} onNav={onNav} />)}
        <div ref={end} />
      </div></div>
      <div className="talk-dock"><div className="cu-page-in">
        {talk.bad && <p className="cu-fail" role="alert">{talk.bad}</p>}
        <TalkForm talk={talk} onSend={() => void talk.send()} label={t('nav.assistant')} placeholder={t('assistant.ph')} />
      </div></div>
    </>
  );
}
