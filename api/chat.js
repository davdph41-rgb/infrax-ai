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

    // Cek apakah pesan terakhir mengandung gambar
    const lastMessage = messages[messages.length - 1];
    const hasImage = Array.isArray(lastMessage.content) && 
                     lastMessage.content.some(item => item.type === 'image_url');

    const systemMessage = {
      role: 'system',
      content: `Anda adalah asisten AI. ATURAN WAJIB:
      1. Jika memberikan kode, SELALU bungkus dengan blok markdown tiga backtick.
      2. JANGAN memotong kode.`
    };

    const messagesWithSystem = [systemMessage, ...messages];

    let providers = [
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
        name: 'Gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        apiKey: process.env.GEMINI_API_KEY,
        model: 'gemini-3.5-flash-lite',
      }
    ];

    // JIKA ADA GAMBAR: Hapus Groq dari daftar karena tidak mendukung gambar
    if (hasImage) {
      console.log("[Info] Gambar terdeteksi. Melewati Groq.");
      providers = providers.filter(p => p.name !== 'Groq');
    }

    for (const provider of providers) {
      if (!provider.apiKey) continue;

      try {
        console.log(`[Mencoba] Menghubungi ${provider.name}...`);
        
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
        
        console.error(`[Gagal] ${provider.name} Error: ${response.status}`);
      } catch (error) {
        console.error(`[Error Jaringan] ${provider.name}:`, error.message);
      }
    }

    return new Response(JSON.stringify({ 
      error: '⚠️ Semua server AI yang mendukung gambar sedang sibuk. Coba lagi nanti.' 
    }), { status: 503 });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
