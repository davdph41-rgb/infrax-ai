const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
let conversationHistory = [];

// Fungsi untuk menambahkan pesan ke layar
function addMessage(text, sender, isHTML = false) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', sender);
  if (isHTML) {
    msgDiv.innerHTML = text;
  } else {
    msgDiv.textContent = text;
  }
  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msgDiv;
}

// Fungsi untuk mengirim pesan
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // Tampilkan pesan user
  addMessage(text, 'user');
  userInput.value = '';
  conversationHistory.push({ role: 'user', content: text });

  // Nonaktifkan tombol & input sementara
  sendBtn.disabled = true;
  userInput.disabled = true;

  // Tampilkan indikator mengetik
  const loadingDiv = document.createElement('div');
  loadingDiv.classList.add('loading');
  loadingDiv.textContent = 'Mengetik...';
  chatBox.appendChild(loadingDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory }),
    });

    const data = await response.json();

    // Hapus indikator mengetik
    chatBox.removeChild(loadingDiv);

    if (!response.ok) {
      // Jika error dari backend (misal 429), tampilkan pesannya
      throw new Error(data.error || 'Gagal mendapatkan respons.');
    }

    const botReply = data.choices[0].message.content;
    addMessage(botReply, 'bot');
    conversationHistory.push({ role: 'assistant', content: botReply });

  } catch (error) {
    // Jika terjadi error (termasuk error 429 yang dilempar dari atas)
    if (chatBox.contains(loadingDiv)) {
      chatBox.removeChild(loadingDiv);
    }
    // Tampilkan error dengan warna merah (opsional)
    const errorMsg = addMessage(error.message, 'bot');
    errorMsg.style.color = '#d9534f'; 
    
    // Hapus pesan terakhir user dari history agar tidak error berulang
    conversationHistory.pop(); 
  } finally {
    // Aktifkan kembali input
    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus();
  }
}

// Event Listeners
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { 
  if (e.key === 'Enter') sendMessage(); 
});
