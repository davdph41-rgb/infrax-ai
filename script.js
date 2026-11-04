const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
let conversationHistory = [];

function addMessage(text, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', sender);
  msgDiv.textContent = text;
  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  userInput.value = '';
  conversationHistory.push({ role: 'user', content: text });

  try {
    // Panggil backend API kita sendiri, BUKAN InferX langsung
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Gagal mendapatkan respons.');
    }

    const data = await response.json();
    const botReply = data.choices[0].message.content;
    addMessage(botReply, 'bot');
    conversationHistory.push({ role: 'assistant', content: botReply });
  } catch (error) {
    addMessage('Error: ' + error.message, 'bot');
  }
}

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });