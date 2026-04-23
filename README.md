# Flash ⚡ — Privat Chat App

Enkel 1-til-1 chat-app med støtte for tekst, bilder og video.
Bygget med Firebase + Netlify.

---

## 🚀 Kom i gang

### 1. Opprett Firebase-prosjekt

1. Gå til [console.firebase.google.com](https://console.firebase.google.com)
2. Klikk **"Add project"** → gi det et navn (f.eks. `flash-chat`)
3. Deaktiver Google Analytics (valgfritt)

### 2. Aktiver tjenester

**Authentication:**
- Gå til **Build → Authentication → Get started**
- Aktiver **Email/Password**

**Firestore:**
- Gå til **Build → Firestore Database → Create database**
- Velg **Start in production mode**
- Velg en region (f.eks. `europe-west3`)

**Storage:**
- Gå til **Build → Storage → Get started**
- Velg samme region

### 3. Hent konfigurasjon

1. Gå til **Project settings** (tannhjul øverst til venstre)
2. Under **"Your apps"** → klikk **"</>"** (Web)
3. Registrer appen → kopier `firebaseConfig`-objektet

Åpne `index.html` og erstatt verdiene i `firebaseConfig`:

```javascript
const firebaseConfig = {
  apiKey: "din-api-key-her",
  authDomain: "din-app.firebaseapp.com",
  projectId: "din-project-id",
  storageBucket: "din-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 4. Sett opp Firestore-regler

Gå til **Firestore → Rules** og lim inn innholdet fra `firestore.rules`.

### 5. Sett opp Storage-regler

Gå til **Storage → Rules** og lim inn:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /chats/{chatId}/{file} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 6. Deploy på Netlify

1. Logg inn på [netlify.com](https://netlify.com)
2. Klikk **"Add new site → Deploy manually"**
3. Dra `index.html` inn i opplastingsfeltet
4. Ferdig! ✅

---

## 📁 Filstruktur

```
flash-app/
├── index.html       ← Hele appen (én fil)
├── firestore.rules  ← Sikkerhetsregler for Firestore
└── README.md        ← Denne filen
```

---

## 🔧 Cloudflare R2 (valgfritt — for bildelagring)

Firebase Storage fungerer fint for MVP. Når du vil bytte til R2:

1. Opprett en R2-bucket i Cloudflare Dashboard
2. Aktiver **public access** på bucketen
3. Opprett en **Worker** som håndterer opplasting (pre-signed URL)
4. Bytt ut `uploadBytes` / `getDownloadURL` i `index.html` med kall til din Worker

---

## ✨ Funksjoner

- [x] Registrering og innlogging (Firebase Auth)
- [x] Legg til kontakter via e-post
- [x] Sanntidsmeldinger (Firestore)
- [x] Send bilder og video
- [x] Uleste-teller per samtale
- [x] Responsivt design (mobil + desktop)

## 🛣️ Mulige utvidelser

- [ ] Push-varsler (Firebase Cloud Messaging)
- [ ] Forsvinnende meldinger (TTL + Cloud Function)
- [ ] Lesekvittering (sett/lest)
- [ ] Kryptering ende-til-ende
- [ ] Lydmeldinger
