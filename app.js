import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, updateDoc, arrayUnion, addDoc, onSnapshot, query, orderBy, deleteDoc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const chatScreen = document.getElementById('chat-screen');
const messagesContainer = document.getElementById('messages-container');
const inputMessage = document.getElementById('input-message');
const timerSelect = document.getElementById('timer-select');
const inputFile = document.getElementById('input-file');

// --- CRYPTO ENGINE ---
function generateRandomSecret(length = 16) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(secretPassword) {
    const encoder = new TextEncoder();
    const baseKey = await window.crypto.subtle.importKey('raw', encoder.encode(secretPassword), { name: 'PBKDF2' }, false, ['deriveKey']);
    return await window.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: encoder.encode('rd-chat-v2'), iterations: 100000, hash: 'SHA-256' },
        baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
}

async function encryptData(text, key) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
    return { ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))), iv: btoa(String.fromCharCode(...iv)) };
}

async function decryptData(cipherBase64, ivBase64, key) {
    try {
        const ciphertext = new Uint8Array(atob(cipherBase64).split('').map(c => c.charCodeAt(0)));
        const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
        const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        return new TextDecoder().decode(decrypted);
    } catch (e) { return "[Decryption Failed]"; }
}

// --- CORE APP ---
async function initializeChatRoom(roomId, roomSecret) {
    currentRoomId = roomId;
    cryptoKey = await deriveKey(roomSecret);

    const roomRef = doc(db, "rooms", roomId);
    const roomSnap = await getDoc(roomRef);

    if (!roomSnap.exists()) {
        await setDoc(roomRef, { participants: [currentUserId], createdAt: Date.now() });
    } else {
        const data = roomSnap.data();
        if (data.participants.length < 10 && !data.participants.includes(currentUserId)) {
            await updateDoc(roomRef, { participants: arrayUnion(currentUserId) });
        }
    }

    setupScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    document.getElementById('room-display-id').textContent = `ID: ${roomId}`;

    const q = query(collection(db, "rooms", roomId, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        messagesContainer.innerHTML = ''; // Clear and re-render for simplicity in tracking states
        snapshot.docs.forEach(async (docSnap) => {
            const data = docSnap.data();
            const docId = docSnap.id;
            
            // Handle Expiry Timers
            if (data.expiresAt && Date.now() > data.expiresAt) {
                await deleteDoc(doc(db, "rooms", roomId, "messages", docId));
                return;
            }

            const decryptedContent = await decryptData(data.ciphertext, data.iv, cryptoKey);
            renderMessage(decryptedContent, data, docId);

            // Handle Read Receipts & Burn on Read
            if (data.senderId !== currentUserId && !data.seenBy?.includes(currentUserId)) {
                if (data.timer === 'burn') {
                    await deleteDoc(doc(db, "rooms", roomId, "messages", docId));
                } else {
                    await updateDoc(doc(db, "rooms", roomId, "messages", docId), { seenBy: arrayUnion(currentUserId) });
                }
            }
        });
    });
}

function renderMessage(content, data, docId) {
    const isMe = data.senderId === currentUserId;
    const wrapper = document.createElement('div');
    wrapper.className = `flex flex-col w-full ${isMe ? 'items-end' : 'items-start'}`;

    let innerContent = data.type === 'image' 
        ? `<img src="${content}" class="max-w-[200px] rounded-lg">` 
        : content;

    // Tick marks logic (✓ = sent, ✓✓ = seen by at least 1 person)
    const ticks = isMe ? (data.seenBy?.length > 0 ? `<span class="text-blue-400 ml-2 text-xs">✓✓</span>` : `<span class="text-slate-400 ml-2 text-xs">✓</span>`) : '';

    wrapper.innerHTML = `
        <div class="max-w-xs sm:max-w-md px-4 py-2 rounded-2xl text-sm ${isMe ? 'bg-teal-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-100 rounded-tl-none'}">
            ${innerContent} ${ticks}
        </div>
    `;
    messagesContainer.appendChild(wrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage(content, type = 'text') {
    if (!content || !cryptoKey) return;
    const encrypted = await encryptData(content, cryptoKey);
    
    let expiresAt = null;
    const timerVal = timerSelect.value;
    if (timerVal !== 'burn' && timerVal !== 'never') {
        expiresAt = Date.now() + (parseInt(timerVal) * 60 * 60 * 1000);
    }

    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
        ...encrypted,
        senderId: currentUserId,
        timestamp: Date.now(),
        type: type,
        timer: timerVal,
        expiresAt: expiresAt,
        seenBy: []
    });
}

// --- EVENT LISTENERS ---
document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(inputMessage.value.trim(), 'text');
    inputMessage.value = '';
});

inputFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.size < 500000) { // Limit to 500kb to prevent DB crash
        const reader = new FileReader();
        reader.onload = (e) => sendMessage(e.target.result, 'image');
        reader.readAsDataURL(file);
    } else {
        alert("Image too large. Must be under 500KB.");
    }
});

document.getElementById('btn-create-room').addEventListener('click', () => {
    const link = `${Math.random().toString(36).substring(2, 10)}:${generateRandomSecret(16)}`;
    window.location.hash = link;
    initializeChatRoom(...link.split(':'));
});

document.getElementById('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    let code = document.getElementById('input-join-code').value.trim();
    if (code.includes('#')) code = code.split('#')[1]; // Allow pasting full URLs
    if (code.includes(':')) {
        window.location.hash = code;
        initializeChatRoom(...code.split(':'));
    } else alert("Invalid Invite Code format.");
});

document.getElementById('btn-copy-link').addEventListener('click', () => navigator.clipboard.writeText(window.location.href));

document.getElementById('btn-delete-chat').addEventListener('click', async () => {
    if(!confirm("Destroy this room for everyone?")) return;
    const msgs = await getDocs(collection(db, "rooms", currentRoomId, "messages"));
    msgs.forEach(d => deleteDoc(d.ref));
    await deleteDoc(doc(db, "rooms", currentRoomId));
    window.location.hash = '';
    window.location.reload();
});

// Bootstrapper
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        const hash = window.location.hash.substring(1);
        if (hash.includes(':')) initializeChatRoom(...hash.split(':'));
    } else await signInAnonymously(auth);
});
