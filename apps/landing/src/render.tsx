import { renderToStaticMarkup } from 'react-dom/server';
import sprite from '@catchup/design-system/sprite.svg?raw';
import { copy, type Lang } from './copy';
import { Page, type Sizes } from './Page';

// 빌드할 때(그리고 개발 서버에서) vite.config.ts 가 부르는 곳. 언어 하나의 <head> 조각과 본문을 돌려줘요.
// app: 'Try it' 이 품는 실제 앱 주소. 배포에서는 같은 주소의 /app/, 개발에서는 apps/web 개발 서버.
const sizeFiles = import.meta.glob<{ default: Sizes }>('./shots/*/sizes.json', { eager: true });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function render(lang: Lang, app = '/app/') {
  const t = copy[lang];
  const sizes = sizeFiles[`./shots/${lang}/sizes.json`]?.default ?? {};
  const self = lang === 'ko' ? '/ko/' : '/';
  const head = [
    `<title>${esc(t.title)}</title>`,
    `<meta name="description" content="${esc(t.description)}">`,
    `<meta name="theme-color" content="#FAFAF9">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="alternate" hreflang="en" href="https://catchup.naco.im/">`,
    `<link rel="alternate" hreflang="ko" href="https://catchup.naco.im/ko/">`,
    `<link rel="canonical" href="https://catchup.naco.im${self}">`,
    `<meta property="og:title" content="${esc(t.title)}">`,
    `<meta property="og:description" content="${esc(t.description)}">`,
  ].join('\n');
  const page = sprite.trim() + "\n" + renderToStaticMarkup(<Page t={t} lang={lang} app={app} sizes={sizes} />);
  return { head, page, htmlLang: lang };
}
