import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MemoryView, type Tidied, type Watching } from '../screens/Memory';
import type { Memory as Item } from '../state/memory';
import { ApiError, call, newKey } from './api';

/** 비서가 아는 것 — 서버의 기억을 읽고 고쳐요 */
export function Memory({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Item[]>();
  const [watching, setWatching] = useState<Watching[]>([]);
  const [tidied, setTidied] = useState<Tidied[]>([]);
  const [failed, setFailed] = useState('');

  const read = useCallback(async () => {
    try {
      // 기억이 먼저예요. 규칙과 정리 목록은 못 읽어도(옛 서버 등) 기억은 보여요
      const optional = <T,>(path: string) => call<T[]>('GET', path).catch(() => [] as T[]);
      const [memories, rules, tidy] = await Promise.all([call<Item[]>('GET', '/me/memories'), optional<Watching>('/me/watch'), optional<Tidied>('/me/tidy')]);
      // 목록이 아닌 응답(옛 서버 등)에도 화면이 멈추지 않게
      setItems(memories); setWatching(Array.isArray(rules) ? rules : []); setTidied(Array.isArray(tidy) ? tidy : []); setFailed('');
    }
    catch (e) { setFailed(t(e instanceof ApiError && e.status === 0 ? 'live.offline' : 'live.error')); }
  }, [t]);
  useEffect(() => { void read(); }, [read]);

  const run = async (work: () => Promise<unknown>) => {
    try { await work(); await read(); } catch { setFailed(t('live.error')); }
  };
  const path = (key: string) => `/me/memories/${encodeURIComponent(key)}`;
  return <MemoryView items={items} failed={failed} onMenu={onMenu}
    onTell={text => void run(() => call('POST', '/me/memories', { request_key: newKey(), text }))}
    onEdit={(key, text) => void run(() => call('PUT', path(key), { text }))}
    onForget={key => void run(() => call('DELETE', path(key)))}
    watching={watching} onStop={id => void run(() => call('POST', `/me/watch/${id}/stop`))}
    tidied={tidied} onUntidy={id => void run(() => call('POST', `/me/tidy/${id}/undo`))} />;
}
