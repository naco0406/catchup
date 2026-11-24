import type { TFunction } from 'i18next';

/** 미루면 다음 오후 2시에 다시 올라와요(지났으면 내일 오후 2시). 실제 모드는 이 때를 서버에 보내요 */
export function snoozeUntil(now: number): Date {
  const d = new Date(now);
  d.setHours(14, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d;
}

/** 언제 다시 올라오는지 — 오늘이면 '오후 2시', 내일이면 '내일 오후 2시'. 지난 시각을 말하지 않아요(모바일 검토 2026-11-24) */
export function snoozeWhen(now: number, t: TFunction): string {
  const until = snoozeUntil(now);
  return t(until.getDate() === new Date(now).getDate() ? 'snoozed.whenToday' : 'snoozed.whenTomorrow');
}
