import { describe, expect, it } from 'vitest';
import { arm, decide, FLING, resist, threshold } from './swipeMath';

describe('밀기 판단(시안 11장)', () => {
  const W = 390, T = threshold(W);

  it('문턱은 좁은 화면에서 폭의 4분의 1, 넓은 화면에서 160이에요', () => {
    expect(T).toBe(98);
    expect(threshold(1194)).toBe(160);
  });
  it('문턱에서 걸리고, 16 여유를 두고 풀려요', () => {
    expect(arm(false, T - 1, T)).toBe(false);
    expect(arm(false, T, T)).toBe(true);
    expect(arm(true, T - 10, T)).toBe(true);
    expect(arm(true, T - 17, T)).toBe(false);
    expect(arm(false, -T, T)).toBe(true);
  });
  it('문턱을 넘겨 놓으면 정해져요', () => {
    expect(decide({ x: 120, v: 0, armed: true, width: W })).toBe('right');
    expect(decide({ x: -120, v: 0, armed: true, width: W })).toBe('left');
  });
  it('덜 밀고 멈췄다 놓으면 돌아와요', () => {
    expect(decide({ x: 60, v: 0, armed: false, width: W })).toBe('back');
  });
  it('짧아도 빠르게 튕기면 정해져요', () => {
    expect(decide({ x: 40, v: FLING, armed: false, width: W })).toBe('right');
    expect(decide({ x: 40, v: FLING - 1, armed: false, width: W })).toBe('back');
  });
  it('반대로 튕기면 문턱을 넘었어도 돌아와요', () => {
    expect(decide({ x: 150, v: -FLING, armed: true, width: W })).toBe('back');
  });
  it('막힌 쪽은 5분의 1만, 24까지만 따라와요', () => {
    expect(resist(50)).toBe(10);
    expect(resist(400)).toBe(24);
    expect(resist(-400)).toBe(-24);
  });
});
