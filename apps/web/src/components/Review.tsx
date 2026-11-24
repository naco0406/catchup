import { useTranslation } from 'react-i18next';
import type { CodeChange, CodeFile, Option, Slot } from '../data/types';
import { I } from './icons';

/* 카드 안의 검토 화면 — 고르면 일어나는 일을 글이 아니라 그 일의 모양으로 보여 줘요(design.md 17장 제안 1).
 * 일정은 그날의 달력 조각, 코드 변경은 파일마다 접고 펼치는 diff 예요. 답장은 지금처럼 초안이에요(Preview). */

type Bar = { name: string; from: number; to: number; isNew?: boolean; state?: 'moved' | 'away' | 'was'; note?: string };

const pad = (n: number) => String(n).padStart(2, '0');
/** 분 → 시각. 영어는 3:00 PM, 한국어는 15:00 */
export function clock(min: number, lang: string) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  if (lang.startsWith('ko')) return `${h}:${pad(m)}`;
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}
const span = (a: number, b: number, lang: string) => `${clock(a, lang)} – ${clock(b, lang)}`;

/** 겹치는 구간들(둘 이상이 같이 있는 시간) */
function clashes(bars: Bar[]) {
  const live = bars.filter(b => b.state !== 'away' && b.state !== 'was');
  const out: [number, number][] = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i]!, b = live[j]!;
    const from = Math.max(a.from, b.from), to = Math.min(a.to, b.to);
    if (to > from) out.push([from, to]);
  }
  return out;
}

/** <DayStrip> — 그날의 달력 조각. 시간 축 위에 일정을 막대로 그리고, 겹친 구간은 색으로 칠해요.
 *  change 가 있으면 고른 뒤의 모습이에요: 옮긴 일정은 새 자리에, 원래 자리는 점선으로 남겨요 */
export function DayStrip({ slots, change }: { slots: Slot[]; change?: Option['day'] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const base: Bar[] = slots.flatMap(s => (s.from !== undefined && s.to !== undefined ? [{ name: s.name, from: s.from, to: s.to, isNew: s.isNew }] : []));
  if (base.length !== slots.length || !base.length) return null;
  const bars: Bar[] = [];
  for (const b of base) {
    if (change?.name !== b.name) { bars.push(b); continue; }
    if (change.away) { bars.push({ ...b, state: 'away', note: change.away }); continue; }
    if (change.from !== undefined && change.to !== undefined) {
      bars.push({ ...b, state: 'was' });
      bars.push({ ...b, from: change.from, to: change.to, state: 'moved', isNew: false });
    }
  }
  const start = Math.floor(Math.min(...bars.map(b => b.from)) / 60) * 60;
  const end = Math.max(start + 120, Math.ceil(Math.max(...bars.map(b => b.to)) / 60) * 60);
  const x = (m: number) => `${((m - start) / (end - start)) * 100}%`;
  const w = (a: number, b: number) => `${((b - a) / (end - start)) * 100}%`;
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);
  const band = clashes(bars);
  const rows = bars.filter(b => b.state !== 'was');
  const said = rows.map(b => `${b.name}, ${b.state === 'away' ? b.note : span(b.from, b.to, lang)}`).join('. ');
  return (
    <div className={`cu-day${change ? ' after' : ''}`} role="img" aria-label={`${band.length ? t('day.clash') : t('day.clear')}. ${said}`}>
      <div className="cu-day-grid">
        <div className="cu-day-band" aria-hidden>
          {hours.map(h => <i key={h} className="tick" style={{ left: x(h) }} />)}
          {band.map(([a, b]) => <i key={`${a}-${b}`} className="clash" style={{ left: x(a), width: w(a, b) }} />)}
        </div>
        {rows.map(b => {
          const was = b.state === 'moved' ? bars.find(o => o.name === b.name && o.state === 'was') : undefined;
          return (
            <div key={`${b.name}-${b.state ?? ''}`} className={`cu-day-row${b.isNew ? ' new' : ''}${b.state ? ` ${b.state}` : ''}`}>
              <span className="nm"><span className="n">{b.name}</span><span className="tm">{b.state === 'away' ? b.note : span(b.from, b.to, lang)}</span></span>
              <span className="track">
                {was && <i className="bar ghost" style={{ left: x(was.from), width: w(was.from, was.to) }} />}
                <i className="bar" style={{ left: x(b.from), width: w(b.from, b.to) }} />
              </span>
            </div>
          );
        })}
        <div className="cu-day-axis" aria-hidden>{hours.map(h => <span key={h} style={{ left: x(h) }}>{clock(h, lang).replace(':00', '')}</span>)}</div>
      </div>
      {change && <p className="cu-day-note">{band.length ? t('day.stillClash') : change.pending ? t('day.ifAgreed') : t('day.cleared')}</p>}
    </div>
  );
}

/** 코드 변경 — 파일이 여럿이면 파일마다 접고 펼쳐요. 첫 파일만 펼쳐 둬요(작은 화면에서 길어지지 않게) */
export function CodeReview({ c }: { c: CodeChange }) {
  const { t } = useTranslation();
  const parts: CodeFile[] = c.parts?.length ? c.parts : [{ file: c.file, add: c.add, del: c.del, lines: c.lines }];
  const head = (
    <div className="fh"><I.branch aria-hidden /><span className="lb">{t('card.codeIf')}</span>{parts.length === 1 && <span className="file">{parts[0]!.file}</span>}<span className="sp" />
      <span className="st"><span className="a">+{c.add}</span><span className="m">−{c.del}</span><span>{t('card.files', { count: c.files })}</span></span></div>
  );
  if (parts.length === 1) return <div className="cu-code">{head}{parts[0]!.lines.map((l, i) => <div key={i} className={`ln ${l.t === 'ctx' ? '' : l.t}`}>{l.s}</div>)}</div>;
  const hidden = c.files - parts.length;
  return (
    <div className="cu-code files">{head}
      {parts.map((p, i) => (
        <details key={p.file} className="cu-file" open={i === 0}>
          <summary><I.caret aria-hidden /><span className="file">{p.file}</span><span className="st"><span className="a">+{p.add}</span><span className="m">−{p.del}</span></span></summary>
          {p.lines.map((l, j) => <div key={j} className={`ln ${l.t === 'ctx' ? '' : l.t}`}>{l.s}</div>)}
        </details>
      ))}
      {hidden > 0 && <div className="cu-file-more">{t('card.filesMore', { count: hidden })}</div>}
    </div>
  );
}
