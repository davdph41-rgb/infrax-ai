const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const uploadBtn = document.getElementById('upload-btn');
const imageInput = document.getElementById('image-input');
const previewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const cancelImageBtn = document.getElementById('cancel-image-btn');

let conversationHistory = [];
let selectedImageBase64 = null;

marked.setOptions({ breaks: true });

uploadBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 600; 
      const MAX_HEIGHT = 600; 
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
      } else {
        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      selectedImageBase64 = canvas.toDataURL('image/jpeg', 0.6);
      imagePreview.src = selectedImageBase64;
      previewContainer.style.display = 'block';
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

cancelImageBtn.addEventListener('click', () => {
  selectedImageBase64 = null;
  imageInput.value = '';
  previewContainer.style.display = 'none';
});

function addMessage(content, sender, imageBase64 = null) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', sender);
  
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

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text && !selectedImageBase64) return;

  const currentImage = selectedImageBase64;
  
  addMessage(text, 'user', currentImage);
  userInput.value = '';
  cancelImageBtn.click(); 
  
  let userContent;
  if (currentImage) {
    userContent = [
      { type: "text", text: text || "Tolong jelaskan gambar ini." },
      { type: "image_url", image_url: { url: currentImage } }
    ];
  } else {
    userContent = text;
  }
  
  conversationHistory.push({ role: 'user', content: userContent });

  sendBtn.disabled = true;
  userInput.disabled = true;
  
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

    // --- PERBAIKAN: SAFE PARSING ---
    if (!response.ok) {
      let errorMessage = 'Gagal terhubung ke server.';
      const contentType = response.headers.get("content-type");
      
      // Jika server membalas dengan JSON yang benar
      if (contentType && contentType.includes("application/json")) {
        try {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        } catch (e) {
          errorMessage = `Server Error (${response.status}).`;
        }
      } else {
        // Jika server crash dan mengirim HTML (bukan JSON)
        errorMessage = `⚠️ Server Vercel Crash atau Timeout (${response.status}). Coba beberapa saat lagi.`;
      }
      throw new Error(errorMessage);
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
    
    textSpan.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
    
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
