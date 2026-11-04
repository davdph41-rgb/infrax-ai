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
    // UJI COBA: HANYA OPENAI YANG AKTIF
    // ==========================================
    const providers = [
      {
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        apiKey: process.env.OPENAI_API_KEY, // Pastikan ini sudah diset di Vercel
        model: 'gpt-4o-mini',               // Model paling hemat dan cepat
      }
    ];

    for (const provider of providers) {
      if (!provider.apiKey) {
        return new Response(JSON.stringify({ error: 'API Key OpenAI belum diset di Vercel.' }), { status: 500 });
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

        // Penanganan Error Khusus OpenAI
        console.error(`[Gagal] OpenAI merespons dengan kode: ${response.status}`);
        
        if (response.status === 401) {
          return new Response(JSON.stringify({ error: '⚠️ API Key OpenAI tidak valid.' }), { status: 401 });
        } else if (response.status === 429) {
          return new Response(JSON.stringify({ error: '⚠️ Saldo OpenAI habis atau terkena limit (Quota Exceeded). Silakan cek Billing.' }), { status: 429 });
        } else {
          const errData = await response.json().catch(() => ({}));
          return new Response(JSON.stringify({ error: `⚠️ Error OpenAI (Kode: ${response.status}).`, details: errData }), { status: response.status });
        }

      } catch (error) {
        console.error(`[Error Jaringan] Gagal menghubungi OpenAI:`, error.message);
        return new Response(JSON.stringify({ error: '⚠️ Koneksi ke OpenAI terputus.' }), { status: 500 });
      }
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
