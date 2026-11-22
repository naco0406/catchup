import type { components } from './api.gen';

type S = components['schemas'];
export type ApiCard = S['Card'];
export type ApiOption = S['CardOption'];
export type ApiActivity = S['Activity'];
export type ApiReceipt = S['Receipt'];
export type ApiAnswer = S['AnswerInput'];
export type ApiList = S['CardList'];
export type ApiSession = S['AgentSession'];
export type ApiConnection = S['Connection'];

/** keepalive 로 보낼 수 있는 크기 — 브라우저는 보내는 중인 것을 모두 합쳐 64KB 까지만 받아요 */
const KEEP_BYTES = 16_000;

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

/** 요청 열쇠가 본문에 있어서, 닿았는지 모를 때 같은 본문으로 한 번 더 보내도 한 번만 실행돼요 */
export async function call<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  // 답하자마자 닫거나 새로 고쳐도 보내던 답은 끝까지 가요
  const keep = method !== 'GET' && new Blob([payload ?? '']).size <= KEEP_BYTES;
  const send = (keepalive: boolean) => fetch(`/v1${path}`, {
    keepalive,
    method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15_000),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: payload,
  });
  let res: Response;
  try { res = await send(keep); } catch { res = await send(false).catch(() => { throw new ApiError(0, 'offline'); }); }
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 본문이 JSON 이 아니면 상태만 */ }
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string } | null)?.error ?? `http_${res.status}`);
  return json as T;
}

/** 안전한 주소(https · localhost)가 아니어도 되게 */
export function newKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
