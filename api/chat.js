exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    let messages = body?.messages;
    let customPrompt = body?.systemPrompt || '';

    if (!messages || !Array.isArray(messages)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Format messages salah' }) };
    }

    const lastMessageObj = messages[messages.length - 1];
    let lastText = typeof lastMessageObj.content === 'string' ? lastMessageObj.content.toLowerCase() : 
                   (Array.isArray(lastMessageObj.content) ? (lastMessageObj.content.find(c => c.type === 'text')?.text || '').toLowerCase() : '');
    
    let forcedProvider = null;
    if (lastText.includes('!openai')) forcedProvider = 'OpenAI';
    else if (lastText.includes('!groq') || lastText.includes('!grok')) forcedProvider = 'Groq';
    else if (lastText.includes('!gemini')) forcedProvider = 'Gemini';

    const hasImage = Array.isArray(lastMessageObj.content) && lastMessageObj.content.some(i => i.type === 'image_url');
    
    // DEFINISI TOOLS (WEB SEARCH)
    const tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Mencari informasi terbaru di internet. Gunakan fungsi ini jika user bertanya tentang berita terkini, cuaca, harga, atau fakta yang mungkin berubah setelah tahun 2024.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Kata kunci pencarian yang spesifik dan jelas, contoh: 'harga emas hari ini' atau 'berita teknologi terbaru'."
              }
            },
            required: ["query"]
          }
        }
      }
    ];

    const basePrompt = `Anda adalah asisten AI yang ramah. ATURAN MUTLAK:
      1. JIKA Anda memberikan kode pemrograman, WAJIB bungkus dengan blok markdown tiga backtick.
      2. JANGAN PERNAH membungkus teks obrolan biasa ke dalam blok kode.
      3. JANGAN memotong kode.
      4. Jika Anda membutuhkan informasi real-time (berita/kejadian terkini), gunakan fungsi 'web_search'.`;
    
    const sysMsg = { 
      role: 'system', 
      content: customPrompt ? `${basePrompt}\n\nKEPRIBADIAN TAMBAHAN:\n${customPrompt}` : basePrompt
    };
    
    let cleanMessages = messages.map(msg => ({ role: msg.role, content: msg.content }));
    
    const allProviders = [
      { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini' },
      { name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', apiKey: process.env.GROQ_API_KEY, model: 'openai/gpt-oss-120b' },
      { name: 'Gemini Pro', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', apiKey: process.env.GEMINI_API_KEY, model: 'gemini-3.5-flash' },
      { name: 'Gemini Lite', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', apiKey: process.env.GEMINI_API_KEY, model: 'gemini-3.5-flash-lite' }
    ];

    let active = [...allProviders];
    if (forcedProvider) active = forcedProvider === 'Gemini' ? active.filter(p => p.name.includes('Gemini')) : active.filter(p => p.name === forcedProvider);
    if (hasImage) active = active.filter(p => p.name !== 'Groq');

    let lastErrorMsg = "Semua server AI sibuk.";
    let finalResponse = null;
    let usedProvider = '';

    for (const p of active) {
      if (!p.apiKey) continue;
      try {
        // TAHAP 1: Kirim Pesan & Definisi Tools ke AI
        let apiMessages = [sysMsg, ...cleanMessages];
        
        // Groq dan Gemini saat ini lebih aman jika parameter 'tools' hanya dikirim ke model yang support penuh
        // Kita coba kirim, jika error kita fallback (karena OpenAI compatibility mereka cukup baik)
        const reqBody = { 
          model: p.model, 
          messages: apiMessages, 
          temperature: 0.3,
          tools: tools,
          tool_choice: "auto"
        };

        let res = await fetch(p.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
          body: JSON.stringify(reqBody),
        });

        if (res.ok) {
          let data = await res.json();
          let botMessage = data.choices[0].message;

          // TAHAP 2: Cek apakah AI ingin memanggil fungsi Web Search
          if (botMessage.tool_calls && botMessage.tool_calls.length > 0) {
            const toolCall = botMessage.tool_calls[0];
            if (toolCall.function.name === 'web_search') {
              const args = JSON.parse(toolCall.function.arguments);
              const query = args.query;

              console.log(`[Web Search] Mencari: ${query}`);
              
              // EKSEKUSI PENCARIAN KE TAVILY
              if (process.env.TAVILY_API_KEY) {
                const searchRes = await fetch('https://api.tavily.com/search', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    api_key: process.env.TAVILY_API_KEY,
                    query: query,
                    search_depth: "basic",
                    include_answer: true
                  })
                });
                
                const searchData = await searchRes.json();
                const searchResult = searchData.answer || JSON.stringify(searchData.results.slice(0, 3));

                // TAHAP 3: Kirim hasil pencarian kembali ke AI agar dirangkum
                apiMessages.push(botMessage); // Pesan asli dari AI yang berisi tool_calls
                apiMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolCall.function.name,
                  content: searchResult
                });

                // Minta AI merangkum
                res = await fetch(p.endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
                  body: JSON.stringify({ model: p.model, messages: apiMessages, temperature: 0.3 }),
                });
                
                data = await res.json();
                botMessage = data.choices[0].message;
              }
            }
          }

          finalResponse = botMessage.content;
          usedProvider = p.name;
          break; // Sukses, hentikan loop provider
        } else {
          const errData = await res.json().catch(() => ({}));
          lastErrorMsg = `${p.name} Error: ${res.status}`;
        }
      } catch (e) { 
        lastErrorMsg = `${p.name} Jaringan Error.`; 
      }
    }

    if (finalResponse) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'X-AI-Provider': usedProvider },
        body: JSON.stringify({ choices: [{ message: { content: finalResponse } }] })
      };
    } else {
      return { statusCode: 503, body: JSON.stringify({ error: lastErrorMsg }) };
    }

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: `Server Crash: ${error.message}` }) };
  }
};
