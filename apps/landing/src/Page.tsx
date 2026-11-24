import { ArrowRight, ArrowUUpLeft, CheckCircle, EnvelopeSimple, LockSimple, ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import type { Copy, Lang, Shot } from './copy';

// 소개 페이지 한 장. 빌드할 때 정적 HTML로 구워요(render.tsx). 여기에 상태나 이벤트는 없어요. 움직이는 건 main.ts 가 맡아요.
// 짜임(Hallmark 다시 짜기, 2026-11-24): 첫 화면(Banner) → 실제 덱 → 들어온 것과 정할 것 → 카드(Feature Stack) → 안심 → 연결 → 묻고 답하기 → 끝 → 바닥(mast)

export type Sizes = Partial<Record<string, [number, number]>>;
type Props = { t: Copy; lang: Lang; app: string; sizes: Sizes };

const ICONS = { shield: ShieldCheck, undo: ArrowUUpLeft, lock: LockSimple, mail: EnvelopeSimple } as const;

function Img({ lang, shot, alt, sizes, eager, className }: { lang: Lang; shot: Shot; alt: string; sizes: Sizes; eager?: boolean; className?: string }) {
  const [width, height] = sizes[shot] ?? [];
  const img = <img className={className} src={`/src/shots/${lang}/${shot}.webp`} alt={alt} width={width} height={height}
    loading={eager ? undefined : 'lazy'} decoding="async" />;
  // 휴대폰에서는 휴대폰 화면째로 찍은 그림(-m)을 써요. 넓게 찍은 카드를 줄이면 글자가 너무 작아져요
  const small = sizes[`${shot}-m`];
  if (!small) return img;
  return <picture className={className ? `${className}-pic` : undefined}><source media="(max-width: 600px)" srcSet={`/src/shots/${lang}/${shot}-m.webp`} width={small[0]} height={small[1]} />{img}</picture>;
}

export function Page({ t, lang, app, sizes }: Props) {
  const appUrl = `${app}?lang=${lang}&start=1#/catchup`;
  const other = lang === 'en' ? { href: '/ko/', lang: 'ko' } : { href: '/', lang: 'en' };
  return (
    <>
      <header className="top">
        <nav className="pill" aria-label={t.nav.menu}>
          <a className="brand" href="#top"><svg aria-hidden="true"><use href="#cu-mark" /></svg>CatchUp</a>
          <div className="links">
            <a href="#how">{t.nav.how}</a><a href="#cards">{t.nav.cards}</a><a href="#trust">{t.nav.trust}</a>
            <a href="#connect">{t.nav.connect}</a><a href="#faq">{t.nav.faq}</a>
          </div>
          <a className="lang-link" href={other.href} hrefLang={other.lang} lang={other.lang} data-lang={other.lang} aria-label={t.nav.otherLabel}>{t.nav.other}</a>
          <a className="cu-btn primary" href="#try">{t.nav.action}</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="wrap">
            <h1 id="hero-title"><span className="l">{t.hero.title[0]}</span> <span className="l">{t.hero.title[1]}</span></h1>
            <p className="lede">{t.hero.lede}</p>
            <div className="acts">
              <a className="cu-btn primary lg" href="#try">{t.hero.action}</a>
              <p className="note">{t.hero.note}</p>
            </div>
          </div>
        </section>

        <section id="try" className="try" aria-labelledby="try-title">
          <div className="wrap">
            <div className="sec-head">
              <h2 id="try-title">{t.try.title}</h2>
              <p>{t.try.lede}</p>
            </div>
            <div className="try-stage">
              <div className="device" id="device">
                <div className="device-in" id="deviceIn">
                  <iframe id="proto" title={t.try.frame} src={`${app}?lang=${lang}&start=1&embed=1#/catchup`} loading="lazy" allow="clipboard-write" />
                </div>
              </div>
              <div className="try-bar" id="tryBar">
                <dl className="keys">
                  <div><dt><kbd className="cu-kbd">1</kbd><kbd className="cu-kbd">2</kbd><kbd className="cu-kbd">3</kbd></dt><dd>{t.try.keys.pick}</dd></div>
                  <div><dt><kbd className="cu-kbd">↵</kbd></dt><dd>{t.try.keys.take}</dd></div>
                  <div><dt><kbd className="cu-kbd">S</kbd></dt><dd>{t.try.keys.snooze}</dd></div>
                  <div><dt><kbd className="cu-kbd">D</kbd></dt><dd>{t.try.keys.mine}</dd></div>
                  <div><dt><kbd className="cu-kbd">Z</kbd></dt><dd>{t.try.keys.undo}</dd></div>
                </dl>
                <p className="hint">{t.try.hint}</p>
                <div className="try-acts">
                  <button type="button" className="cu-btn" id="protoReset">{t.try.reset}</button>
                  <a className="cu-btn ghost" id="protoOpen" href={appUrl} target="_blank" rel="noopener">{t.try.open}</a>
                </div>
              </div>
              <div className="try-phone">
                <Img lang={lang} shot="phone" alt={t.try.phoneAlt} sizes={sizes} />
                <div>
                  <p>{t.try.phone}</p>
                  <a className="cu-btn primary lg" id="protoOpenPhone" href={appUrl} target="_blank" rel="noopener">{t.end.action}</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="how" aria-labelledby="how-title">
          <div className="wrap">
            <div className="sec-head">
              <h2 id="how-title">{t.how.title}</h2>
              <p>{t.how.lede}</p>
            </div>
            <div className="tally">
              <p className="fig in"><b>{t.how.figures.in}</b><span>{t.how.figures.inLabel}</span><small>{t.how.figures.inSub}</small></p>
              <ArrowRight className="to" aria-hidden="true" />
              <p className="fig out"><b>{t.how.figures.out}</b><span>{t.how.figures.outLabel}</span><small>{t.how.figures.outSub}</small></p>
              <p className="fig each"><b>{t.how.figures.each}</b><span>{t.how.figures.eachLabel}</span><small>{t.how.figures.eachSub}</small></p>
            </div>
            <ol className="steps">
              {t.how.steps.map((s, i) => (
                <li key={s.title}>
                  <span className="no" aria-hidden="true">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  {i === 0 && <ul className="sources">{t.how.sources.map(x => <li key={x}>{x}</li>)}</ul>}
                </li>
              ))}
            </ol>
            <p className="note">{t.how.note}</p>
          </div>
        </section>

        <section id="cards" className="stack" aria-labelledby="cards-title">
          <div className="wrap stack-grid">
            <div className="pane">
              <h2 id="cards-title">{t.cards.title}</h2>
              <p>{t.cards.lede}</p>
              <nav aria-label={t.cards.list}>
                <ol className="moments">{t.cards.moments.map(m => <li key={m.id}><a href={`#${m.id}`}>{m.tab}</a></li>)}</ol>
              </nav>
              <a className="cu-btn primary" href="#try">{t.cards.action}</a>
            </div>
            <div className="flow">
              {t.cards.moments.map(m => (
                <article key={m.id} id={m.id} className="moment" aria-labelledby={`${m.id}-title`}>
                  <figure><Img lang={lang} shot={m.shot} alt={m.alt} sizes={sizes} /></figure>
                  <div className="txt">
                    <h3 id={`${m.id}-title`}>{m.title}</h3>
                    <p>{m.body}</p>
                    <ul className="facts">{m.facts.map(f => <li key={f}><CheckCircle aria-hidden="true" />{f}</li>)}</ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="trust" className="trust" aria-labelledby="trust-title">
          <div className="wrap">
            <div className="sec-head">
              <h2 id="trust-title">{t.trust.title}</h2>
              <p>{t.trust.lede}</p>
            </div>
            <div className="trust-grid">
              <ul className="promises">
                {t.trust.promises.map(p => { const Icon = ICONS[p.icon]; return (
                  <li key={p.title}><h3><Icon aria-hidden="true" />{p.title}</h3><p>{p.body}</p></li>
                ); })}
              </ul>
              <figure className="log">
                <Img lang={lang} shot="log" alt={t.trust.logAlt} sizes={sizes} />
                <figcaption><h3>{t.trust.logTitle}</h3><p>{t.trust.logBody}</p></figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section id="connect" className="connect" aria-labelledby="connect-title">
          <div className="wrap">
            <div className="sec-head">
              <h2 id="connect-title">{t.connect.title}</h2>
              <p>{t.connect.lede}</p>
            </div>
            <div className="connect-grid">
              <table className="conn">
                <thead><tr><th scope="col">{t.connect.when}</th><th scope="col">{t.connect.service}</th><th scope="col">{t.connect.does}</th></tr></thead>
                {t.connect.groups.map(g => (
                  <tbody key={g.label}>
                    {g.rows.map((r, i) => (
                      <tr key={r.name}>
                        {i === 0 && <th scope="rowgroup" rowSpan={g.rows.length}>{g.label}</th>}
                        <td>{r.name}</td><td>{r.does}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
              <div className="lock">
                <h3>{t.connect.phoneTitle}</h3>
                <p>{t.connect.phoneBody}</p>
                <p>{t.connect.phoneNext}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="faq" aria-labelledby="faq-title">
          <div className="wrap faq-grid">
            <h2 id="faq-title">{t.faq.title}</h2>
            <div className="qa">
              {t.faq.items.map((x, i) => (
                <details key={x.q} open={i === 0}><summary>{x.q}</summary><p>{x.a}</p></details>
              ))}
            </div>
          </div>
        </section>

        <section id="end" className="end" aria-labelledby="end-title">
          <div className="wrap end-grid">
            <div className="end-text">
              <h2 id="end-title">{t.end.title}</h2>
              <p>{t.end.lede}</p>
              <div className="acts">
                <a className="cu-btn primary lg" href="#try">{t.end.action}</a>
                <a className="cu-btn lg" id="endOpen" href={appUrl} target="_blank" rel="noopener">{t.end.open}</a>
              </div>
            </div>
            <Img className="end-shot" lang={lang} shot="phone" alt={t.end.shotAlt} sizes={sizes} />
          </div>
        </section>
      </main>

      <footer className="mast">
        <div className="wrap">
          <p className="word"><svg aria-hidden="true"><use href="#cu-mark" /></svg>CatchUp</p>
          <nav className="foot-links" aria-label={t.nav.menu}>
            <a href="#try">{t.nav.try}</a><a href="#how">{t.nav.how}</a><a href="#cards">{t.nav.cards}</a><a href="#trust">{t.nav.trust}</a>
            <a href="#connect">{t.nav.connect}</a><a href="#faq">{t.nav.faq}</a>
            <a href={other.href} hrefLang={other.lang} lang={other.lang} data-lang={other.lang}>{t.nav.other}</a>
          </nav>
          <p className="fine"><span>{t.foot.note}</span><span>{t.foot.rights}</span></p>
        </div>
      </footer>
    </>
  );
}
