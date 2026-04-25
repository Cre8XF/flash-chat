import { db, storage } from './firebase.js';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, arrayUnion, arrayRemove,
  doc, getDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  avatarGradient, escapeHtml, formatTime, formatTTL,
  extractUrl, linkify, getYouTubeId, getLinkType,
} from './helpers.js';

let currentChatId  = null;
let currentPartner = null;
let messagesUnsub  = null;
let replyTo        = null;

export async function openChat(chatId, partnerId) {
  window.currentChatId = chatId;
  currentChatId        = chatId;
  replyTo              = null;
  clearReplyPreview();

  const partnerDoc = await getDoc(doc(db, 'users', partnerId));
  currentPartner   = partnerDoc.data();

  document.getElementById('chat-name').textContent =
    currentPartner.displayName || currentPartner.email;
  const avatarEl = document.getElementById('chat-avatar');
  avatarEl.textContent = (currentPartner.displayName || currentPartner.email).charAt(0).toUpperCase();
  avatarEl.style.background = avatarGradient(partnerId);

  document.getElementById('chat-view').style.display = 'flex';

  if (messagesUnsub) messagesUnsub();

  const msgQ = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt'));
  messagesUnsub = onSnapshot(msgQ, async (snap) => {
    const now      = Date.now();
    const messages = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => !m.expiresAt || m.expiresAt.toMillis() > now);

    renderMessages(messages, now);

    const user   = window.currentUser;
    const toMark = snap.docs.filter(d => {
      const data = d.data();
      return data.senderId !== user.uid && !(data.readBy || []).includes(user.uid);
    });
    for (const d of toMark) {
      await updateDoc(doc(db, 'chats', chatId, 'messages', d.id), {
        readBy: arrayUnion(user.uid),
      });
    }
    await updateDoc(doc(db, 'chats', chatId), { [`unread.${user.uid}`]: 0 });
  });
}

export function closeChat() {
  document.getElementById('chat-view').style.display = 'none';
  window.currentChatId = null;
  currentChatId        = null;
  replyTo              = null;
  clearReplyPreview();
  unsubMessages();
}

export function unsubMessages() {
  if (messagesUnsub) { messagesUnsub(); messagesUnsub = null; }
}

// ── REPLY ─────────────────────────────────────────────────────
export function setReply(msgId, text, senderName) {
  replyTo = { id: msgId, text, senderName };
  document.getElementById('reply-sender').textContent = senderName;
  document.getElementById('reply-text').textContent =
    text.length > 60 ? text.slice(0, 60) + '…' : text;
  document.getElementById('reply-bar').style.display = 'flex';
  document.getElementById('msg-input').focus();
}

function clearReplyPreview() {
  replyTo = null;
  const bar = document.getElementById('reply-bar');
  if (bar) bar.style.display = 'none';
}

window.cancelReply = () => clearReplyPreview();
window.setReply    = setReply;

// ── REACTIONS ─────────────────────────────────────────────────
const REACTION_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];

export async function toggleReaction(msgId, emoji) {
  if (!currentChatId) return;
  const user    = window.currentUser;
  const msgRef  = doc(db, 'chats', currentChatId, 'messages', msgId);
  const msgSnap = await getDoc(msgRef);
  if (!msgSnap.exists()) return;
  const users = (msgSnap.data().reactions || {})[emoji] || [];
  if (users.includes(user.uid)) {
    await updateDoc(msgRef, { [`reactions.${emoji}`]: arrayRemove(user.uid) });
  } else {
    await updateDoc(msgRef, { [`reactions.${emoji}`]: arrayUnion(user.uid) });
  }
  document.getElementById('reaction-picker')?.remove();
}

window.toggleReaction = toggleReaction;

window.showReactionPicker = (e, msgId) => {
  document.getElementById('reaction-picker')?.remove();
  const picker = document.createElement('div');
  picker.id = 'reaction-picker';
  picker.innerHTML = REACTION_EMOJIS.map(em =>
    `<button onclick="toggleReaction('${msgId}','${em}');this.closest('#reaction-picker').remove()">${em}</button>`
  ).join('');
  document.body.appendChild(picker);

  const rect = e.target.getBoundingClientRect();
  picker.style.top  = (rect.top - 56) + 'px';
  picker.style.left = Math.max(8, rect.left - 80) + 'px';

  setTimeout(() => document.addEventListener('click', function h(ev) {
    if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', h); }
  }), 10);
};

