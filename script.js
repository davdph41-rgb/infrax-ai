const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
let conversationHistory = [];

// Konfigurasi Marked.js (Parsing Markdown)
marked.setOptions({
  highlight: function (code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  breaks: true // Agar enter di chat jadi <br>
});

// Fungsi menambah pesan ke layar
function addMessage(content, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', sender);
  
  if (sender === 'bot') {
    const textSpan = document.createElement('span');
    textSpan.className = 'markdown-body';
    textSpan.innerHTML = marked.parse(content);
    msgDiv.appendChild(textSpan);
  } else {
    msgDiv.textContent = content;
  }
  
  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msgDiv;
}

// Fungsi menyisipkan tombol "Salin" ke setiap blok kode
function addCopyButtons(container) {
  const preElements = container.querySelectorAll('pre');
  
  preElements.forEach(pre => {
    // Cek jika tombol belum ada
    if (!pre.querySelector('.copy-btn')) {
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.innerHTML = '<i class="fas fa-copy"></i> Salin';
      
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code').innerText;
        navigator.clipboard.writeText(code).then(() => {
          btn.innerHTML = '<i class="fas fa-check"></i> Tersalin!';
          setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Salin'; }, 2000);
        });
      });
      
      pre.appendChild(btn);
    }
  });
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  userInput.value = '';
  conversationHistory.push({ role: 'user', content: text });

  sendBtn.disabled = true;
  userInput.disabled = true;
  
  // Siapkan pesan bot kosong
  const botMsgDiv = addMessage('', 'bot');
  const textSpan = botMsgDiv.querySelector('.markdown-body');
  
  const cursor = document.createElement('span');
  cursor.classList.add('typing-cursor');
  botMsgDiv.appendChild(cursor);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Gagal terhubung ke server');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;
    let fullText = '';

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.substring(6));
              const content = data.choices[0]?.delta?.content || '';
              
              if (content) {
                fullText += content;
                // Ubah teks mentah menjadi HTML cantik secara real-time
                textSpan.innerHTML = marked.parse(fullText); 
                chatBox.scrollTop = chatBox.scrollHeight;
              }
            } catch (e) {}
          }
        }
      }
    }

    // Setelah selesai, hapus kursor, warnai kode, & tambahkan tombol Salin
    botMsgDiv.removeChild(cursor);
    textSpan.innerHTML = marked.parse(fullText);
    addCopyButtons(textSpan);
    
    conversationHistory.push({ role: 'assistant', content: fullText });

  } catch (error) {
    if (botMsgDiv.contains(cursor)) botMsgDiv.removeChild(cursor);
    textSpan.innerHTML = `<span style="color: #d9534f;">${error.message}</span>`;
    conversationHistory.pop();
  } finally {
    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus();
  }
}

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { 
  if (e.key === 'Enter') sendMessage(); 
});
