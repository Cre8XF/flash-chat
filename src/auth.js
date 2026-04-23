import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { loadContacts, unsubContacts } from './contacts.js';
import { unsubMessages } from './chat.js';
import { initNotifications } from './notifications.js';

export function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      window.currentUser = user;
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      document.getElementById('my-avatar').textContent =
        (user.displayName || user.email).charAt(0).toUpperCase();
      document.getElementById('logout-info').textContent = user.email;
      loadContacts(user);
      await initNotifications(user);
    } else {
      window.currentUser = null;
      document.getElementById('auth-screen').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
      unsubContacts();
      unsubMessages();
    }
  });
}

export async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch {
    document.getElementById('auth-error').textContent = 'Feil e-post eller passord.';
  }
}

export async function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  if (!name) { document.getElementById('auth-error').textContent = 'Skriv inn navn.'; return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      email: email.toLowerCase(),
      displayName: name,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    document.getElementById('auth-error').textContent =
      e.code === 'auth/email-already-in-use' ? 'E-post er allerede i bruk.' : 'Registrering feilet.';
  }
}

export async function doLogout() {
  await signOut(auth);
  window.closeModal('logout-modal');
}