// ── LIGHTBOX ──────────────────────────────────────────────────
window.openLightbox = (src, isVideo) => {
  document.getElementById('lightbox')?.remove();
  const lb = document.createElement('div');
  lb.id = 'lightbox';
  lb.innerHTML = isVideo
    ? `<video src="${src}" controls autoplay playsinline></video>`
    : `<img src="${src}" />`;
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
};

// ── RENDER ────────────────────────────────────────────────────
function renderMessages(messages, now) {
  const user           = window.currentUser;
  const container      = document.getElementById('messages-container');
  const myInitial      = (user.displayName || user.email).charAt(0).toUpperCase();
  const partnerInitial = (currentPartner.displayName || currentPartner.email).charAt(0).toUpperCase();

  container.innerHTML = messages.map(m => {
    const isSent     = m.senderId === user.uid;
    const time       = m.createdAt ? formatTime(m.createdAt.toDate()) : '';
    const initial    = isSent ? myInitial : partnerInitial;
    const senderName = isSent
      ? (user.displayName || user.email)
      : (currentPartner.displayName || currentPartner.email);

    // ── Content ──
    let content = '';
    if (m.type === 'image') {
      content = `<img src="${m.mediaUrl}" alt="bilde" loading="lazy"
        onclick="openLightbox('${m.mediaUrl}', false)" style="cursor:zoom-in" />`;
    } else if (m.type === 'video') {
      content = `<video src="${m.mediaUrl}" controls playsinline style="max-width:100%;border-radius:10px;display:block"></video>`;
    } else {
      const url      = extractUrl(m.text || '');
      const linkType = getLinkType(url);

      if (linkType === 'youtube' && url) {
        const ytId = getYouTubeId(url);
        content = ytId
          ? `<div class="link-preview yt"><iframe src="https://www.youtube.com/embed/${ytId}"
               allowfullscreen style="width:100%;aspect-ratio:16/9;border:none;border-radius:8px"></iframe></div>`
          : linkify(m.text || '');
      } else if (linkType === 'instagram' && url) {
        content = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="link-preview social">
          <span class="link-icon">📸</span>
          <div class="link-info">
            <span class="link-label">Instagram</span>
            <span class="link-url">${url.length > 42 ? url.slice(0, 42) + '…' : url}</span>
          </div>
          <span class="link-arrow">↗</span>
        </a>`;
      } else if (linkType === 'tiktok' && url) {
        content = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="link-preview social">
          <span class="link-icon">🎵</span>
          <div class="link-info">
            <span class="link-label">TikTok</span>
            <span class="link-url">${url.length > 42 ? url.slice(0, 42) + '…' : url}</span>
          </div>
          <span class="link-arrow">↗</span>
        </a>`;
      } else if (linkType === 'twitter' && url) {
        content = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="link-preview social">
          <span class="link-icon">𝕏</span>
          <div class="link-info">
            <span class="link-label">X / Twitter</span>
            <span class="link-url">${url.length > 42 ? url.slice(0, 42) + '…' : url}</span>
          </div>
          <span class="link-arrow">↗</span>
        </a>`;
      } else if (linkType === 'generic' && url) {
        const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
        content = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="link-preview generic">
          <span class="link-icon">🔗</span>
          <div class="link-info">
            <span class="link-label">${domain}</span>
            <span class="link-url">${url.length > 42 ? url.slice(0, 42) + '…' : url}</span>
          </div>
          <span class="link-arrow">↗</span>
        </a>`;
      } else {
        content = linkify(m.text || '');
      }
    }

    // ── Reply quote ──
    let replyHtml = '';
    if (m.replyTo) {
      replyHtml = `<div class="reply-quote">
        <span class="reply-quote-name">${escapeHtml(m.replyTo.senderName)}</span>
        <span class="reply-quote-text">${escapeHtml((m.replyTo.text || '').slice(0, 80))}${(m.replyTo.text || '').length > 80 ? '…' : ''}</span>
      </div>`;
    }

    // ── Reactions ──
    const reactions = m.reactions || {};
    const reactHtml = Object.entries(reactions)
      .filter(([, users]) => users.length > 0)
      .map(([emoji, users]) =>
        `<span class="reaction${users.includes(user.uid) ? ' mine' : ''}"
          onclick="toggleReaction('${m.id}','${emoji}')">${emoji} ${users.length}</span>`
      ).join('');
    const reactBar = reactHtml ? `<div class="reactions-bar">${reactHtml}</div>` : '';

    // ── Read receipt ──
    const isRead  = isSent && (m.readBy || []).includes(currentPartner.uid);
    const receipt = isSent
      ? `<span class="read-receipt${isRead ? ' read' : ''}">${isRead ? 'Sett ✓✓' : '✓'}</span>`
      : '';

    // ── TTL ──
    const ttlMs   = m.expiresAt ? m.expiresAt.toMillis() - now : null;
    const ttlHtml = ttlMs != null ? `<span class="ttl-label">⏱ ${formatTTL(ttlMs)}</span>` : '';

    // ── Action buttons ──
    const safeText = JSON.stringify(m.text || (m.type === 'image' ? '📷 Bilde' : '🎬 Video'));
    const safeName = JSON.stringify(senderName);
    const replyBtn = `<button class="msg-action-btn" title="Svar" onclick="setReply('${m.id}',${safeText},${safeName})">↩</button>`;
    const reactBtn = `<button class="msg-action-btn" title="Reaksjon" onclick="showReactionPicker(event,'${m.id}')">😊</button>`;
    const actions  = `<div class="msg-actions">${isSent ? replyBtn + reactBtn : reactBtn + replyBtn}</div>`;

    return `<div class="message-row ${isSent ? 'sent' : 'received'}" data-id="${m.id}">
      <div class="msg-avatar" style="background:${isSent ? 'linear-gradient(135deg,var(--accent),#c9184a)' : avatarGradient(currentPartner.uid)}">${initial}</div>
      <div class="msg-body">
        ${actions}
        ${replyHtml}
        <div class="message-bubble">${content}</div>
        ${reactBar}
        <div class="msg-time">${time}${receipt}${ttlHtml}</div>
      </div>
    </div>`;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

// ── SEND ──────────────────────────────────────────────────────
export async function sendMessage() {
  const user = window.currentUser;
  if (!currentChatId) return;

  const input = document.getElementById('msg-input');
  const text  = input.value.trim();
  if (!text && !window.pendingFile) return;

  const btn    = document.getElementById('send-btn');
  btn.disabled = true;
  input.value  = '';
  window.autoResize(input);

  try {
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    let msgData = {
      senderId:  user.uid,
      createdAt: serverTimestamp(),
      expiresAt,
      type:      'text',
      text,
      readBy:    [],
      reactions: {},
    };

    if (replyTo) {
      msgData.replyTo = { ...replyTo };
      clearReplyPreview();
    }

    if (window.pendingFile) {
      const file    = window.pendingFile;
      const isVideo = file.type.startsWith('video');
      const mediaUrl = await uploadMedia(file, currentChatId);
      msgData = { ...msgData, type: isVideo ? 'video' : 'image', mediaUrl, text: '' };
      clearMedia();
    }

    await addDoc(collection(db, 'chats', currentChatId, 'messages'), msgData);

    const chatDoc       = await getDoc(doc(db, 'chats', currentChatId));
    const partnerUnread = (chatDoc.data()?.unread?.[currentPartner.uid] || 0) + 1;
    await updateDoc(doc(db, 'chats', currentChatId), {
      lastMessage: msgData.type === 'text' ? text
        : (msgData.type === 'image' ? '📷 Bilde' : '🎬 Video'),
      lastTime: serverTimestamp(),
      [`unread.${currentPartner.uid}`]: partnerUnread,
    });
  } catch (e) {
    console.error('sendMessage:', e);
  }
  btn.disabled = false;
}

// ── UPLOAD ────────────────────────────────────────────────────
async function uploadMedia(file, chatId) {
  const workerUrl = import.meta.env.VITE_R2_WORKER_URL;
  if (workerUrl) {
    const key = `${chatId}/${Date.now()}_${file.name}`;
    const res = await fetch(
      `${workerUrl}/sign?key=${encodeURIComponent(key)}&type=${encodeURIComponent(file.type)}`
    );
    if (!res.ok) throw new Error('Pre-signed URL request failed');
    const { url, publicUrl } = await res.json();
    await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    return publicUrl;
  }
  const path       = `chats/${chatId}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// ── FILE ──────────────────────────────────────────────────────
export function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  window.pendingFile = file;

  const preview = document.getElementById('media-preview');
  const thumb   = document.getElementById('preview-thumb');
  const label   = document.getElementById('preview-label');
  preview.classList.add('show');

  if (file.type.startsWith('image')) {
    thumb.src         = URL.createObjectURL(file);
    label.textContent = file.name;
  } else {
    thumb.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><text y="36" font-size="36">🎬</text></svg>';
    label.textContent = file.name;
  }
  e.target.value = '';
}

export function clearMedia() {
  window.pendingFile = null;
  document.getElementById('media-preview').classList.remove('show');
  document.getElementById('preview-thumb').src = '';
}
