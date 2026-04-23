# Flash Chat — Komplett oppsettguide

## Kodeanalyse: Hva er riktig / hva mangler

**`src/firebase.js`** — Korrekt. Alle 6 config-verdier bruker `VITE_`-prefiks og hentes via `import.meta.env`.

**`src/auth.js`** — Korrekt. Bruker `Email/Password`-autentisering. Lager brukerdokument i Firestore ved registrering.

**`src/chat.js`** — Fungerer. Meldinger utløper etter 24 timer (`expiresAt`-felt). Mediafiler lastes opp til Cloudflare R2 hvis `VITE_R2_WORKER_URL` er satt, ellers brukes Firebase Storage som fallback.

**`src/notifications.js`** — Korrekt, men krever at `VITE_FIREBASE_VAPID_KEY` er satt og at Firebase Functions er deployed.

**`firestore.rules`** — Reglene er korrekte og produksjonsklare slik de er.

**`vite.config.js`** — Korrekt. Pluginen injiserer Firebase-config inn i service workeren ved bygging.

**Mangler i repo:** `firebase.json`, `storage.rules`, og `icon.png` i `public/`.

---

## 1. NETLIFY

### Build-innstillinger
Disse er allerede konfigurert i `netlify.toml` — Netlify plukker dem opp automatisk:
```
Build command:   npm run build
Publish dir:     dist
Node version:    20
```
Ingenting å endre her.

### Environment Variables
Gå til **Netlify → Site → Site configuration → Environment variables** og legg til disse:

| Key | Verdi (hentes fra Firebase Console) |
|-----|--------------------------------------|
| `VITE_FIREBASE_API_KEY` | F.eks. `AIzaSyXXXXXXXXXXXXXXXXXXXXX` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `ditt-prosjekt.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `ditt-prosjekt` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `ditt-prosjekt.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | F.eks. `123456789012` |
| `VITE_FIREBASE_APP_ID` | F.eks. `1:123456789012:web:abcdef123456` |
| `VITE_FIREBASE_VAPID_KEY` | Se punkt 5 nedenfor |
| `VITE_R2_WORKER_URL` | Kun hvis du bruker Cloudflare R2 (valgfritt) |

**Viktig:** Etter du har lagt til env-variablene må du trigge en ny deploy i Netlify — verdiene injiseres inn i service workeren KUN ved build-tid.

Verdiene finner du i **Firebase Console → Project settings → Your apps → Web app → Config**.

---

## 2. FIREBASE — Authentication

### Aktiver Email/Password-provider
**Firebase Console → Authentication → Sign-in method → Email/Password → Enable**

Ingen andre providers brukes i koden.

### Authorized domains
**Firebase Console → Authentication → Settings → Authorized domains**

Legg til:
```
ditt-prosjekt.netlify.app
```
`localhost` og `firebaseapp.com` er allerede der som standard.

---

## 3. FIREBASE — Firestore

### Security Rules
Reglene i `firestore.rules` er produksjonsklare og skal brukes som de er. Kopier innholdet til **Firebase Console → Firestore → Rules**, eller deploy via CLI (se punkt 6).

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read:  if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    match /chats/{chatId} {
      allow read, write: if request.auth != null
        && request.auth.uid in resource.data.participants;
      allow create: if request.auth != null
        && request.auth.uid in request.resource.data.participants;

      match /messages/{messageId} {
        function isParticipant() {
          return request.auth != null
            && request.auth.uid in
               get(/databases/$(database)/documents/chats/$(chatId)).data.participants;
        }
        allow read:   if isParticipant();
        allow create: if isParticipant()
          && request.resource.data.senderId == request.auth.uid;
        allow update: if isParticipant()
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['readBy']);
      }
    }
  }
}
```

### Indexes
Koden bruker bare enkelt-felt-spørringer (`array-contains`, `orderBy('createdAt')`, `where('expiresAt', '<=', now)`). Disse håndteres av Firestore sine automatiske enkeltfelt-indekser — **ingen composite indexes trengs manuelt**.

### TTL-policy for meldingsutløp (viktig!)
Meldinger har en `expiresAt`-timestamp og skal slettes automatisk. Aktiver Firestore Native TTL:

**Firebase Console → Firestore → TTL → Add TTL Policy**
- Collection group: `messages`
- Timestamp field: `expiresAt`

Dette sletter utløpte meldinger gratis og automatisk. Cloud Function i `functions/index.js` er bare et supplement.

---

## 4. FIREBASE — Storage

**Merk: `storage.rules`-filen mangler i repoet.** Standardreglene fra Firebase krever bare at bruker er innlogget, men for produksjon bør du bruke disse strengere reglene.

Gå til **Firebase Console → Storage → Rules** og lim inn:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /chats/{chatId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.resource.size < 50 * 1024 * 1024
        && (request.resource.contentType.matches('image/.*')
            || request.resource.contentType.matches('video/.*'));
    }
  }
}
```

