// Gestionnaire de notifications push, importé dans le service worker généré par Workbox
// (voir vite.config.ts, workbox.importScripts). Push "vide" volontairement (voir
// supabase/functions/send-push) : on affiche une notification générique et on ouvre/
// réactive l'app au clic — le contenu précis se consulte dans l'écran Notifications.

self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('GRAAL Medical Solutions', {
      body: 'Vous avez une nouvelle notification.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'graal-notification',
      data: { url: '/' }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => 'focus' in c)
      if (existing) return existing.focus()
      return self.clients.openWindow(url)
    })
  )
})
