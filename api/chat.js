// api/chat.js
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const messages = body?.messages;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Format messages salah' }), { status: 400 });
    }

    const systemMessage = {
      role: 'system',
      content: `Anda adalah asisten AI. ATURAN WAJIB:
      1. Jika memberikan kode, SELALU bungkus dengan blok markdown tiga backtick (contoh: \`\`\`html ... \`\`\`).
      2. JANGAN memotong kode. Pastikan kode tertutup dengan benar.
      3. Jangan pernah menulis kode di luar blok markdown.`
    };

    const messagesWithSystem = [systemMessage, ...messages];

    // ==========================================
    // SISTEM FALLBACK BERLAPIS
    // URUTAN: 1. OpenAI -> 2. Groq -> 3. Gemini
    // ==========================================
    const providers = [
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

    for (const provider of providers) {
      // Lewati jika API Key tidak ditemukan di Vercel
      if (!provider.apiKey) {
        console.log(`[SKIP] API Key untuk ${provider.name} tidak ditemukan.`);
        continue; 
      }

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

        // Jika sukses, langsung kirim respons ke layar chat
        if (response.ok) {
          console.log(`[Sukses] Berhasil terhubung ke ${provider.name}.`);
          return new Response(response.body, {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              'Connection': 'keep-alive',
            },
          });
        }

        console.error(`[Gagal] ${provider.name} merespons dengan kode: ${response.status}. Beralih ke penyedia berikutnya...`);
        
      } catch (error) {
        console.error(`[Error Jaringan] Gagal menghubungi ${provider.name}:`, error.message);
      }
    }

    // Jika ketiga-tiganya gagal
    return new Response(JSON.stringify({ 
      error: '⚠️ Semua server AI (OpenAI, Groq, Gemini) sedang sibuk atau limit. Silakan coba beberapa saat lagi.' 
    }), { status: 503 });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
