import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { ko } from './locales/ko';
import type { Lang } from './data/types';

const KEY = 'catchup-lang';
function initial(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ko' || q === 'en') { try { localStorage.setItem(KEY, q); } catch { /* 무시 */ } return q; } // 주소로 고른 언어도 기억해요
  try { const s = localStorage.getItem(KEY); if (s === 'ko' || s === 'en') return s; } catch { /* 저장소가 막혀도 계속 */ }
  return 'en'; // 기본 언어는 영어예요(2026-11-23). 한국어는 직접 고른 사람만 써요 — 주소의 ?lang=ko 나 언어 단추
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ko: { translation: ko } },
  lng: initial(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
document.documentElement.lang = i18n.language;
i18n.on('languageChanged', l => {
  document.documentElement.lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* 무시 */ }
});
export default i18n;
