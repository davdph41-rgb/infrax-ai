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
    // UJI COBA: HANYA GEMINI YANG AKTIF
    // ==========================================
    const providers = [
      {
        name: 'Gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        apiKey: process.env.GEMINI_API_KEY,
        model: 'gemini-3.5-flash-lite', // Model Gemini terbaru
      }
    ];

    for (const provider of providers) {
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

        // Jika error, tampilkan kode errornya di console Vercel
        console.error(`[Gagal] ${provider.name} merespons dengan kode: ${response.status}`);
        
        // Jika error 503 (Server Sibuk)
        if (response.status === 503) {
           return new Response(JSON.stringify({ error: '⚠️ Server Gemini sedang kelebihan beban. Coba lagi nanti.' }), { status: 503 });
        }
        
        // Jika error 429 (Limit) atau 401 (Key salah)
        return new Response(JSON.stringify({ error: `⚠️ Gagal terhubung ke Gemini (Kode: ${response.status}). Periksa API Key.` }), { status: response.status });

      } catch (error) {
        console.error(`[Error Jaringan] Gagal menghubungi ${provider.name}:`, error.message);
        return new Response(JSON.stringify({ error: '⚠️ Koneksi ke Gemini terputus.' }), { status: 500 });
      }
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
