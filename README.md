
# RD chat 🔒

A zero-knowledge, end-to-end encrypted (E2EE) messaging workspace built with pure Vanilla JavaScript and Firebase Firestore.

## Features
* **Zero-Knowledge Architecture:** Messages are encrypted locally using the Web Crypto API (AES-GCM 256-bit) before transmission. Firebase only stores unreadable ciphertext.
* **Ephemeral Data:** Configurable timers allow messages to automatically destruct ("Burn on Read", 1hr, 6hr, 24hr).
* **Group E2EE:** Supports up to 10 participants per secure node.
* **No Database Leftovers:** "Delete Chat" permanently wipes all encrypted shards from the Firestore database.
* **Zero Dependencies:** Built entirely with native ES Modules and Tailwind CSS via CDN.

## Security Model
Encryption keys are derived via PBKDF2 directly from the URL hash payload (`#roomId:SecretKey`). The cryptographic secret remains inside the local client window and is **never** transmitted to the server layer. 

## Deployment
This project is optimized for static deployment on [Vercel](https://vercel.com).
1. Clone repository.
2. Inject Firebase Web SDK identifiers into `app.js`.
3. Apply `firestore.rules` to your Firebase Database.
4. Deploy to Vercel with zero build-step configuration.
