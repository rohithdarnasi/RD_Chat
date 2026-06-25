# RD chat 🔒

A high-security, 1-on-1 end-to-end encrypted (E2EE) messaging dashboard built with Vanilla JavaScript and Firebase Firestore.

## Tech Stack
* **Frontend:** Vanilla JavaScript (ES6 Modules)
* **Styling:** Tailwind CSS (via CDN)
* **Backend/Database:** Firebase Firestore (NoSQL)
* **Authentication:** Firebase Anonymous Auth
* **Security:** Web Crypto API (AES-GCM 256-bit)
* **Deployment:** Vercel

## Key Features
* **Zero-Knowledge Architecture:** Messages are encrypted locally in the browser. Firebase stores only encrypted ciphertext; even database administrators cannot read your messages.
* **Strict 2-Device Lock:** Channels utilize Firebase Anonymous Auth to enforce a strict 2-participant limit. Once two unique devices connect, the database restricts access to any third-party attempt.
* **Multi-Node Dashboard:** Maintain up to 10 separate private 1-on-1 channels simultaneously via local browser storage.
* **Granular Deletion:** Includes self-destruct timers (1hr, 6hr, 24hr), "Delete for Me", "Delete for Everyone", and full room destruction.
* **Media Support:** Encrypted image uploads (max 500KB per image).

## Security Model
The app generates a unique room ID and secret key pair stored in the URL hash (`#roomId:SecretKey`). The cryptographic secret key remains in your browser's memory and is **never** transmitted to the cloud. Without the exact secret key from the URL, the encrypted data in Firestore is mathematically unrecoverable.

## Setup & Deployment Guide

### 1. Firebase Setup
1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Anonymous Authentication** in the "Authentication" tab.
3. Initialize **Cloud Firestore** in "Production Mode".
4. Copy your web app config object from **Project Settings**.

### 2. Configure Security Rules
Navigate to **Firestore Database > Rules** and paste the following to secure your channels:

### 3. Local Installation
Clone this repository.

Open app.js and paste your Firebase configuration object into the firebaseConfig variable.

Initialize a Git repository and push your changes.

### 4. Deployment
Log into Vercel and create a new project.

Select your repository.

Click Deploy. Vercel will automatically detect the configuration and provide your live production link.


### Final Checklist for You:
* **Firebase Rules:** Did you publish the new `resource == null` security rules? (This is usually the #1 cause for the "Connection Blocked" error).
* **Hard Refresh:** After you update your files on GitHub/Vercel, make sure to hold `Shift` (or `Cmd`) while clicking the refresh button in your browser to clear the cache.
* **Device Lock:** Have you successfully verified that a 3rd person (or a 2nd incognito tab) cannot get into a room where 2 people are already chatting?

Final production url : https://rd-chat-dusky.vercel.app/
