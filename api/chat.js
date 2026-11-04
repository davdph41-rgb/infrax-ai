// api/chat.js untuk Netlify

exports.handler = async function(event, context) {
  // 1. Pastikan hanya menerima POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    let messages = body?.messages;

    if (!messages || !Array.isArray(messages)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Format messages salah' }) };
    }

    const lastMessageObj = messages[messages.length - 1];
    let lastText = "";
    
    if (typeof lastMessageObj.content === 'string') {
      lastText = lastMessageObj.content.toLowerCase();
    } else if (Array.isArray(lastMessageObj.content)) {
      const textPart = lastMessageObj.content.find(c => c.type === 'text');
      if (textPart && textPart.text) lastText = textPart.text.toLowerCase();
    }

    let forcedProvider = null;
    if (lastText.includes('!openai')) forcedProvider = 'OpenAI';
    else if (lastText.includes('!groq')) forcedProvider = 'Groq';
    else if (lastText.includes('!gemini')) forcedProvider = 'Gemini';

    const hasImage = Array.isArray(lastMessageObj.content) && 
                     lastMessageObj.content.some(item => item.type === 'image_url');

    const systemMessage = {
      role: 'system',
      content: `Anda adalah asisten AI. ATURAN WAJIB: 1. Jika memberikan kode, SELALU bungkus dengan blok markdown tiga backtick. 2. JANGAN memotong kode.`
    };

    const messagesWithSystem = [systemMessage, ...messages];

    const allProviders = [
      { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini' },
      { name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', apiKey: process.env.GROQ_API_KEY, model: 'openai/gpt-oss-120b' },
      { name: 'Gemini Pro', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', apiKey: process.env.GEMINI_API_KEY, model: 'gemini-3.5-flash' },
      { name: 'Gemini Lite', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', apiKey: process.env.GEMINI_API_KEY, model: 'gemini-3.5-flash-lite' }
    ];

    let activeProviders = [...allProviders];

    if (forcedProvider) {
      if (forcedProvider === 'Gemini') {
        activeProviders = activeProviders.filter(p => p.name.includes('Gemini'));
      } else {
        activeProviders = activeProviders.filter(p => p.name === forcedProvider);
      }
    }

    if (hasImage) {
      activeProviders = activeProviders.filter(p => p.name !== 'Groq');
      if (!forcedProvider) {
        activeProviders.sort((a, b) => (b.name.includes('Gemini') ? 1 : -1));
      }
    }

    for (const provider of activeProviders) {
      if (!provider.apiKey) continue;

      try {
        const response = await fetch(provider.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model: provider.model,
            messages: messagesWithSystem,
            stream: false, // Netlify Functions standar tidak mendukung streaming langsung, jadi kita ubah ke false sementara
            temperature: 0.3
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const botReply = data.choices[0].message.content;
          
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'X-AI-Provider': provider.name
            },
            body: JSON.stringify({ 
              choices: [{ message: { content: botReply } }] 
            })
          };
        }
      } catch (error) {
        console.error(`[Error] ${provider.name}:`, error.message);
      }
    }

    return { 
      statusCode: 503, 
      body: JSON.stringify({ error: `⚠️ Semua model AI sedang sibuk.` }) 
    };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
