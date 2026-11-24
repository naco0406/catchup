import { describe, expect, it } from 'vitest';
import { snoozeUntil, snoozeWhen } from './snooze';

const t = ((k: string) => k) as never;
describe('미룸 시각', () => {
  it('오후 2시 전이면 오늘 2시, 지났으면 내일 2시예요', () => {
    const morning = new Date(2026, 10, 24, 9, 0).getTime(), evening = new Date(2026, 10, 24, 18, 0).getTime();
    expect(snoozeUntil(morning).getDate()).toBe(24);
    expect(snoozeUntil(evening).getDate()).toBe(25);
    expect(snoozeWhen(morning, t)).toBe('snoozed.whenToday');
    expect(snoozeWhen(evening, t)).toBe('snoozed.whenTomorrow'); // 지난 '오후 2시'라고 말하지 않아요
  });
});