Dette tillater kun bilde/video-opplasting under 50 MB til autentiserte brukere, kun innenfor `chats/`-pathen som koden bruker.

---

## 5. FIREBASE — Cloud Messaging (FCM)

### Hent VAPID-nøkkelen
1. Gå til **Firebase Console → Project settings → Cloud Messaging**
2. Scroll ned til **Web Push certificates**
3. Klikk **Generate key pair** (gjøres bare én gang)
4. Kopier **Key pair**-verdien (den lange base64-strengen)
5. Sett denne som `VITE_FIREBASE_VAPID_KEY` i Netlify

### Hva som kreves for at push-varsler skal fungere
Appen bruker **to mekanismer** for push:

**Forgrunn** (`src/notifications.js`): Håndteres direkte i appen — fungerer uten Cloud Functions.

**Bakgrunn** (`functions/index.js` → `notifyOnNewMessage`): Krever at Cloud Functions er deployed. Funksjonen utløses når en ny melding skrives til Firestore og sender FCM-push til mottaker via `fcmToken` lagret på brukerdokumentet.

### Deploy Cloud Functions
Krever **Firebase Blaze-plan** (pay-as-you-go):

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

---

## 6. Andre ting som må fikses

### A) `firebase.json` mangler — regler deployes ikke automatisk
Det finnes ingen `firebase.json` i repoet. Uten den kan du ikke deploye Firestore-regler via CLI. Opprett filen i rotkatalogen:

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "functions": {
    "source": "functions"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

Lag også `storage.rules` (se punkt 4 over) og deploy alt med:
```bash
firebase deploy --only firestore:rules,storage,functions
```

### B) `icon.png` mangler i `public/`
Service workeren (`src/firebase-messaging-sw.js`) og Cloud Function refererer til `/icon.png` som notifikasjonsikon. Filen eksisterer ikke i `public/`-mappen. Legg til en `public/icon.png` (minst 192×192 px).

### C) Valgfritt: Cloudflare R2 for mediaopplasting
Hvis du vil bruke R2 i stedet for Firebase Storage:

1. Opprett en R2-bøtte i Cloudflare Dashboard med navn `flash-media`
2. Opprett et R2 API-token med lese/skrive-tilgang
3. Oppdater `wrangler.toml` med dine verdier:
   ```toml
   R2_ACCOUNT_ID  = "din_cloudflare_account_id"
   R2_BUCKET_NAME = "flash-media"
   R2_PUBLIC_URL  = "https://pub-xxxx.r2.dev"
   ALLOWED_ORIGIN = "https://ditt-prosjekt.netlify.app"
   ```
4. Sett secrets og deploy:
   ```bash
   cd worker
   npx wrangler secret put R2_ACCESS_KEY_ID
   npx wrangler secret put R2_SECRET_ACCESS_KEY
   npx wrangler deploy
   ```
5. Sett `VITE_R2_WORKER_URL` i Netlify til worker-URL-en

Hvis du dropper R2, slett bare `VITE_R2_WORKER_URL` fra Netlify — appen faller automatisk tilbake til Firebase Storage.

---

## Oppsummering: Rekkefølge for oppsett

```
1.  Firebase Console: Opprett Firebase-prosjekt, registrer web-app
2.  Firebase Console: Aktiver Email/Password Authentication
3.  Firebase Console: Legg til Netlify-domenet under Authorized domains
4.  Firebase Console: Opprett Firestore-database (start i production mode)
5.  Firebase Console: Kopier inn Firestore security rules (punkt 3)
6.  Firebase Console: Aktiver Storage, kopier inn storage rules (punkt 4)
7.  Firebase Console: Generer VAPID-nøkkel under Cloud Messaging (punkt 5)
8.  Firebase Console: Aktiver TTL-policy på messages/expiresAt (punkt 3)
9.  Netlify: Koble til GitHub-repoet
10. Netlify: Legg inn alle 8 environment variables (punkt 1)
11. Legg til icon.png i public/ og push til GitHub
12. Legg til firebase.json og storage.rules og push
13. Netlify: Trigger ny deploy — appen skal nå fungere
14. (Valgfritt) Firebase: Oppgrader til Blaze-plan og deploy Cloud Functions
```
