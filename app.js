import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, updateDoc, arrayUnion, addDoc, onSnapshot, query, orderBy, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// TODO: Input your actual web app database parameters right here
const firebaseConfig = {
    apiKey: "AIzaSyC-kfy35yq-SVC65Oiw5icGL2QTvvePRMs",
    authDomain: "rdchat-f5601.firebaseapp.com",
    projectId: "rdchat-f5601",
    storageBucket: "rdchat-f5601.firebasestorage.app",
    messagingSenderId: "110964965807",
    appId: "1:110964965807:web:814586ed937b974d5daf5a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let cryptoKey = null;
let currentRoomId = null;
let currentUserId = null;

const setupScreen = document.getElementById('setup-screen');
const chatScreen = document.getElementById('chat-screen');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnCopyLink = document.getElementById('btn-copy-link');
const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const inputMessage = document.getElementById('input-message');
const roomDisplayId = document.getElementById('room-display-id');

// --- E2EE CRYPTOGRAPHIC ENGINE (AES-GCM 256) ---

function generateRandomSecret(length = 16) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(secretPassword, saltString = 'rd-chat-hardened-salt') {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(secretPassword);
    const saltBuffer = encoder.encode(saltString);

    const baseKey = await window.crypto.subtle.importKey(
        'raw', passwordBuffer, { name: 'PBKDF2' }, false, ['deriveKey']
    );

    return await window.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBuffer, iterations: 100000, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptMessage(text, key) {
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedContent = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encodedText
    );

    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(encryptedContent))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

async function decryptMessage(ciphertextBase64, ivBase64, key) {
    try {
        const ciphertext = new Uint8Array(atob(ciphertextBase64).split('').map(c => c.charCodeAt(0)));
        const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            ciphertext
        );
        return new TextDecoder().decode(decryptedBuffer);
    } catch (e) {
        return "[Decryption Error: Security token attributes invalid or corrupted]";
    }
}

// --- SECURE WORKSPACE SYNC CONTROLLER ---

async function initializeChatRoom(roomId, roomSecret) {
    currentRoomId = roomId;
    cryptoKey = await deriveKey(roomSecret);

    const roomRef = doc(db, "rooms", roomId);
    const roomSnap = await getDoc(roomRef);

    if (!roomSnap.exists()) {
        // Participant 1: Construct the room document mapping structure
        await setDoc(roomRef, {
            participants: [currentUserId],
            createdAt: Date.now()
        });
    } else {
        const data = roomSnap.data();
        // Participant 2: Join the room if there's space
        if (data.participants.length < 2 && !data.participants.includes(currentUserId)) {
            await updateDoc(roomRef, {
                participants: arrayUnion(currentUserId)
            });
        } else if (!data.participants.includes(currentUserId)) {
            alert("This secure room is full (Maximum 2 participants allowed).");
            window.location.hash = "";
            window.location.reload();
            return;
        }
    }

    // Switch view to active chat screen
    setupScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    roomDisplayId.textContent = `CHANNEL ID // ${roomId}`;

    // Establish live listener on messages sub-collection
    const messagesRef = collection(db, "rooms", roomId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
                const docData = change.doc.data();
                const docId = change.doc.id;

                const decryptedText = await decryptMessage(docData.ciphertext, docData.iv, cryptoKey);
                displayMessageBubble(decryptedText, docData.senderId === currentUserId);

                // Ephemeral Auto-Delete Hook
                if (docData.senderId !== currentUserId) {
                    await deleteDoc(doc(db, "rooms", roomId, "messages", docId));
                }
            }
        });
    });
}

function displayMessageBubble(text, isMe) {
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = `flex w-full ${isMe ? 'justify-end' : 'justify-start'}`;

    const bubble = document.createElement('div');
    bubble.className = `max-w-xs sm:max-w-md px-4 py-2.5 rounded-2xl text-sm transition-all transform duration-200 ${
        isMe 
        ? 'bg-gradient-to-br from-teal-500 to-emerald-500 text-slate-950 font-semibold rounded-tr-none shadow-md shadow-teal-500/5' 
        : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none'
    }`;
    bubble.textContent = text;

    bubbleWrapper.appendChild(bubble);
    messagesContainer.appendChild(bubbleWrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawMessageText = inputMessage.value.trim();
    if (!rawMessageText || !cryptoKey) return;

    inputMessage.value = '';
    const encryptedPayload = await encryptMessage(rawMessageText, cryptoKey);

    try {
        await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
            ciphertext: encryptedPayload.ciphertext,
            iv: encryptedPayload.iv,
            senderId: currentUserId,
            timestamp: Date.now()
        });
    } catch (err) {
        console.error("Database submission blocked via Firebase Security Policy Rules.", err);
    }
});

btnCreateRoom.addEventListener('click', () => {
    const uniqueRoomId = Math.random().toString(36).substring(2, 10);
    const uniqueSecret = generateRandomSecret(16);
    
    window.location.hash = `${uniqueRoomId}:${uniqueSecret}`;
    initializeChatRoom(uniqueRoomId, uniqueSecret);
});

btnCopyLink.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    const nativeText = btnCopyLink.textContent;
    btnCopyLink.textContent = "Link Copied!";
    btnCopyLink.classList.add('border-emerald-500/40', 'text-emerald-400');
    setTimeout(() => {
        btnCopyLink.textContent = nativeText;
        btnCopyLink.classList.remove('border-emerald-500/40', 'text-emerald-400');
    }, 2000);
});

// Bootstrapper Lifecycle initialization
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        const URLHashData = window.location.hash.substring(1);
        if (URLHashData && URLHashData.includes(':')) {
            const [extractedRoomId, extractedSecret] = URLHashData.split(':');
            initializeChatRoom(extractedRoomId, extractedSecret);
        }
    } else {
        await signInAnonymously(auth).catch(err => console.error("Auth Failure", err));
    }
});
