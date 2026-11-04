const { neon } = require('@neondatabase/serverless');

exports.handler = async function(event, context) {
  const sql = neon(process.env.DATABASE_URL);
  const method = event.httpMethod;
  const chatId = event.queryStringParameters?.chatId;

  try {
    if (method === 'GET') {
      if (chatId) {
        const messages = await sql`SELECT role, content, sender_name FROM messages WHERE chat_id = ${chatId} ORDER BY created_at ASC`;
        return { statusCode: 200, body: JSON.stringify(messages) };
      } else {
        const chats = await sql`SELECT id, title, updated_at FROM chats ORDER BY updated_at DESC`;
        return { statusCode: 200, body: JSON.stringify(chats) };
      }
    }

    if (method === 'POST') {
      const body = JSON.parse(event.body);
      if (body.action === 'createChat') {
        await sql`INSERT INTO chats (id, title) VALUES (${body.chatId}, ${body.title}) ON CONFLICT (id) DO UPDATE SET title = ${body.title}, updated_at = NOW()`;
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }
      if (body.action === 'addMessage') {
        await sql`INSERT INTO messages (chat_id, role, content, sender_name) VALUES (${body.chatId}, ${body.role}, ${body.content}, ${body.senderName})`;
        await sql`UPDATE chats SET updated_at = NOW() WHERE id = ${body.chatId}`;
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
