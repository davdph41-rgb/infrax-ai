const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const uploadBtn = document.getElementById('upload-btn');
const imageInput = document.getElementById('image-input');
const previewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const cancelImageBtn = document.getElementById('cancel-image-btn');

// Elemen UI Sidebar
const menuBtn = document.getElementById('menu-btn');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const newChatBtn = document.getElementById('new-chat-btn');
const historyList = document.getElementById('chat-history-list');

// State Aplikasi
let allChats = JSON.parse(localStorage.getItem('nexus_chats')) || {};
let currentChatId = localStorage.getItem('nexus_current_chat_id') || null;
let selectedImageBase64 = null;

marked.setOptions({ breaks: true });

// --- LOGIKA SIDEBAR ---
function toggleSidebar() {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}
menuBtn.addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);

// ==========================================
// FUNGSI DATABASE (NANTI AKAN DIGANTI KE NEON)
// ==========================================
function saveToStorage() {
  localStorage.setItem('nexus_chats', JSON.stringify(allChats));
  localStorage.setItem('nexus_current_chat_id', currentChatId);
}

// ==========================================
// LOGIKA RIWAYAT & TAB
// ==========================================
function renderHistory() {
  historyList.innerHTML = '';
  const sortedChats = Object.values(allChats).sort((a, b) => b.timestamp - a.timestamp);
  
  sortedChats.forEach(chat => {
    const div = document.createElement('div');
    div.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
    div.textContent = chat.title || 'Obrolan Baru';
    div.onclick = () => loadChat(chat.id);
    historyList.appendChild(div);
  });
}

function createNewChat() {
  const id = Date.now().toString();
  allChats[id] = { id: id, title: 'Obrolan Baru', messages: [], timestamp: Date.now() };
  currentChatId = id;
  saveToStorage();
  renderHistory();
  
  // Bersihkan layar dan beri sapaan
  chatBox.innerHTML = '';
  addMessage('Halo! Ada topik baru yang ingin dibahas?', 'bot', 'System');
  if (window.innerWidth < 768) toggleSidebar(); // Tutup sidebar otomatis di HP
}

function loadChat(id) {
  currentChatId = id;
  saveToStorage();
  chatBox.innerHTML = '';
  
  // Render semua pesan dari tab tersebut
  allChats[id].messages.forEach(msg => {
    let text = typeof msg.content === 'string' ? msg.content : msg.content.find(c => c.type === 'text')?.text || '';
    let img = Array.isArray(msg.content) ? msg.content.find(c => c.type === 'image_url')?.image_url.url : null;
    addMessage(text, msg.role === 'user' ? 'user' : 'bot', msg.senderName, img);
  });
  
  renderHistory();
  if (window.innerWidth < 768) toggleSidebar();
}

newChatBtn.addEventListener('click', createNewChat);

// --- LOGIKA UPLOAD GAMBAR ---
uploadBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 600;
      let width = img.width, height = img.height;
      if (width > height && width > MAX) { height *= MAX / width; width = MAX; }
      else if (height > MAX) { width *= MAX / height; height = MAX; }
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      selectedImageBase64 = canvas.toDataURL('image/jpeg', 0.6);
      imagePreview.src = selectedImageBase64;
      previewContainer.style.display = 'block';
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});
cancelImageBtn.addEventListener('click', () => {
  selectedImageBase64 = null; imageInput.value = ''; previewContainer.style.display = 'none';
});

