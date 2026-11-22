/** 누른 그 순간에 불러야 해요(Safari). http 로 연 기기(같은 Wi-Fi 시험)엔 Clipboard API 가 없어서 옛 방식으로 한 번 더 해 봐요 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* 옛 방식으로 */ }
  }
  const back = document.activeElement as HTMLElement | null;
  const area = document.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);
  try { return document.execCommand('copy'); } catch { return false; } finally { area.remove(); back?.focus?.({ preventScroll: true }); }
}
