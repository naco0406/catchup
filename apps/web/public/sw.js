// 웹 푸시 — 누가 기다리거나 기한이 오늘인 카드만 와요(서버가 골라요).
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* 빈 알림 */ }
  event.waitUntil(self.registration.showNotification('CatchUp', { body: data.question || '', tag: data.card }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list =>
    list.length ? list[0].focus() : self.clients.openWindow(`${self.registration.scope}#/catchup`)));
});
