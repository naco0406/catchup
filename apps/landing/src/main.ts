import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@catchup/design-system/tokens.css';
import '@catchup/design-system/components.css';
import './landing.css';

// 소개 페이지에서 움직이는 것. 글과 그림은 모두 HTML에 이미 있어서, 이 파일이 없어도 페이지는 다 보여요.
document.documentElement.classList.add('js');
const lang = document.documentElement.lang === 'ko' ? 'ko' : 'en';

// ── 언어: 영어는 /, 한국어는 /ko/. ?lang= 으로 바로 열 수 있고, 고른 언어는 이 브라우저에 기억해요 ──
const KEY = 'catchup-lang';
const store = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* 저장이 막힌 브라우저는 그냥 넘어가요 */ } },
};
// 주소로 직접 연 /ko/ 는 그대로 두고, 저장한 언어로는 첫 주소(/)에서만 옮겨요
const q = new URLSearchParams(location.search).get('lang');
const asked = q === 'ko' || q === 'en' ? q : null;
if (asked) store.set(asked);
const want = asked ?? (lang === 'en' ? store.get() : null);
if (want && want !== lang) location.replace((want === 'ko' ? '/ko/' : '/') + location.hash);
document.querySelectorAll<HTMLAnchorElement>('a[data-lang]').forEach(a => a.addEventListener('click', () => store.set(a.dataset.lang!)));

// ── 써 보기: 넓으면 아이패드 가로 크기(1194×834)를 폭에 맞춰 줄이고, 화면 높이의 78%를 넘지 않게 ──
const device = document.getElementById('device');
const inner = document.getElementById('deviceIn');
const frame = document.getElementById('proto') as HTMLIFrameElement | null;
const bar = document.getElementById('tryBar');
if (device && inner && frame && bar) {
  const stage = device.parentElement!;
  const fit = () => {
    const w = stage.clientWidth;
    if (w >= 900) {
      const k = Math.min(1, w / 1194, (innerHeight * 0.78) / 834);
      device.style.width = `${Math.round(1194 * k)}px`;
      device.style.height = `${Math.round(834 * k)}px`;
      inner.style.transform = `scale(${k})`;
      bar.style.maxWidth = device.style.width;
    } else {
      device.style.width = ''; device.style.height = ''; inner.style.transform = ''; bar.style.maxWidth = '';
    }
  };
  new ResizeObserver(fit).observe(stage);
  fit();
  const first = frame.src;
  document.getElementById('protoReset')?.addEventListener('click', () => {
    const u = new URL(first);
    u.searchParams.set('reset', '1');
    u.searchParams.set('again', String(Date.now()));   // 같은 주소면 다시 읽지 않아서, 누를 때마다 달라지게
    frame.src = u.toString();
  });
}

// ── 카드 장: 오른쪽에서 지금 보이는 카드를 왼쪽 차례에 표시해요 ──
const marks = new Map<string, HTMLAnchorElement>();
document.querySelectorAll<HTMLAnchorElement>('.moments a').forEach(a => marks.set(a.hash.slice(1), a));
if (marks.size && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(es => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      marks.forEach((a, id) => { if (id === e.target.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    }
  }, { rootMargin: '-45% 0px -45% 0px' });
  document.querySelectorAll('.moment').forEach(m => io.observe(m));
}
