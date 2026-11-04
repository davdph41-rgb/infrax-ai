// api/chat.js
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    let messages = body?.messages;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Format messages salah' }), { status: 400 });
    }
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key belum diset' }), { status: 500 });
    }

    // SISIPKAN SYSTEM PROMPT AGAR AI PATUH PADA FORMAT
    const systemMessage = {
      role: 'system',
      content: 'Anda adalah asisten AI yang cerdas. Setiap kali Anda memberikan kode program (HTML, CSS, JS, Python, dll), Anda WAJIB membungkusnya dengan blok markdown (tiga backtick) beserta nama bahasanya. Contoh: ```css .kelas { color: red; } ```. Jangan pernah mencampur kode ke dalam teks paragraf biasa.'
    };
    
    // Gabungkan system prompt dengan riwayat chat
    const messagesWithSystem = [systemMessage, ...messages];

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    const modelsToTry = ['gemini-3.5-flash', 'gemini-3.5-flash-lite'];
    
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
          messages: messagesWithSystem, // Gunakan pesan yang sudah ditambah system prompt
          stream: true,
        }),
      });

      if (response.ok) {
        isSuccess = true;
        break;
      }
    }

    if (!isSuccess) {
      return new Response(JSON.stringify({ error: '⚠️ Server AI sedang sibuk. Silakan coba lagi.' }), { status: response.status });
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
