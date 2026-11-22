import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { I } from './icons';

/** 토스트 한 장. 미는 동안에는 '놓으면 일어날 일'이 미리 서고, 놓으면 같은 자리에서 되돌리기가 돼요 */
export interface ToastView {
  text: string;
  /** 둘째 줄 — 나갈 글의 첫머리나 고른 답 */
  sub?: string;
  icon?: 'send' | 'copy' | 'clock' | 'warning' | 'check' | 'bolt' | 'receipt';
  /** 고리: 숫자면 0~1, 'pull' 이면 문턱까지 민 만큼(--p), 'full' 이면 놓아도 돼요 */
  ring?: number | 'pull' | 'full';
  /** 고리 안의 숫자(남은 초) */
  count?: number;
  undo?: () => void;
  /** 미는 동안의 미리 보기 — 화면 읽기에는 알리지 않아요 */
  preview?: boolean;
}

export function Toast({ v }: { v: ToastView }) {
  const { t } = useTranslation();
  const Icon = v.icon && I[v.icon];
  const marked = Boolean(Icon) || v.count !== undefined;
  const ring = typeof v.ring === 'number' ? ({ '--ring': v.ring } as CSSProperties) : v.ring === 'pull' ? ({ '--ring': 'var(--p, 0)' } as CSSProperties) : undefined;
  return (
    <div className={`cu-toast${marked ? ' two' : ''}`} role={v.preview ? undefined : 'status'} aria-hidden={v.preview || undefined}>
      {marked && <span className={`cu-ring${v.ring === 'full' ? ' full' : ''}`} style={ring}>{v.count !== undefined ? <span className="n">{v.count}</span> : Icon && <Icon aria-hidden />}</span>}
      <span className="tx"><span className="l1">{v.text}</span>{v.sub && <span className="l2">{v.sub}</span>}</span>
      {v.undo && <button type="button" className="u" onClick={v.undo}>{t('top.undo')}</button>}
    </div>
  );
}
