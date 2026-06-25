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
let currentRoomSecret = null;
let currentUserId = null;
let unsubFirestore = null;
let selectedMessageId = null;

const setupScreen = document.getElementById('setup-screen');
const chatScreen = document.getElementById('chat-screen');
const messagesContainer = document.getElementById('messages-container');
const inputMessage = document.getElementById('input-message');
const timerSelect = document.getElementById('timer-select');
const inputFile = document.getElementById('input-file');
const activeChatsSection = document.getElementById('active-chats-section');
const activeChatsList = document.getElementById('active-chats-list');
const contextMenu = document.getElementById('msg-context-menu');

function getSavedRooms() { return JSON.parse(localStorage.getItem('rd_active_slots') || '[]'); }

function saveRoomToDashboard(id, secret) {
    let slots = getSavedRooms();
    if (slots.some(s => s.id === id)) return true;
    if (slots.length >= 10) {
        alert("Dashboard full! Please delete an existing room session to track a new one.");
        return false;
    }
    slots.push({ id, secret });
    localStorage.setItem('rd_active_slots', JSON.stringify(slots));
    return true;
}

function renderDashboardList() {
    const slots = getSavedRooms();
    document.getElementById('chat-count').textContent = slots.length;
    if(slots.length > 0) {
        activeChatsSection.classList.remove('hidden');
        activeChatsList.innerHTML = '';
        slots.forEach(slot => {
            const row = document.createElement('div');
            row.className = "flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl hover:border-slate-700 transition";
            row.innerHTML = `
                <span class="text-xs font-mono text-slate-300 truncate max-w-[180px]">Node: ${slot.id}</span>
                <div class="flex gap-1">
                    <button class="btn-open py-1 px-2.5 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 text-xs font-semibold rounded-md transition">Open</button>
                    <button class="btn-forget py-1 px-2.5 text-slate-500 hover:text-red-400 text-xs font-semibold rounded-md transition">✕</button>
                </div>
            `;
            row.querySelector('.btn-open').addEventListener('click', () => {
                window.location.hash = `${slot.id}:${slot.secret}`;
                initializeChatRoom(slot.id, slot.secret);
            });
            row.querySelector('.btn-forget').addEventListener('click', () => {
                const filtered = getSavedRooms().filter(s => s.id !== slot.id);
                localStorage.setItem('rd_active_slots', JSON.stringify(filtered));
                renderDashboardList();
            });
            activeChatsList.appendChild(row);
        });
    } else activeChatsSection.classList.add('hidden');
}

function getHiddenMessages() { return JSON.parse(localStorage.getItem('rd_hidden_msgs') || '[]'); }

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

async function initializeChatRoom(roomId, roomSecret) {
    if (unsubFirestore) unsubFirestore(); 
    
    currentRoomId = roomId;
    currentRoomSecret = roomSecret;
    cryptoKey = await deriveKey(roomSecret);

    const roomRef = doc(db, "rooms", roomId);
    try {
        const roomSnap = await getDoc(roomRef);

        if (!roomSnap.exists()) {
            if (!saveRoomToDashboard(roomId, roomSecret)) return goHome();
            await setDoc(roomRef, { participants: [currentUserId], createdAt: Date.now() });
        } else {
            const data = roomSnap.data();
            if (data.participants.length >= 2 && !data.participants.includes(currentUserId)) {
                alert("Connection Blocked: This private channel is currently locked to its original 2 devices.");
                return goHome();
            }
            if (!saveRoomToDashboard(roomId, roomSecret)) return goHome();
            if (!data.participants.includes(currentUserId)) {
                await updateDoc(roomRef, { participants: arrayUnion(currentUserId) });
            }
        }
    } catch (e) {
        alert("Connection Blocked: Access Denied to this Node.");
        return goHome();
    }

    setupScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    document.getElementById('room-display-id').textContent = `Node: ${roomId}`;

    const q = query(collection(db, "rooms", roomId, "messages"), orderBy("timestamp", "asc"));
    unsubFirestore = onSnapshot(q, (snapshot) => {
        messagesContainer.innerHTML = '';
        const hiddenList = getHiddenMessages();

        snapshot.docs.forEach(async (docSnap) => {
            const data = docSnap.data();
            const docId = docSnap.id;
            
            if (hiddenList.includes(docId)) return;

            if (data.expiresAt && Date.now() > data.expiresAt) {
                await deleteDoc(doc(db, "rooms", roomId, "messages", docId));
                return;
            }

            const messagePayload = await decryptData(data.ciphertext, data.iv, cryptoKey);
            renderMessage(messagePayload, data, docId);

            if (data.senderId !== currentUserId && !data.seenBy?.includes(currentUserId)) {
                await updateDoc(doc(db, "rooms", roomId, "messages", docId), { seenBy: arrayUnion(currentUserId) });
            }
        });
    });
}

