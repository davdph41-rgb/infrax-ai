// api/chat.js
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    let messages = body?.messages;
    const apiKey = process.env.OPENAI_API_KEY; // <-- Menggunakan API Key OpenAI

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Format messages salah' }), { status: 400 });
    }
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key OpenAI belum diset di Vercel.' }), { status: 500 });
    }

    // System Prompt agar AI rapi dalam memberikan kode
    const systemMessage = {
      role: 'system',
      content: `Anda adalah asisten AI. ATURAN WAJIB:
      1. Jika memberikan kode, SELALU bungkus dengan blok markdown tiga backtick (contoh: \`\`\`html ... \`\`\`).
      2. JANGAN memotong kode. Pastikan kode tertutup dengan benar.
      3. Jika memberikan HTML dan CSS, pisahkan menjadi dua blok kode yang berbeda.
      4. Jangan pernah menulis kode di luar blok markdown.`
    };
    
    const messagesWithSystem = [systemMessage, ...messages];

    const endpoint = 'https://api.openai.com/v1/chat/completions';
    
    // Model OpenAI: gpt-4o-mini sangat cepat dan sangat murah
    const modelsToTry = ['gpt-4o-mini', 'gpt-3.5-turbo']; 
    
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
          messages: messagesWithSystem,
          stream: true,
          temperature: 0.3 // Menjaga AI tetap fokus dan tidak berhalusinasi
        }),
      });

      if (response.ok) {
        isSuccess = true;
        break;
      }
    }

    if (!isSuccess) {
      const errorData = await response.json().catch(() => ({}));
      return new Response(JSON.stringify({ 
        error: `⚠️ Gagal memproses (Kode: ${response.status}). Pastikan saldo OpenAI cukup.`,
        details: errorData
      }), { status: response.status });
    }

    // Kembalikan stream ke frontend
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
