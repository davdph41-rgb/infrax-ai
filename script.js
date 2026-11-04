// Langsung daftarkan fungsi ke window agar tidak menunggu DOM selesai
window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open');
};

// Fungsi inisialisasi utama
window.onload = function() {
  const chatBox = document.getElementById('chat-box');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const historyList = document.getElementById('chat-history-list');

  let allChats = {};
  try { allChats = JSON.parse(localStorage.getItem('nexus_chats')) || {}; } catch(e){}
  let currentChatId = localStorage.getItem('nexus_current_chat_id') || null;

  function saveToStorage() {
    localStorage.setItem('nexus_chats', JSON.stringify(allChats));
    localStorage.setItem('nexus_current_chat_id', currentChatId);
  }

  function renderHistory() {
    historyList.innerHTML = '';
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
    chatBox.innerHTML = '';
    addMessage('Halo! Ada yang bisa dibantu?', 'bot', 'System');
    if (window.innerWidth < 768) window.toggleSidebar();
  };

  function loadChat(id) {
    currentChatId = id;
    saveToStorage();
    chatBox.innerHTML = '';
    allChats[id].messages.forEach(msg => {
      addMessage(msg.content, msg.role === 'user' ? 'user' : 'bot', msg.senderName);
    });
    renderHistory();
    if (window.innerWidth < 768) window.toggleSidebar();
  }

  function addMessage(content, sender, senderName) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);
    if (senderName) {
      const nameDiv = document.createElement('div');
      nameDiv.className = 'sender-name';
      nameDiv.textContent = senderName;
      msgDiv.appendChild(nameDiv);
    }
    if (sender === 'bot') {
      const textSpan = document.createElement('span');
      textSpan.innerHTML = marked.parse(content || '');
      msgDiv.appendChild(textSpan);
    } else {
      msgDiv.appendChild(document.createTextNode(content));
    }
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return msgDiv;
  }

  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;
    if (!currentChatId || !allChats[currentChatId]) window.createNewChat();

    addMessage(text, 'user', 'You');
    allChats[currentChatId].messages.push({ role: 'user', content: text, senderName: 'You' });
    
    if (allChats[currentChatId].title === 'Obrolan Baru') {
      allChats[currentChatId].title = text.substring(0, 20);
    }
    userInput.value = '';
    saveToStorage();
    renderHistory();

    const botMsgDiv = addMessage('Mengetik...', 'bot', 'Menghubungkan...');
    const textSpan = botMsgDiv.querySelector('span');
    const nameDiv = botMsgDiv.querySelector('.sender-name');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allChats[currentChatId].messages }),
      });

      const aiName = response.headers.get('X-AI-Provider') || 'AI';
      if (nameDiv) nameDiv.textContent = aiName;
      textSpan.textContent = '';

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.choices[0]?.delta?.content) {
                fullText += data.choices[0].delta.content;
                textSpan.innerHTML = marked.parse(fullText);
                chatBox.scrollTop = chatBox.scrollHeight;
              }
            } catch (e) {}
          }
        }
      }
      allChats[currentChatId].messages.push({ role: 'assistant', content: fullText, senderName: aiName });
      saveToStorage();
    } catch (error) {
      textSpan.textContent = 'Error koneksi.';
    }
  }

  sendBtn.onclick = sendMessage;
  userInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

  if (currentChatId && allChats[currentChatId]) loadChat(currentChatId);
  else window.createNewChat();
};
