import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@catchup/design-system/tokens.css';
import '@catchup/design-system/components.css';
import './app.css';
import './i18n';
import { App } from './App';

// 소개 페이지 안에 품었을 때(?embed=1) — 안에서 끝까지 스크롤하면 바깥 페이지로 이어지게
if (new URLSearchParams(location.search).get('embed') === '1') document.documentElement.classList.add('embed');

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
