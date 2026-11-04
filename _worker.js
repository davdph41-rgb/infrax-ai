export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Jika bukan rute /api/chat, tampilkan file statis (HTML/CSS/JS)
    if (url.pathname !== '/api/chat') {
      return env.ASSETS.fetch(request);
    }

    // 2. Logika API Chat
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
        status: 405, headers: { 'Content-Type': 'application/json' } 
      });
    }

    try {
      const body = await request.json();
      let messages = body?.messages;

      if (!messages || !Array.isArray(messages)) {
        return new Response(JSON.stringify({ error: 'Format messages salah' }), { 
          status: 400, headers: { 'Content-Type': 'application/json' } 
        });
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

      // --- AMBIL API KEY DARI ENV CLOUDFLARE (env.NAMA_KEY) ---
      const allProviders = [
        { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: env.OPENAI_API_KEY, model: 'gpt-4o-mini' },
        { name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', apiKey: env.GROQ_API_KEY, model: 'openai/gpt-oss-120b' },
        { name: 'Gemini Pro', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', apiKey: env.GEMINI_API_KEY, model: 'gemini-3.5-flash' },
        { name: 'Gemini Lite', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', apiKey: env.GEMINI_API_KEY, model: 'gemini-3.5-flash-lite' }
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
              stream: true,
              temperature: 0.3
            }),
          });

          if (response.ok) {
            return new Response(response.body, {
              headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-AI-Provider': provider.name,
                'Access-Control-Expose-Headers': 'X-AI-Provider'
              },
            });
          }
        } catch (error) {
          console.error(`[Error] ${provider.name}:`, error.message);
        }
      }

      return new Response(JSON.stringify({ error: `⚠️ Semua model AI sedang sibuk.` }), { 
        status: 503, headers: { 'Content-Type': 'application/json' } 
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, headers: { 'Content-Type': 'application/json' } 
      });
    }
  }
};
