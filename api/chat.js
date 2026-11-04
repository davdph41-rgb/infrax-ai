// api/chat.js
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const messages = body?.messages;
    const apiKey = process.env.GROQ_API_KEY;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Format messages salah' }), { status: 400 });
    }
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key Groq belum diset di Vercel.' }), { status: 500 });
    }

    const systemMessage = {
      role: 'system',
      content: `Anda adalah asisten AI. ATURAN WAJIB:
      1. Jika memberikan kode, SELALU bungkus dengan blok markdown tiga backtick (contoh: \`\`\`html ... \`\`\`).
      2. JANGAN memotong kode. Pastikan kode tertutup dengan benar.
      3. Jika memberikan HTML dan CSS, pisahkan menjadi dua blok kode yang berbeda.
      4. Jangan pernah menulis kode di luar blok markdown.`
    };

    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    
    // Daftar model Groq yang VALID saat ini (2026)
    const modelsToTry = [
      'openai/gpt-oss-120b', // Model utama (paling cerdas)
      'openai/gpt-oss-20b',  // Model cadangan (lebih ringan)
      'qwen/qwen3.8-27b'     // Model cadangan alternatif
    ];

    let response;
    let isSuccess = false;

    for (const model of modelsToTry) {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [systemMessage, ...messages],
          stream: true,
          temperature: 0.3
        }),
      });

      // Jika berhasil, atau jika error bukan karena model (misal API Key salah), hentikan loop
      if (response.ok || response.status === 401) {
        isSuccess = response.ok;
        break;
      }
    }

    if (!isSuccess) {
      const errorData = await response.json().catch(() => ({}));
      return new Response(JSON.stringify({ 
        error: `⚠️ Gagal memproses (Kode: ${response.status}).`,
        details: errorData
      }), { status: response.status });
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
