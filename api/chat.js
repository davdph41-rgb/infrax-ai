exports.handler = async function(event, context) {
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
    let lastText = typeof lastMessageObj.content === 'string' ? lastMessageObj.content.toLowerCase() : 
                   (Array.isArray(lastMessageObj.content) ? (lastMessageObj.content.find(c => c.type === 'text')?.text || '').toLowerCase() : '');
    
    let forcedProvider = null;
    if (lastText.includes('!openai')) forcedProvider = 'OpenAI';
    else if (lastText.includes('!groq')) forcedProvider = 'Groq';
    else if (lastText.includes('!gemini')) forcedProvider = 'Gemini';

    const hasImage = Array.isArray(lastMessageObj.content) && lastMessageObj.content.some(i => i.type === 'image_url');
    
    // PERBAIKAN SYSTEM PROMPT: Lebih tegas membedakan kode dan teks biasa
    const sysMsg = { 
      role: 'system', 
      content: `Anda adalah asisten AI yang ramah. ATURAN MUTLAK:
      1. JIKA Anda memberikan kode pemrograman (HTML, CSS, JS, Python, dll), WAJIB bungkus dengan blok markdown tiga backtick (contoh: \`\`\`html ... \`\`\`).
      2. JANGAN PERNAH membungkus teks obrolan biasa, sapaan, atau penjelasan non-kode ke dalam blok kode. Jawab obrolan biasa dengan teks biasa (plain text).
      3. JANGAN memotong kode.` 
    };
    
    const finalMessages = [sysMsg, ...messages];

    const allProviders = [
      { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini' },
      { name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', apiKey: process.env.GROQ_API_KEY, model: 'openai/gpt-oss-120b' },
      { name: 'Gemini Pro', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', apiKey: process.env.GEMINI_API_KEY, model: 'gemini-3.5-flash' },
      { name: 'Gemini Lite', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', apiKey: process.env.GEMINI_API_KEY, model: 'gemini-3.5-flash-lite' }
    ];

    let active = [...allProviders];
    if (forcedProvider) active = forcedProvider === 'Gemini' ? active.filter(p => p.name.includes('Gemini')) : active.filter(p => p.name === forcedProvider);
    if (hasImage) active = active.filter(p => p.name !== 'Groq');

    let lastErrorMsg = "Semua server AI sibuk atau API Key belum diset.";

    for (const p of active) {
      if (!p.apiKey) continue;
      
      try {
        const res = await fetch(p.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
          body: JSON.stringify({ model: p.model, messages: finalMessages, temperature: 0.3 }),
        });

        if (res.ok) {
          const data = await res.json();
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'X-AI-Provider': p.name },
            body: JSON.stringify({ choices: [{ message: { content: data.choices[0].message.content } }] })
          };
        } else {
          lastErrorMsg = `${p.name} Error: ${res.status}`;
        }
      } catch (e) { 
        lastErrorMsg = `${p.name} Jaringan Error.`; 
      }
    }

    return { statusCode: 503, body: JSON.stringify({ error: lastErrorMsg }) };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: `Server Crash: ${error.message}` }) };
  }
};