function renderMessage(content, data, docId) {
    const isMe = data.senderId === currentUserId;
    const wrapper = document.createElement('div');
    wrapper.className = `flex flex-col w-full cursor-pointer ${isMe ? 'items-end' : 'items-start'}`;

    let innerContent = data.type === 'image' 
        ? `<img src="${content}" class="max-w-[200px] rounded-lg mt-1">` 
        : `<p class="break-all mt-0.5">${content}</p>`;

    const ticks = isMe ? (data.seenBy?.length > 0 ? `<span class="text-teal-300 ml-1 text-[10px]">✓✓</span>` : `<span class="text-slate-500 ml-1 text-[10px]">✓</span>`) : '';
    const senderLabel = isMe ? "You" : "Peer";

    wrapper.innerHTML = `
        <div class="text-[10px] text-slate-500 px-1 font-semibold">${senderLabel}</div>
        <div class="max-w-xs sm:max-w-md px-4 py-2 rounded-2xl text-sm shadow-md transition hover:brightness-110 ${isMe ? 'bg-gradient-to-r from-teal-700 to-teal-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-100 rounded-tl-none'}">
            ${innerContent}
            <div class="text-right text-[9px] text-slate-400/70 mt-1 select-none">
                ${new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ${ticks}
            </div>
        </div>
    `;

    wrapper.addEventListener('click', () => {
        selectedMessageId = docId;
        contextMenu.classList.remove('hidden');
    });

    messagesContainer.appendChild(wrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage(content, type = 'text') {
    if (!content || !cryptoKey) return;
    
    const encrypted = await encryptData(content, cryptoKey);
    let expiresAt = null;
    const timerVal = timerSelect.value;
    if (timerVal !== 'never') {
        expiresAt = Date.now() + (parseInt(timerVal) * 60 * 60 * 1000);
    }

    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
        ...encrypted,
        senderId: currentUserId,
        timestamp: Date.now(),
        type: type,
        expiresAt: expiresAt,
        seenBy: []
    });
}

function goHome() {
    if (unsubFirestore) unsubFirestore();
    currentRoomId = null;
    cryptoKey = null;
    window.location.hash = '';
    chatScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    renderDashboardList();
}

document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(inputMessage.value.trim(), 'text');
    inputMessage.value = '';
});

inputFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.size < 500000) {
        const reader = new FileReader();
        reader.onload = (e) => sendMessage(e.target.result, 'image');
        reader.readAsDataURL(file);
    } else alert("Image size must remain underneath 500KB.");
});

document.getElementById('btn-create-room').addEventListener('click', () => {
    const uniqueRoom = Math.random().toString(36).substring(2, 10);
    const cryptoSecret = generateRandomSecret(16);
    const deepLink = `${uniqueRoom}:${cryptoSecret}`;
    window.location.hash = deepLink;
    initializeChatRoom(uniqueRoom, cryptoSecret);
});

document.getElementById('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    let code = document.getElementById('input-join-code').value.trim();
    if (code.includes('#')) code = code.split('#')[1];
    if (code.includes(':')) {
        window.location.hash = code;
        initializeChatRoom(...code.split(':'));
    } else alert("Bad invite block construction.");
});

document.getElementById('btn-home').addEventListener('click', goHome);
document.getElementById('btn-copy-link').addEventListener('click', () => navigator.clipboard.writeText(window.location.href));

document.getElementById('btn-delete-chat').addEventListener('click', async () => {
    if(!confirm("Wipe this entire chat node? This completely disconnects both endpoints.")) return;
    const msgs = await getDocs(collection(db, "rooms", currentRoomId, "messages"));
    msgs.forEach(d => deleteDoc(d.ref));
    await deleteDoc(doc(db, "rooms", currentRoomId));
    
    const remaining = getSavedRooms().filter(s => s.id !== currentRoomId);
    localStorage.setItem('rd_active_slots', JSON.stringify(remaining));
    goHome();
});

document.getElementById('btn-cancel-menu').addEventListener('click', () => contextMenu.classList.add('hidden'));
document.getElementById('btn-delete-me').addEventListener('click', () => {
    const hidden = getHiddenMessages();
    hidden.push(selectedMessageId);
    localStorage.setItem('rd_hidden_msgs', JSON.stringify(hidden));
    contextMenu.classList.add('hidden');
    initializeChatRoom(currentRoomId, currentRoomSecret); 
});
document.getElementById('btn-delete-everyone').addEventListener('click', async () => {
    if (selectedMessageId && currentRoomId) {
        await deleteDoc(doc(db, "rooms", currentRoomId, "messages", selectedMessageId));
    }
    contextMenu.classList.add('hidden');
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        renderDashboardList();
        const hash = window.location.hash.substring(1);
        if (hash.includes(':')) initializeChatRoom(...hash.split(':'));
    } else await signInAnonymously(auth);
});
