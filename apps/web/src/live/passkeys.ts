import type { components } from './api.gen';
import { call } from './api';

export type Passkey = components['schemas']['Passkey'];
type Ask = components['schemas']['LoginOptions'];
type Start = components['schemas']['RegisterOptions'];

/** 패스키는 https(또는 localhost)에서, 지원하는 브라우저에서만 돼요 */
export const canPasskey = () => isSecureContext && typeof PublicKeyCredential !== 'undefined' && Boolean(navigator.credentials);

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const bytes = (s: string) => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));

/** 패스키에 붙일 이름 — 어디서 만들었는지 */
export function deviceName(): string {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Win/.test(ua) ? 'Windows' : 'Web';
}

/** 왜 안 됐는지: 그만둠(말하지 않아요) · 이미 있음 · 그 밖 */
export type PasskeyFail = 'cancelled' | 'exists' | 'failed';
const why = (e: unknown): PasskeyFail => {
  const name = e instanceof DOMException ? e.name : '';
  return name === 'NotAllowedError' || name === 'AbortError' ? 'cancelled' : name === 'InvalidStateError' ? 'exists' : 'failed';
};

/** 이 기기(또는 키체인)에 패스키를 만들어 계정에 등록해요. 로그인한 뒤에만 돼요 */
export async function addPasskey(): Promise<Passkey | PasskeyFail> {
  try {
    const o = await call<Start>('POST', '/me/passkeys/options');
    const made = await navigator.credentials.create({ publicKey: {
      challenge: bytes(o.challenge), rp: { id: o.rp_id, name: 'CatchUp' },
      user: { id: bytes(o.user_id), name: o.user_name, displayName: o.user_name },
      // P-256 만 받아요(아이폰 · 맥 · 안드로이드의 패스키가 이거예요). 사람 확인(얼굴 · 지문)은 꼭 해요
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: o.exclude.map(id => ({ type: 'public-key' as const, id: bytes(id) })),
      attestation: 'none', timeout: 60_000,
    } }) as PublicKeyCredential | null;
    if (!made) return 'cancelled';
    const r = made.response as AuthenticatorAttestationResponse;
    const key = r.getPublicKey();
    if (!key) return 'failed';
    return await call<Passkey>('POST', '/me/passkeys', {
      credential: b64(made.rawId), client_data: b64(r.clientDataJSON), authenticator_data: b64(r.getAuthenticatorData()), public_key: b64(key), label: deviceName(),
    });
  } catch (e) { return why(e); }
}

/** 패스키로 로그인해요. 누구인지 적지 않아요 — 기기가 가진 패스키가 알려 줘요 */
export async function signInWithPasskey(): Promise<'ok' | PasskeyFail> {
  try {
    const o = await call<Ask>('POST', '/auth/passkey/options');
    const got = await navigator.credentials.get({ publicKey: { challenge: bytes(o.challenge), rpId: o.rp_id, userVerification: 'required', timeout: 60_000 } }) as PublicKeyCredential | null;
    if (!got) return 'cancelled';
    const r = got.response as AuthenticatorAssertionResponse;
    await call('POST', '/auth/passkey', {
      credential: b64(got.rawId), client_data: b64(r.clientDataJSON), authenticator_data: b64(r.authenticatorData), signature: b64(r.signature), label: deviceName(),
    });
    return 'ok';
  } catch (e) { return why(e); }
}
