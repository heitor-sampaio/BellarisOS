self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Nova notificação', {
      body:  data.body  ?? '',
      icon:  '/icon-192.png',
      badge: '/icon-72.png',
      data:  data,
      vibrate: [100, 50, 100],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const match = cs.find((c) => c.url.includes(url) && 'focus' in c)
      if (match) return match.focus()
      return clients.openWindow(url)
    })
  )
})
