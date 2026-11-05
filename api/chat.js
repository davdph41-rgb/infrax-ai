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
    
    // DETEKSI PERINTAH PENCARIAN
    const forceSearch = lastText.includes('!search');
    const searchQuery = forceSearch ? lastText.replace('!search', '').trim() : '';
    
    let forcedProvider = null;
    if (lastText.includes('!openai')) forcedProvider = 'OpenAI';
    else if (lastText.includes('!groq') || lastText.includes('!grok')) forcedProvider = 'Groq';
    else if (lastText.includes('!gemini')) forcedProvider = 'Gemini';

    const hasImage = Array.isArray(lastMessageObj.content) && lastMessageObj.content.some(i => i.type === 'image_url');
    
    // DEFINISI TOOLS UNTUK PERTANYAAN BIASA (Tanpa !search)
    const tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Mencari informasi terbaru di internet. Gunakan fungsi ini jika user bertanya tentang berita terkini, cuaca, atau fakta yang terjadi setelah tahun 2024.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Kata kunci pencarian." }
            },
            required: ["query"]
          }
        }
      }
    ];

    const basePrompt = `Anda adalah asisten AI yang cerdas. ATURAN MUTLAK:
      1. JIKA memberikan kode, bungkus dengan blok markdown tiga backtick.
      2. JANGAN membungkus teks obrolan biasa ke dalam blok kode.
      3. Anda memiliki akses ke data pencarian web. Jika ada data pencarian yang diberikan, GUNAKAN DATA ITU sebagai sumber utama jawaban Anda.`;
    
    let sysMsgContent = customPrompt ? `${basePrompt}\n\nKEPRIBADIAN TAMBAHAN:\n${customPrompt}` : basePrompt;

    // ==========================================
    // LOGIKA PENCARIAN PAKSA (Jika pakai !search)
    // ==========================================
    let searchContext = '';
    if (forceSearch && process.env.TAVILY_API_KEY && searchQuery) {
      try {
        const searchRes = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
            query: searchQuery,
            search_depth: "basic",
            include_answer: true
          })
        });
        
        const searchData = await searchRes.json();
        if (searchData.results && searchData.results.length > 0) {
          const resultsText = searchData.results.slice(0, 4).map(r => `Judul: ${r.title}\nKonten: ${r.content}`).join('\n\n');
          searchContext = `\n\nBERIKUT ADALAH HASIL PENCARIAN WEB TERBARU UNTUK "${searchQuery}":\n\n${resultsText}\n\nTUGAS ANDA: Rangkum hasil pencarian di atas dengan detail untuk menjawab pertanyaan user. Jangan katakan Anda tidak bisa mencari, karena datanya sudah disediakan di atas.`;
        }
      } catch (err) {
        console.error("Tavily Error:", err);
        searchContext = `\n\n(Sistem mencoba mencari "${searchQuery}" namun gagal terhubung ke internet).`;
      }
    }

    const finalSysMsg = { role: 'system', content: sysMsgContent + searchContext };
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
        let apiMessages = [finalSysMsg, ...cleanMessages];
        
        // JIKA KITA SUDAH MENCARI MANUAL (!search), KITA TIDAK PERLU KIRIM PARAMETER TOOLS LAGI.
        // JIKA TANPA !search, KITA KIRIM TOOLS AGAR AI BISA MEMUTUSKAN SENDIRI.
        const reqBody = { 
          model: p.model, 
          messages: apiMessages, 
          temperature: 0.3,
          ...(forceSearch ? {} : { tools: tools, tool_choice: "auto" })
        };

        let res = await fetch(p.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
          body: JSON.stringify(reqBody),
        });

        if (res.ok) {
          let data = await res.json();
          let botMessage = data.choices[0].message;

          // JIKA AI MEMILIH MENCARI SENDIRI (Tanpa dipaksa !search)
          if (!forceSearch && botMessage.tool_calls && botMessage.tool_calls.length > 0) {
            const toolCall = botMessage.tool_calls[0];
            const args = JSON.parse(toolCall.function.arguments);
            const query = args.query;
            
            if (process.env.TAVILY_API_KEY) {
              const searchRes = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: query, search_depth: "basic" })
              });
              
              const searchData = await searchRes.json();
              if (searchData.results && searchData.results.length > 0) {
                const resultsText = searchData.results.slice(0, 3).map(r => `Judul: ${r.title}\nKonten: ${r.content}`).join('\n\n');
                
                apiMessages.push(botMessage);
                apiMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: toolCall.function.name, content: resultsText });

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
