const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
let conversationHistory = [];

// Fungsi menambah pesan ke layar
function addMessage(text, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', sender);
  
  if (sender === 'bot') {
    // Jika bot, kita buat <span> untuk menampung teks streaming
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    msgDiv.appendChild(textSpan);
  } else {
    msgDiv.textContent = text;
  }
  
  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msgDiv;
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // 1. Tampilkan pesan user
  addMessage(text, 'user');
  userInput.value = '';
  conversationHistory.push({ role: 'user', content: text });

  // 2. Nonaktifkan tombol & siapkan gelembung chat bot
  sendBtn.disabled = true;
  userInput.disabled = true;
  
  const botMsgDiv = addMessage('', 'bot');
  const textSpan = botMsgDiv.querySelector('span');
  
  // Tambahkan kursor berkedip sebagai indikator AI sedang mengetik
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

    // 3. Baca Data Stream (Server-Sent Events)
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
          // Format SSE (Server-Sent Events) dari OpenAI/Gemini
          if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.substring(6));
              const content = data.choices[0]?.delta?.content || '';
              
              if (content) {
                fullText += content;
                textSpan.textContent = fullText; // Update teks secara real-time
                chatBox.scrollTop = chatBox.scrollHeight; // Auto scroll ke bawah
              }
            } catch (e) {
              // Abaikan error jika potongan JSON belum lengkap
            }
          }
        }
      }
    }

    // Hapus kursor setelah jawaban selesai
    botMsgDiv.removeChild(cursor);
    conversationHistory.push({ role: 'assistant', content: fullText });

  } catch (error) {
    // Jika error, hapus kursor dan tampilkan pesan error warna merah
    if (botMsgDiv.contains(cursor)) botMsgDiv.removeChild(cursor);
    textSpan.textContent = error.message;
    textSpan.style.color = '#d9534f';
    conversationHistory.pop(); // Hapus history user jika gagal
  } finally {
    // Aktifkan kembali input
    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus();
  }
}

// Event Listener
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { 
  if (e.key === 'Enter') sendMessage(); 
});
