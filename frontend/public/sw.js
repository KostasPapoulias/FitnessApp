self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'SomaTrack', body: 'Reminder' }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/'))
})
