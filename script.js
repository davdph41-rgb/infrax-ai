window.toggleSidebar = function() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('open');
};

document.addEventListener('DOMContentLoaded', () => {
  // Elemen UI
  const chatBox = document.getElementById('chat-box');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const imageInput = document.getElementById('image-input');
  const previewContainer = document.getElementById('image-preview-container');
  const imagePreview = document.getElementById('image-preview');
  const cancelImageBtn = document.getElementById('cancel-image-btn');
  const historyList = document.getElementById('chat-history-list');
  const newChatBtn = document.getElementById('new-chat-btn');
  const themeBtn = document.getElementById('theme-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const personaInput = document.getElementById('persona-input');
  const exportChatBtn = document.getElementById('export-chat-btn');
  const micBtn = document.getElementById('mic-btn');
  const scrollBottomBtn = document.getElementById('scroll-bottom-btn');

  let currentChatId = null;
  let selectedImageBase64 = null;
  let allChats = []; 
  let currentChatHistory = []; 
  let isGenerating = false;

  marked.setOptions({ breaks: true });

  // --- 1. DARK MODE ---
  const currentTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  themeBtn.innerHTML = currentTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';

  themeBtn.onclick = () => {
    const now = document.documentElement.getAttribute('data-theme');
    const newTheme = now === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    themeBtn.innerHTML = newTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  };

  // --- 2. SETTINGS & CUSTOM PROMPT ---
  personaInput.value = localStorage.getItem('persona') || '';
  settingsBtn.onclick = () => settingsModal.classList.add('open');
  closeSettingsBtn.onclick = () => {
    localStorage.setItem('persona', personaInput.value);
    settingsModal.classList.remove('open');
  };

  // --- 3. EXPORT CHAT ---
  exportChatBtn.onclick = () => {
    const chat = allChats.find(c => c.id === currentChatId);
    if (!chat) return alert('Belum ada chat.');
    
    let text = `Judul: ${chat.title}\nTanggal: ${new Date().toLocaleString()}\n\n`;
    currentChatHistory.forEach(msg => {
      const role = msg.role === 'user' ? 'You' : (msg.senderName || 'AI');
      const content = typeof msg.content === 'string' ? msg.content : '[Gambar]';
      text += `[${role}]:\n${content}\n\n`;
    });

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Chat-${chat.title.replace(/[^a-z0-9]/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- 4. SCROLL TO BOTTOM ---
  chatBox.addEventListener('scroll', () => {
    const isScrolledUp = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight > 100;
    scrollBottomBtn.style.display = isScrolledUp ? 'flex' : 'none';
  });
  scrollBottomBtn.onclick = () => chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });

  // --- 5. VOICE INPUT (MIC) ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    
    micBtn.onclick = () => {
      recognition.start();
      micBtn.style.color = 'red';
    };
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      userInput.value += text;
    };
    recognition.onend = () => { micBtn.style.color = ''; };
  } else {
    micBtn.style.display = 'none'; // Sembunyikan jika browser tidak mendukung
  }

  // --- 6. TEXT TO SPEECH (TTS) ---
  function speakText(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Hentikan suara sebelumnya
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      window.speechSynthesis.speak(utterance);
    } else {
      alert('Browser tidak mendukung Text-to-Speech.');
    }
  }

  // --- LOGIKA DATABASE & CHAT (Sama seperti sebelumnya) ---
  async function fetchChats() {
    try {
      const res = await fetch('/api/history');
      if (!res.ok) throw new Error('Gagal ambil data');
      allChats = await res.json();
      renderHistory();
      return true;
    } catch (e) { 
      chatBox.innerHTML = `<div style="color: red; padding: 15px;">⚠️ Error: ${e.message}</div>`;
      return false;
    }
  }

  function renderHistory() {
    historyList.innerHTML = '';
    allChats.forEach(chat => {
      const div = document.createElement('div');
      div.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
      
      const titleSpan = document.createElement('span');
      titleSpan.className = 'history-title';
      titleSpan.textContent = chat.title || 'Obrolan Baru';
      titleSpan.onclick = () => loadChat(chat.id);

      const actions = document.createElement('div');
      actions.className = 'history-actions';
      actions.innerHTML = `
        <i class="fas fa-edit" onclick="renameChat(event, '${chat.id}')"></i>
        <i class="fas fa-trash" onclick="deleteChat(event, '${chat.id}')"></i>
      `;
      
      div.appendChild(titleSpan);
      div.appendChild(actions);
      historyList.appendChild(div);
    });
  }

  // FUNGSI HAPUS & RENAME (Global window agar bisa dipanggil HTML)
  window.deleteChat = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Hapus obrolan ini secara permanen?')) return;
    await fetch(`/api/history?chatId=${id}`, { method: 'DELETE' });
    if (currentChatId === id) window.createNewChat();
    await fetchChats();
  };

  window.renameChat = async (e, id) => {
    e.stopPropagation();
    const newName = prompt('Ganti nama obrolan:', allChats.find(c => c.id === id).title);
    if (newName) {
      await fetch('/api/history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createChat', chatId: id, title: newName })
      });
      await fetchChats();
    }
  };

  window.createNewChat = async function() {
    try {
      const id = Date.now().toString();
      await fetch('/api/history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createChat', chatId: id, title: 'Obrolan Baru' })
      });
      currentChatId = id;
      currentChatHistory = [];
      chatBox.innerHTML = '';
      addMessage('Halo! Ada yang bisa dibantu?', 'bot', 'System');
      await fetchChats(); 
      if (window.innerWidth < 768) window.toggleSidebar();
    } catch(e) { alert(e.message); }
  };

  if (newChatBtn) newChatBtn.onclick = window.createNewChat;

  async function loadChat(id) {
    currentChatId = id;
    chatBox.innerHTML = '';
    try {
      const res = await fetch(`/api/history?chatId=${id}`);
      const messages = await res.json();
      currentChatHistory = messages;
      
      if (messages.length === 0) addMessage('Halo!', 'bot', 'System');
      else messages.forEach(msg => addMessage(msg.content, msg.role === 'user' ? 'user' : 'bot', msg.sender_name, null, false));
    } catch (e) { alert(e.message); }

    renderHistory();
    if (window.innerWidth < 768) window.toggleSidebar();
  }

  // UPLOAD GAMBAR
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
  }
  if (cancelImageBtn) cancelImageBtn.addEventListener('click', () => { selectedImageBase64 = null; imageInput.value = ''; previewContainer.style.display = 'none'; });

  // ADD MESSAGE (Dengan Tombol Aksi)
  function addMessage(content, sender, senderName, imageBase64 = null, isNew = true) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);
    
    if (senderName) {
      const nameDiv = document.createElement('div');
      nameDiv.className = 'sender-name';
      nameDiv.textContent = senderName;
      msgDiv.appendChild(nameDiv);
    }
    if (imageBase64) {
      const img = document.createElement('img');
      img.src = imageBase64;
      img.classList.add('chat-image');
      msgDiv.appendChild(img);
    }

    const textSpan = document.createElement('span');
    textSpan.className = 'markdown-body';
    if (sender === 'bot') textSpan.innerHTML = marked.parse(content || '');
    else textSpan.textContent = content || '';
    msgDiv.appendChild(textSpan);

    // Tambahkan tombol aksi untuk pesan AI yang sudah selesai
    if (sender === 'bot' && content && content !== 'Halo! Ada yang bisa dibantu?') {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      actions.innerHTML = `
        <i class="fas fa-volume-up" title="Bacakan" onclick="speakText(this.parentElement.previousElementSibling.innerText)"></i>
        ${isNew ? '<i class="fas fa-redo" title="Ulangi" onclick="regenerateResponse()"></i>' : ''}
      `;
      msgDiv.appendChild(actions);
    }

    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return msgDiv;
  }

  // REGENERATE (Ulangi Jawaban)
  window.regenerateResponse = async () => {
    if (isGenerating || !currentChatHistory.length) return;
    // Hapus pesan AI terakhir dari UI
    chatBox.lastElementChild.remove();
    // Hapus dari database (kita butuh endpoint khusus untuk ini, sementara kita abaikan dulu di DB dan langsung tembak API)
    // Hapus dari history memori
    currentChatHistory.pop(); 
    
    // Ambil pesan user terakhir
    const lastUserMsg = currentChatHistory[currentChatHistory.length - 1].content;
    
    // Tembak ulang
    await processAIGeneration(lastUserMsg, currentChatHistory, true);
  };

  // FUNGSI UTAMA KIRIM PESAN
  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && !selectedImageBase64) return;
    if (!currentChatId) await window.createNewChat();

    const currentImage = selectedImageBase64;
    addMessage(text, 'user', 'You', currentImage);
    
    let userContent = currentImage ? [
      { type: "text", text: text || "Tolong jelaskan gambar ini." },
      { type: "image_url", image_url: { url: currentImage } }
    ] : text;

    // Simpan ke DB
    await fetch('/api/history', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addMessage', chatId: currentChatId, role: 'user', content: text, senderName: 'You' })
    });

    // Update judul jika masih default
    const currentChat = allChats.find(c => c.id === currentChatId);
    if (currentChat && currentChat.title === 'Obrolan Baru' && text) {
      const newTitle = text.substring(0, 25) + (text.length > 25 ? '...' : '');
      await fetch('/api/history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createChat', chatId: currentChatId, title: newTitle })
      });
      await fetchChats(); 
    }

    userInput.value = '';
    if (cancelImageBtn) cancelImageBtn.click(); 

    currentChatHistory.push({ role: 'user', content: userContent });
    await processAIGeneration(userContent, currentChatHistory, false);
  }

  // FUNGSI MEMANGGIL API AI
  async function processAIGeneration(userContent, history, isRegenerate) {
    sendBtn.disabled = true;
    userInput.disabled = true;
    isGenerating = true;
    document.getElementById('status-text').textContent = 'Mengetik...';

    const botMsgDiv = addMessage('', 'bot', 'Menghubungkan...');
    const textSpan = botMsgDiv.querySelector('.markdown-body');
    const nameDiv = botMsgDiv.querySelector('.sender-name');
    const cursor = document.createElement('span');
    cursor.classList.add('typing-cursor');
    botMsgDiv.appendChild(cursor);

    try {
      const recentHistory = history.slice(-15); // Batasi 15 pesan terakhir
      const customPrompt = localStorage.getItem('persona') || '';

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: recentHistory, systemPrompt: customPrompt }),
      });

      if (!response.ok) {
        if (nameDiv) nameDiv.textContent = 'System Error';
        let errMsg = 'Gagal terhubung ke server.';
        try { const errData = await response.json(); errMsg = errData.error || errMsg; } catch (e) {}
        throw new Error(errMsg);
      }

      const aiName = response.headers.get('X-AI-Provider') || 'AI';
      if (nameDiv) nameDiv.textContent = aiName;

      const data = await response.json();
      const botReply = data.choices[0].message.content;
      
      botMsgDiv.removeChild(cursor);
      textSpan.innerHTML = marked.parse(botReply);
      textSpan.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
      addCopyButtons(textSpan);
      
      // Tambahkan tombol aksi setelah selesai
      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      actions.innerHTML = `
        <i class="fas fa-volume-up" title="Bacakan" onclick="speakText(this.parentElement.previousElementSibling.innerText)"></i>
        <i class="fas fa-redo" title="Ulangi" onclick="regenerateResponse()"></i>
      `;
      botMsgDiv.appendChild(actions);

      // Simpan ke DB
      await fetch('/api/history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addMessage', chatId: currentChatId, role: 'assistant', content: botReply, senderName: aiName })
      });
      
      currentChatHistory.push({ role: 'assistant', content: botReply });

    } catch (error) {
      if (botMsgDiv.contains(cursor)) botMsgDiv.removeChild(cursor);
      textSpan.innerHTML = `<span style="color: #d9534f;">${error.message}</span>`;
      if (!isRegenerate) currentChatHistory.pop();
    } finally {
      sendBtn.disabled = false;
      userInput.disabled = false;
      userInput.focus();
      isGenerating = false;
      document.getElementById('status-text').textContent = 'Online';
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

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (userInput) userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

  (async () => {
    const success = await fetchChats();
    if (success && allChats.length > 0) await loadChat(allChats[0].id);
    else if (success) await window.createNewChat();
  })();
});