// --- FUNGSI CHAT & TAMPILAN NAMA ---
function addMessage(content, sender, senderName, imageBase64 = null) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', sender);
  
  if (senderName) {
    const nameDiv = document.createElement('div');
    nameDiv.classList.add('sender-name');
    // Paksa gaya inline agar dijamin muncul
    nameDiv.style.fontSize = '11px';
    nameDiv.style.fontWeight = 'bold';
    nameDiv.style.marginBottom = '4px';
    nameDiv.style.textTransform = 'uppercase';
    nameDiv.style.color = sender === 'user' ? '#5a8a62' : '#075e54'; 
    nameDiv.style.textAlign = sender === 'user' ? 'right' : 'left';
    nameDiv.textContent = senderName;
    msgDiv.appendChild(nameDiv);
  }

  if (imageBase64) {
    const img = document.createElement('img');
    img.src = imageBase64;
    img.classList.add('chat-image');
    msgDiv.appendChild(img);
  }

  if (sender === 'bot') {
    const textSpan = document.createElement('span');
    textSpan.className = 'markdown-body';
    textSpan.innerHTML = marked.parse(content);
    msgDiv.appendChild(textSpan);
  } else {
    if (content) {
      const textNode = document.createElement('span');
      textNode.textContent = content;
      msgDiv.appendChild(textNode);
    }
  }
  
  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msgDiv;
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text && !selectedImageBase64) return;

  if (!currentChatId) createNewChat();

  const currentImage = selectedImageBase64;
  
  // 1. Tampilkan pesan User
  addMessage(text, 'user', 'You', currentImage);
  
  // 2. Siapkan format pesan
  let userContent = currentImage ? [
    { type: "text", text: text || "Tolong jelaskan gambar ini." },
    { type: "image_url", image_url: { url: currentImage } }
  ] : text;

  // Simpan ke state lokal
  allChats[currentChatId].messages.push({ role: 'user', content: userContent, senderName: 'You' });
  
  // Update judul tab jika ini pesan pertama
  if (allChats[currentChatId].title === 'Obrolan Baru' && text) {
    allChats[currentChatId].title = text.substring(0, 25) + (text.length > 25 ? '...' : '');
  }
  
  userInput.value = '';
  cancelImageBtn.click(); 
  saveToStorage();
  renderHistory();

  sendBtn.disabled = true;
  userInput.disabled = true;
  
  // 3. Tampilkan pesan Bot sementara
  const botMsgDiv = addMessage('', 'bot', 'Menghubungkan...');
  const textSpan = botMsgDiv.querySelector('.markdown-body');
  const nameDiv = botMsgDiv.querySelector('.sender-name');
  
  const cursor = document.createElement('span');
  cursor.classList.add('typing-cursor');
  botMsgDiv.appendChild(cursor);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: allChats[currentChatId].messages }),
    });

    if (!response.ok) {
      if (nameDiv) nameDiv.textContent = 'System Error';
      throw new Error('Gagal terhubung ke server.');
    }

    // 4. BACA NAMA AI DARI HEADER VERCEL
    const aiName = response.headers.get('X-AI-Provider') || 'AI';
    if (nameDiv) nameDiv.textContent = aiName; // Ganti nama "Menghubungkan..." dengan nama AI

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false, fullText = '', buffer = '';

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); 

        for (const line of lines) {
          if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.substring(6));
              const content = data.choices[0]?.delta?.content || '';
              if (content) {
                fullText += content;
                textSpan.innerHTML = marked.parse(fullText); 
                chatBox.scrollTop = chatBox.scrollHeight;
              }
            } catch (e) {}
          }
        }
      }
    }

    botMsgDiv.removeChild(cursor);
    textSpan.innerHTML = marked.parse(fullText);
    textSpan.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
    addCopyButtons(textSpan);
    
    // 5. Simpan balasan AI ke state lokal
    allChats[currentChatId].messages.push({ role: 'assistant', content: fullText, senderName: aiName });
    saveToStorage();

  } catch (error) {
    if (botMsgDiv.contains(cursor)) botMsgDiv.removeChild(cursor);
    textSpan.innerHTML = `<span style="color: #d9534f;">${error.message}</span>`;
    allChats[currentChatId].messages.pop(); // Batalkan simpan pesan user jika error
  } finally {
    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus();
  }
}

function addCopyButtons(container) {
  container.querySelectorAll('pre').forEach(pre => {
    if (!pre.querySelector('.copy-btn')) {
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.innerHTML = '<i class="fas fa-copy"></i> Salin';
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(pre.querySelector('code').innerText).then(() => {
          btn.innerHTML = '<i class="fas fa-check"></i> Tersalin!';
          setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Salin'; }, 2000);
        });
      });
      pre.appendChild(btn);
    }
  });
}

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

// --- INISIALISASI SAAT APLIKASI DIBUKA ---
if (currentChatId && allChats[currentChatId]) {
  loadChat(currentChatId);
} else {
  createNewChat();
}
