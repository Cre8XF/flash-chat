// Deploy: firebase deploy --only functions
//
// Firestore native TTL (recommended, zero-cost):
//   Enable TTL on the `expiresAt` field for collection group `messages` in the
//   Firebase console → Firestore → TTL policies. Firestore then deletes expired
//   documents automatically (within 24 h of expiry) without a Cloud Function.
//
// This scheduled function is a complementary sweep that runs every hour and
// catches any stragglers that Firestore TTL hasn't removed yet.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

exports.deleteExpiredMessages = onSchedule('every 1 hours', async () => {
  const now      = new Date();
  const chatsSnap = await db.collection('chats').get();

  const deletions = [];
  for (const chatDoc of chatsSnap.docs) {
    const msgSnap = await db
      .collection('chats').doc(chatDoc.id)
      .collection('messages')
      .where('expiresAt', '<=', now)
      .get();
    msgSnap.docs.forEach(d => deletions.push(d.ref.delete()));
  }

  await Promise.all(deletions);
  console.log(`Deleted ${deletions.length} expired messages at ${now.toISOString()}.`);
});

// Send a push notification to the receiver when a new message is created.
// Requires the receiver's FCM token stored at users/{uid}.fcmToken.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { getMessaging }      = require('firebase-admin/messaging');

exports.notifyOnNewMessage = onDocumentCreated(
  'chats/{chatId}/messages/{messageId}',
  async (event) => {
    const msg     = event.data.data();
    const chatId  = event.params.chatId;

    // Resolve the chat to find the receiver
    const chatDoc = await db.collection('chats').doc(chatId).get();
    const participants = chatDoc.data()?.participants || [];
    const receiverId   = participants.find(id => id !== msg.senderId);
    if (!receiverId) return;

    const receiverDoc = await db.collection('users').doc(receiverId).get();
    const fcmToken    = receiverDoc.data()?.fcmToken;
    if (!fcmToken) return;

    // Sender name for the notification title
    const senderDoc  = await db.collection('users').doc(msg.senderId).get();
    const senderName = senderDoc.data()?.displayName || 'Noen';
    const body       = msg.type === 'text'
      ? (msg.text?.substring(0, 100) || '')
      : (msg.type === 'image' ? '📷 Sendte et bilde' : '🎬 Sendte en video');

    await getMessaging().send({
      token: fcmToken,
      notification: { title: `Flash ⚡ — ${senderName}`, body },
      webpush: {
        notification: { icon: '/icon.png', badge: '/icon.png' },
        fcmOptions: { link: '/' },
      },
    });
  }
);
