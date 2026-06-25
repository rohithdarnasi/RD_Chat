# RD chat 🔒

A high-security, 1-on-1 end-to-end encrypted (E2EE) messaging dashboard built with Vanilla JavaScript and Firebase Firestore. 

## Features
* **Zero-Knowledge Architecture:** Messages are encrypted locally using the Web Crypto API (AES-GCM 256-bit). Firebase only stores unreadable ciphertext and cannot decrypt your data.
* **Strict 2-Device Lock:** Channels enforce a strict 2-participant limit utilizing Firebase Anonymous Auth tokens. Once two devices connect to a room, the database forcibly rejects any third-party connection attempts (even incognito windows).
* **Multi-Node Dashboard:** Maintain up to 10 separate secure channels simultaneously via a private local tracker.
* **Granular Deletion:** Includes self-destruct timers (1hr, 6hr, 24hr), "Delete for Me", "Delete for Everyone", and full room destruction.
* **Media Support:** Supports uploading small (under 500kb) encrypted media attachments.

## Security Model
Encryption keys are derived via PBKDF2 directly from the URL hash payload (`#roomId:SecretKey`). The cryptographic secret remains trapped inside the local client window and is **never** transmitted to the cloud environment. 

## Deployment
Optimized for static deployment on [Vercel](https://vercel.com).
1. Clone repository.
2. Inject Firebase Web SDK identifiers into `app.js`.
3. Apply `firestore.rules` to your Firebase Database.
4. Deploy to Vercel via GitHub integration.
