// api/chat.js
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    let messages = body?.messages;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Format messages salah' }), { status: 400 });
    }

    const lastMessageObj = messages[messages.length - 1];
    let lastText = "";
    
    // Deteksi teks dengan aman
    if (typeof lastMessageObj.content === 'string') {
      lastText = lastMessageObj.content.toLowerCase();
    } else if (Array.isArray(lastMessageObj.content)) {
      const textPart = lastMessageObj.content.find(c => c.type === 'text');
      if (textPart && textPart.text) {
        lastText = textPart.text.toLowerCase();
      }
    }

    // Deteksi perintah khusus
    let forcedProvider = null;
    if (lastText.includes('!openai')) forcedProvider = 'OpenAI';
    else if (lastText.includes('!groq')) forcedProvider = 'Groq';
    else if (lastText.includes('!gemini')) forcedProvider = 'Gemini';

    // Deteksi gambar
    const hasImage = Array.isArray(lastMessageObj.content) && 
                     lastMessageObj.content.some(item => item.type === 'image_url');

    const systemMessage = {
      role: 'system',
      content: `Anda adalah asisten AI. ATURAN WAJIB:
      1. Jika memberikan kode, SELALU bungkus dengan blok markdown tiga backtick.
      2. JANGAN memotong kode.`
    };

    const messagesWithSystem = [systemMessage, ...messages];

    // ==========================================
    // DAFTAR SEMUA MODEL (MASTER LIST)
    // ==========================================
    const allProviders = [
      {
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini',
      },
      {
        name: 'Groq',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: process.env.GROQ_API_KEY,
        model: 'openai/gpt-oss-120b',
      },
      
      {
        name: 'Gemini Lite', // Versi Cadangan (Anti-Limit)
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        apiKey: process.env.GEMINI_API_KEY,
        model: 'gemini-3.5-flash-lite',
      }
    ];

    let activeProviders = [...allProviders];

    // 1. Logika Perintah Khusus (Magic Commands)
    if (forcedProvider) {
      if (forcedProvider === 'Gemini') {
        // Jika !gemini, ambil KEDUA model Gemini
        activeProviders = activeProviders.filter(p => p.name.includes('Gemini'));
      } else {
        activeProviders = activeProviders.filter(p => p.name === forcedProvider);
      }
    }

    // 2. Logika Jika Ada Gambar
    if (hasImage) {
      console.log("[Info] Gambar terdeteksi.");
      // Buang Groq karena tidak mendukung gambar
      activeProviders = activeProviders.filter(p => p.name !== 'Groq');
      
      // Jika tidak ada perintah khusus, prioritaskan Gemini (Pro lalu Lite) di atas OpenAI
      if (!forcedProvider) {
        activeProviders.sort((a, b) => {
          const aIsGemini = a.name.includes('Gemini');
          const bIsGemini = b.name.includes('Gemini');
          return bIsGemini - aIsGemini; 
        });
      }
    }

    // ==========================================
    // MULAI PROSES FALLBACK
    // ==========================================
    for (const provider of activeProviders) {
      if (!provider.apiKey) continue;

      try {
        console.log(`[Mencoba] Menghubungi ${provider.name} (${provider.model})...`);
        
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
          console.log(`[Sukses] ${provider.name} menjawab.`);
          return new Response(response.body, {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              'Connection': 'keep-alive',
            },
          });
        }
        
        // Jika limit (429) atau sibuk (503), log akan mencatatnya lalu lanjut ke model berikutnya
        console.error(`[Gagal] ${provider.name} Error: ${response.status}. Lanjut ke model berikutnya...`);
        
      } catch (error) {
        console.error(`[Error Jaringan] ${provider.name}:`, error.message);
      }
    }

    // Jika semua model di daftar sudah dicoba dan semuanya gagal
    return new Response(JSON.stringify({ 
      error: `⚠️ Semua model AI sedang sibuk atau limit. Silakan coba beberapa saat lagi.` 
    }), { 
      status: 503, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
