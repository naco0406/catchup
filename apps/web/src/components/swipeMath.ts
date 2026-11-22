// 밀기 판단 — 숫자와 규칙만(docs/design/swipe-deck 11장). 화면을 건드리지 않아서 따로 시험해요.

/** 이만큼 움직이기 전에는 누르기예요 */
export const SLOP = 10;
/** 왼쪽 끝은 브라우저의 '뒤로' 자리예요 */
export const EDGE = 20;
/** 문턱을 넘은 뒤 도로 당길 때의 여유 — 문턱 근처에서 떨리지 않게 */
export const HYSTERESIS = 16;
/** 이 속도(px/초) 이상이면 튕긴 거예요 */
export const FLING = 500;

/** 놓아도 되는 거리: 좁은 화면은 폭의 4분의 1, 넓은 화면은 160 */
export const threshold = (viewport: number) => (viewport < 600 ? Math.round(viewport / 4) : 160);

/** 문턱에서 걸리고, 여유를 두고 풀려요 */
export const arm = (armed: boolean, x: number, t: number) => Math.abs(x) >= (armed ? t - HYSTERESIS : t);

/** 막힌 쪽(위험한 카드)은 5분의 1만, 24까지만 따라와요 */
export const resist = (x: number) => Math.max(-24, Math.min(24, x * 0.2));

/** 손을 뗐을 때: 문턱을 넘었거나, 같은 쪽으로 빠르게 튕겨 멈출 자리가 폭의 절반을 넘으면 정해져요. 반대로 튕기면 돌아와요 */
export function decide({ x, v, armed, width }: { x: number; v: number; armed: boolean; width: number }): 'left' | 'right' | 'back' {
  if (!x) return 'back';
  const dir = x > 0 ? 1 : -1;
  if (v * dir <= -FLING) return 'back';
  const flung = v * dir >= FLING && Math.abs(x + 0.499 * v) >= width / 2; // 0.499: 놓은 속도로 미끄러져 멈출 거리(WWDC18)
  return armed || flung ? (dir > 0 ? 'right' : 'left') : 'back';
}
