// api/chat.js
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const messages = body?.messages;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Format messages salah' }), { status: 400 });
    }
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key belum diset' }), { status: 500 });
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    const modelsToTry = ['gemini-3.5-flash', 'gemini-3.5-flash-lite'];
    
    let response;
    let isSuccess = false;

    // Fallback Model
    for (const model of modelsToTry) {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: true, // <-- Mengaktifkan fitur Streaming
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

    // Teruskan stream langsung ke frontend
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
