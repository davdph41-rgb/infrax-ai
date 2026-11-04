// Daftarkan fungsi ke window agar bisa dipanggil dari HTML
window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open');
};

document.addEventListener('DOMContentLoaded', () => {
  const chatBox = document.getElementById('chat-box');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const imageInput = document.getElementById('image-input');
  const previewContainer = document.getElementById('image-preview-container');
  const imagePreview = document.getElementById('image-preview');
  const cancelImageBtn = document.getElementById('cancel-image-btn');
  const historyList = document.getElementById('chat-history-list');

  let currentChatId = null;
  let selectedImageBase64 = null;
  let allChats = []; 

  marked.setOptions({ breaks: true });

  async function fetchChats() {
    try {
      const res = await fetch('/api/history');
      if (!res.ok) throw new Error('Gagal mengambil daftar chat');
      allChats = await res.json();
      renderHistory();
    } catch (e) { console.error(e); }
  }

  function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = '';
    allChats.forEach(chat => {
      const div = document.createElement('div');
      div.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
      div.textContent = chat.title || 'Obrolan Baru';
      div.onclick = () => loadChat(chat.id);
      historyList.appendChild(div);
    });
  }

  async function createNewChat() {
    const id = Date.now().toString();
    const title = 'Obrolan Baru';
    
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'createChat', chatId: id, title })
    });

    currentChatId = id;
    chatBox.innerHTML = '';
    addMessage('Halo! Ada yang bisa dibantu?', 'bot', 'System');
    await fetchChats(); 
    if (window.innerWidth < 768) window.toggleSidebar();
  }

  async function loadChat(id) {
    currentChatId = id;
    chatBox.innerHTML = '';
    
    try {
      const res = await fetch(`/api/history?chatId=${id}`);
      if (!res.ok) throw new Error('Gagal memuat pesan');
      const messages = await res.json();
      
      messages.forEach(msg => {
        addMessage(msg.content, msg.role === 'user' ? 'user' : 'bot', msg.sender_name, null);
      });
    } catch (e) {
      addMessage('Gagal memuat riwayat chat dari server.', 'bot', 'System Error');
    }

    renderHistory();
    if (window.innerWidth < 768) window.toggleSidebar();
  }

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
  if (cancelImageBtn) {
    cancelImageBtn.addEventListener('click', () => {
      selectedImageBase64 = null; imageInput.value = ''; previewContainer.style.display = 'none';
    });
  }

  function addMessage(content, sender, senderName, imageBase64 = null) {
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

  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && !selectedImageBase64) return;

    if (!currentChatId) await createNewChat();

    const currentImage = selectedImageBase64;
    addMessage(text, 'user', 'You', currentImage);
    
    let userContent = currentImage ? [
      { type: "text", text: text || "Tolong jelaskan gambar ini." },
      { type: "image_url", image_url: { url: currentImage } }
    ] : text;

    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'addMessage', chatId: currentChatId, role: 'user', content: text, senderName: 'You'
      })
    });

    const currentChat = allChats.find(c => c.id === currentChatId);
    if (currentChat && currentChat.title === 'Obrolan Baru' && text) {
      const newTitle = text.substring(0, 25) + (text.length > 25 ? '...' : '');
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createChat', chatId: currentChatId, title: newTitle })
      });
      await fetchChats(); 
    }

    userInput.value = '';
    if (cancelImageBtn) cancelImageBtn.click(); 

    sendBtn.disabled = true;
    userInput.disabled = true;
    
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
        body: JSON.stringify({ messages: [{ role: 'user', content: userContent }] }),
      });

      if (!response.ok) {
        if (nameDiv) nameDiv.textContent = 'System Error';
        let errMsg = 'Gagal terhubung ke server.';
        try { const errData = await response.json(); errMsg = errData.error || errMsg; } catch (e) {}
        throw new Error(errMsg);
      }

      const aiName = response.headers.get('X-AI-Provider') || 'AI';
      if (nameDiv) nameDiv.textContent = aiName;

      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        const botReply = data.choices[0].message.content;
        
        botMsgDiv.removeChild(cursor);
        textSpan.innerHTML = marked.parse(botReply);
        textSpan.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
        addCopyButtons(textSpan);
        
        await fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'addMessage', chatId: currentChatId, role: 'assistant', content: botReply, senderName: aiName })
        });

      } else {
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
        
        await fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'addMessage', chatId: currentChatId, role: 'assistant', content: fullText, senderName: aiName })
        });
      }

    } catch (error) {
      if (botMsgDiv.contains(cursor)) botMsgDiv.removeChild(cursor);
      textSpan.innerHTML = `<span style="color: #d9534f;">${error.message}</span>`;
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

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (userInput) userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

  (async () => {
    await fetchChats();
    if (allChats.length > 0) {
      await loadChat(allChats[0].id);
    } else {
      await createNewChat();
    }
  })();
});
