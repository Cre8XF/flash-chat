import { messaging, db } from './firebase.js';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';

export async function initNotifications(user) {
  if (!messaging || !('Notification' in window)) return;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  try {
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      // The service worker at /firebase-messaging-sw.js handles background messages
      serviceWorkerRegistration: await navigator.serviceWorker.register('/firebase-messaging-sw.js'),
    });
    if (token) {
      await setDoc(doc(db, 'users', user.uid), { fcmToken: token }, { merge: true });
    }
  } catch (e) {
    console.warn('FCM token error:', e);
  }

  // Foreground message handler — show a notification manually because
  // the browser suppresses push notifications when the app is in focus
  onMessage(messaging, payload => {
    const { title, body } = payload.notification || {};
    if (title && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon.png' });
    }
  });
}
