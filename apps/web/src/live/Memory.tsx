import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MemoryView } from '../screens/Memory';
import type { Memory as Item } from '../state/memory';
import { ApiError, call, newKey } from './api';

/** 비서가 아는 것 — 서버의 기억을 읽고 고쳐요 */
export function Memory({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Item[]>();
  const [failed, setFailed] = useState('');

  const read = useCallback(async () => {
    try { setItems(await call<Item[]>('GET', '/me/memories')); setFailed(''); }
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
    onForget={key => void run(() => call('DELETE', path(key)))} />;
}
