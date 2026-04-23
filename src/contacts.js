import { db } from './firebase.js';
import {
  collection, query, where, onSnapshot,
  doc, getDoc, setDoc, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { avatarGradient, escapeHtml, formatTime } from './helpers.js';
import { openChat } from './chat.js';

let contactsUnsub = null;

export function loadContacts(user) {
  const q = query(collection(db, 'chats'), where('participants', 'array-contains', user.uid));
  contactsUnsub = onSnapshot(q, async (snap) => {
    const contacts = [];
    for (const d of snap.docs) {
      const data = d.data();
      const partnerId = data.participants.find(id => id !== user.uid);
      if (!partnerId) continue;
      const partnerDoc = await getDoc(doc(db, 'users', partnerId));
      if (!partnerDoc.exists()) continue;
      contacts.push({
        chatId: d.id,
        partner: partnerDoc.data(),
        lastMessage: data.lastMessage || '',
        lastTime: data.lastTime,
        unread: data.unread?.[user.uid] || 0,
      });
    }
    contacts.sort((a, b) => (b.lastTime?.toMillis?.() || 0) - (a.lastTime?.toMillis?.() || 0));
    renderContacts(contacts);
  });
}

export function unsubContacts() {
  if (contactsUnsub) { contactsUnsub(); contactsUnsub = null; }
}

function renderContacts(contacts) {
  const list = document.getElementById('contacts-list');
  if (contacts.length === 0) {
    list.innerHTML = `<div class="empty-contacts"><div class="icon">💬</div><p>Ingen samtaler ennå.<br/>Legg til en venn for å starte.</p></div>`;
    return;
  }
  list.innerHTML = contacts.map(c => {
    const initial = (c.partner.displayName || c.partner.email).charAt(0).toUpperCase();
    const time = c.lastTime ? formatTime(c.lastTime.toDate()) : '';
    return `<div class="contact-item${window.currentChatId === c.chatId ? ' active' : ''}"
               data-chat="${c.chatId}" data-partner="${c.partner.uid}">
      <div class="contact-avatar" style="background:${avatarGradient(c.partner.uid)}">
        ${initial}<div class="online-dot"></div>
      </div>
      <div class="contact-info">
        <div class="contact-name">${escapeHtml(c.partner.displayName || c.partner.email)}</div>
        <div class="contact-preview">${escapeHtml(c.lastMessage)}</div>
      </div>
      <div class="contact-meta">
        <div class="contact-time">${time}</div>
        ${c.unread > 0 ? `<div class="unread-badge">${c.unread}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.contact-item').forEach(item => {
    item.addEventListener('click', () => openChat(item.dataset.chat, item.dataset.partner));
  });
}

export async function addContact() {
  const user  = window.currentUser;
  const email = document.getElementById('add-email').value.trim().toLowerCase();
  if (!email) return;
  if (email === user.email.toLowerCase()) {
    document.getElementById('add-error').textContent = 'Det er deg selv!';
    return;
  }
  const q    = query(collection(db, 'users'), where('email', '==', email));
  const snap = await getDocs(q);
  if (snap.empty) {
    document.getElementById('add-error').textContent = 'Finner ingen bruker med den e-posten.';
    return;
  }
  const partner = snap.docs[0].data();
  const ids     = [user.uid, partner.uid].sort();
  const chatId  = ids.join('_');
  await setDoc(doc(db, 'chats', chatId), {
    participants: ids,
    lastMessage: '',
    lastTime: serverTimestamp(),
  }, { merge: true });
  window.closeModal('add-modal');
  openChat(chatId, partner.uid);
}
