// Daftarkan fungsi ke window agar bisa dipanggil dari HTML (tombol menu)
window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open');
};

document.addEventListener('DOMContentLoaded', () => {
  // Elemen UI Utama
  const chatBox = document.getElementById('chat-box');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const imageInput = document.getElementById('image-input');
  const previewContainer = document.getElementById('image-preview-container');
  const imagePreview = document.getElementById('image-preview');
  const cancelImageBtn = document.getElementById('cancel-image-btn');
  
  // Elemen UI Sidebar
  const historyList = document.getElementById('chat-history-list');

  // State Aplikasi
  let allChats = {};
  try { 
    allChats = JSON.parse(localStorage.getItem('nexus_chats')) || {}; 
  } catch(e) {
    console.error("Data lokal rusak, mereset...");
    localStorage.removeItem('nexus_chats');
  }
  
  let currentChatId = localStorage.getItem('nexus_current_chat_id') || null;
  let selectedImageBase64 = null;

  // Konfigurasi Markdown
  marked.setOptions({ breaks: true });

  // --- FUNGSI PENYIMPANAN LOKAL ---
  function saveToStorage() {
    localStorage.setItem('nexus_chats', JSON.stringify(allChats));
    localStorage.setItem('nexus_current_chat_id', currentChatId);
  }

  // --- FUNGSI RIWAYAT CHAT (SIDEBAR) ---
  function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = '';
    
    // Urutkan dari yang terbaru
    Object.values(allChats).sort((a, b) => b.timestamp - a.timestamp).forEach(chat => {
      const div = document.createElement('div');
      div.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
      div.textContent = chat.title || 'Obrolan Baru';
      div.onclick = () => loadChat(chat.id);
      historyList.appendChild(div);
    });
  }

  window.createNewChat = function() {
    const id = Date.now().toString();
    allChats[id] = { id: id, title: 'Obrolan Baru', messages: [], timestamp: Date.now() };
    currentChatId = id;
    saveToStorage();
    renderHistory();
    
    // Bersihkan layar dan beri sapaan
    chatBox.innerHTML = '';
    addMessage('Halo! Ada topik baru yang ingin dibahas?', 'bot', 'System');
    
    // Tutup sidebar otomatis di HP
    if (window.innerWidth < 768) window.toggleSidebar();
  };

  function loadChat(id) {
    currentChatId = id;
    saveToStorage();
    chatBox.innerHTML = '';
    
    // Render ulang semua pesan dari topik yang dipilih
    allChats[id].messages.forEach(msg => {
      let text = typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) ? msg.content.find(c => c.type === 'text')?.text || '' : '');
      let img = Array.isArray(msg.content) ? msg.content.find(c => c.type === 'image_url')?.image_url.url : null;
      addMessage(text, msg.role === 'user' ? 'user' : 'bot', msg.senderName, img);
    });
    
    renderHistory();
    if (window.innerWidth < 768) window.toggleSidebar();
  }

  // --- FUNGSI UPLOAD GAMBAR ---
  if (uploadBtn) uploadBtn.addEventListener('click', () => imageInput.click());
  
  if (imageInput) {
    imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX = 600; // Kompresi maksimal 600px agar ringan
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
  }

  if (cancelImageBtn) {
    cancelImageBtn.addEventListener('click', () => {
      selectedImageBase64 = null; 
      imageInput.value = ''; 
      previewContainer.style.display = 'none';
    });
  }

  // --- FUNGSI MENAMPILKAN PESAN KE LAYAR ---
  function addMessage(content, sender, senderName, imageBase64 = null) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);
    
    // Tampilkan Nama (You / Nama AI)
    if (senderName) {
      const nameDiv = document.createElement('div');
      nameDiv.className = 'sender-name';
      nameDiv.textContent = senderName;
      msgDiv.appendChild(nameDiv);
    }

    // Tampilkan Gambar jika ada
    if (imageBase64) {
      const img = document.createElement('img');
      img.src = imageBase64;
      img.classList.add('chat-image');
      msgDiv.appendChild(img);
    }

    // Tampilkan Teks
    if (sender === 'bot') {
      const textSpan = document.createElement('span');
      textSpan.className = 'markdown-body';
      textSpan.innerHTML = marked.parse(content || '');
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

  // --- FUNGSI UTAMA KIRIM PESAN ---
  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && !selectedImageBase64) return;

    if (!currentChatId || !allChats[currentChatId]) window.createNewChat();

    const currentImage = selectedImageBase64;
    
    // 1. Tampilkan pesan User di layar
    addMessage(text, 'user', 'You', currentImage);
    
    // 2. Format pesan untuk backend
    let userContent = currentImage ? [
      { type: "text", text: text || "Tolong jelaskan gambar ini." },
      { type: "image_url", image_url: { url: currentImage } }
    ] : text;

    allChats[currentChatId].messages.push({ role: 'user', content: userContent, senderName: 'You' });
    
    // Update Judul di Sidebar
    if (allChats[currentChatId].title === 'Obrolan Baru' && text) {
      allChats[currentChatId].title = text.substring(0, 25) + (text.length > 25 ? '...' : '');
    }
    
    userInput.value = '';
    if (cancelImageBtn) cancelImageBtn.click(); 
    saveToStorage();
    renderHistory();

    sendBtn.disabled = true;
    userInput.disabled = true;
    
    // 3. Tampilkan loading "Menghubungkan..." pada bot
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

      // --- PERBAIKAN ERROR HANDLING: BACA PESAN ASLI DARI SERVER ---
      if (!response.ok) {
        if (nameDiv) nameDiv.textContent = 'System Error';
        let errMsg = 'Gagal terhubung ke server.';
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch (e) {}
        throw new Error(errMsg);
      }

      // Baca nama AI yang menjawab
      const aiName = response.headers.get('X-AI-Provider') || 'AI';
      if (nameDiv) nameDiv.textContent = aiName;

      const contentType = response.headers.get('content-type');
      
      // JIKA NETLIFY (Balasan JSON Biasa / Utuh)
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        const botReply = data.choices[0].message.content;
        
        botMsgDiv.removeChild(cursor);
        textSpan.innerHTML = marked.parse(botReply);
        textSpan.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
        addCopyButtons(textSpan);
        
        allChats[currentChatId].messages.push({ role: 'assistant', content: botReply, senderName: aiName });
        saveToStorage();

      } else {
        // JIKA VERCEL (Balasan Stream / Kata demi kata)
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
        allChats[currentChatId].messages.push({ role: 'assistant', content: fullText, senderName: aiName });
        saveToStorage();
      }

    } catch (error) {
      if (botMsgDiv.contains(cursor)) botMsgDiv.removeChild(cursor);
      textSpan.innerHTML = `<span style="color: #d9534f;">${error.message}</span>`;
      allChats[currentChatId].messages.pop(); // Hapus pesan user terakhir jika gagal
    } finally {
      sendBtn.disabled = false;
      userInput.disabled = false;
      userInput.focus();
    }
  }

  // --- FUNGSI TOMBOL SALIN KODE ---
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

  // --- EVENT LISTENERS ---
  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (userInput) userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

  // --- INISIALISASI SAAT PERTAMA KALI DIBUKA ---
  if (currentChatId && allChats[currentChatId]) {
    loadChat(currentChatId);
  } else {
    window.createNewChat();
  }
});
