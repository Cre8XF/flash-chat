// This file is processed by the Vite plugin in vite.config.js at build time.
// __PLACEHOLDER__ tokens are replaced with real env values from .env.
// Do NOT import this file as a JS module — it is emitted as a standalone SW asset.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            '__FIREBASE_API_KEY__',
  authDomain:        '__FIREBASE_AUTH_DOMAIN__',
  projectId:         '__FIREBASE_PROJECT_ID__',
  storageBucket:     '__FIREBASE_STORAGE_BUCKET__',
  messagingSenderId: '__FIREBASE_MESSAGING_SENDER_ID__',
  appId:             '__FIREBASE_APP_ID__',
});

const messaging = firebase.messaging();

// Background message handler — fires when the app is closed or in another tab
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'Flash ⚡', {
    body:    body || 'Du har en ny melding',
    icon:    '/icon.png',
    badge:   '/icon.png',
    vibrate: [200, 100, 200],
    data:    payload.data,
  });
});

// Open / focus the app when the user taps the notification
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      return existing ? existing.focus() : clients.openWindow('/');
    })
  );
});
