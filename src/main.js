import './style.css';
import { initAuth, doLogin, doRegister, doLogout } from './auth.js';
import { addContact } from './contacts.js';
import { sendMessage, closeChat, handleFile, clearMedia } from './chat.js';
import { openCamera } from './camera.js';

// ── Global state ──────────────────────────────────────────────
window.currentUser  = null;
window.currentChatId = null;
window.pendingFile  = null;

// ── Functions referenced by inline HTML handlers ──────────────
window.doLogin       = doLogin;
window.doRegister    = doRegister;
window.doLogout      = doLogout;
window.addContact    = addContact;
window.sendMessage   = sendMessage;
window.closeChat     = closeChat;
window.handleFile    = handleFile;
window.clearMedia    = clearMedia;
window.openCamera    = openCamera;

window.switchTab = (tab) => {
  document.querySelectorAll('.auth-tab').forEach((t, i) =>
    t.classList.toggle('active', (i === 0) === (tab === 'login'))
  );
  document.getElementById('login-form').style.display    = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('auth-error').textContent      = '';
};

window.showLogout = () => document.getElementById('logout-modal').classList.add('open');

window.openAddContact = () => {
  document.getElementById('add-email').value     = '';
  document.getElementById('add-error').textContent = '';
  document.getElementById('add-modal').classList.add('open');
};

window.openModal  = (id) => document.getElementById(id).classList.add('open');
window.closeModal = (id) => document.getElementById(id).classList.remove('open');

window.handleKey = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
};

window.autoResize = (el) => {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
};

window.filterContacts = () => {
  const q = document.getElementById('search-input').value.toLowerCase();
  document.querySelectorAll('.contact-item').forEach(item => {
    const name = item.querySelector('.contact-name')?.textContent.toLowerCase() || '';
    item.style.display = name.includes(q) ? '' : 'none';
  });
};

// Close modal on backdrop click
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

// ── Boot ──────────────────────────────────────────────────────
initAuth();
