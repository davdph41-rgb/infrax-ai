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
    
    // FITUR: Memaksa pencarian dengan !search
    const forceSearch = lastText.includes('!search');
    
    let forcedProvider = null;
    if (lastText.includes('!openai')) forcedProvider = 'OpenAI';
    else if (lastText.includes('!groq') || lastText.includes('!grok')) forcedProvider = 'Groq';
    else if (lastText.includes('!gemini')) forcedProvider = 'Gemini';

    const hasImage = Array.isArray(lastMessageObj.content) && lastMessageObj.content.some(i => i.type === 'image_url');
    
    const tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "WAJIB DIGUNAKAN jika user bertanya tentang berita terkini, kejadian hari ini, cuaca, harga saham, atau informasi apa pun yang terjadi setelah tahun 2024.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Kata kunci pencarian spesifik, contoh: 'berita AI hari ini' atau 'harga bitcoin sekarang'." }
            },
            required: ["query"]
          }
        }
      }
    ];

    const basePrompt = `Anda adalah asisten AI yang cerdas. ATURAN MUTLAK:
      1. JIKA memberikan kode, bungkus dengan blok markdown tiga backtick.
      2. JANGAN membungkus teks obrolan biasa ke dalam blok kode.
      3. Jika user bertanya tentang BERITA TERBARU, KEJADIAN HARI INI, atau HAL YANG REAL-TIME, Anda WAJIB memanggil fungsi 'web_search'.
      4. Setelah fungsi 'web_search' mengembalikan data, Anda WAJIB merangkum isi berita/data tersebut secara detail ke dalam jawaban Anda. Jangan hanya memberikan kalimat pembuka.`;
    
    const sysMsg = { role: 'system', content: customPrompt ? `${basePrompt}\n\nKEPRIBADIAN TAMBAHAN:\n${customPrompt}` : basePrompt };
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
    let searchDebugInfo = '';

    for (const p of active) {
      if (!p.apiKey) continue;
      try {
        let apiMessages = [sysMsg, ...cleanMessages];
        
        // Paksa tool_choice jika user mengetik !search
        const reqBody = { 
          model: p.model, 
          messages: apiMessages, 
          temperature: 0.3,
          tools: tools,
          tool_choice: forceSearch ? { type: "function", function: { name: "web_search" } } : "auto"
        };

        let res = await fetch(p.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
          body: JSON.stringify(reqBody),
        });

        if (res.ok) {
          let data = await res.json();
          let botMessage = data.choices[0].message;

          // JIKA AI MEMANGGIL FUNGSI PENCARIAN
          if (botMessage.tool_calls && botMessage.tool_calls.length > 0) {
            const toolCall = botMessage.tool_calls[0];
            const args = JSON.parse(toolCall.function.arguments);
            const query = args.query;
            
            console.log(`[Web Search] Mencari: ${query}`);
            
            if (!process.env.TAVILY_API_KEY) {
              searchDebugInfo = "⚠️ API Key Tavily belum diset di Netlify.";
            } else {
              // Tembak API Tavily
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
              
              // Jika Tavily berhasil, ambil hasilnya
              if (searchData.results && searchData.results.length > 0) {
                const resultsText = searchData.results.slice(0, 3).map(r => `Judul: ${r.title}\nKonten: ${r.content}`).join('\n\n');
                const searchResult = `Hasil Pencarian untuk "${query}":\n\n${resultsText}`;

                // Kirim balik ke AI
                apiMessages.push(botMessage);
                apiMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolCall.function.name,
                  content: searchResult
                });

                // Minta AI merangkum hasil pencarian
                res = await fetch(p.endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
                  body: JSON.stringify({ model: p.model, messages: apiMessages, temperature: 0.3 }),
                });
                
                data = await res.json();
                botMessage = data.choices[0].message;
              } else {
                searchDebugInfo = "⚠️ Tavily tidak menemukan hasil untuk pencarian ini.";
              }
            }
          } else {
             if (forceSearch) searchDebugInfo = "⚠️ AI gagal memanggil fungsi pencarian meskipun dipaksa.";
          }

          finalResponse = botMessage.content;
          if (searchDebugInfo) finalResponse = `${finalResponse}\n\n*(Info Sistem: ${searchDebugInfo})*`;
          
          usedProvider = p.name;
          break; 
        } else {
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
