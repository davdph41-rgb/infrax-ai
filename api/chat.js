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

    // SYSTEM PROMPT YANG LEBIH KETAT
    const systemMessage = {
      role: 'system',
      content: `Anda adalah asisten pemrograman profesional. 
      ATURAN MUTLAK:
      1. Setiap kali memberikan kode (HTML, CSS, JS, dll), WAJIB dibungkus dengan tiga backtick (contoh: \`\`\`html ... \`\`\`).
      2. JANGAN PERNAH mencampur kode HTML dan CSS di dalam satu blok yang sama. Jika memberikan HTML dan CSS, tutup blok HTML terlebih dahulu, lalu buka blok CSS baru.
      3. JANGAN PERNAH memotong kode di tengah jalan. Pastikan setiap blok kode memiliki pembuka dan penutup yang lengkap.
      4. Jangan menulis kode di luar blok markdown.`
    };
    
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
          messages: messagesWithSystem,
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
