// NIROB'S AI — নিজস্ব সার্ভার, যেটা ফ্রি Google Gemini Interactions API কল করে (স্ট্রিমিং সহ)
// চালানোর আগে: npm install, তারপর .env ফাইলে নিজের ফ্রি Gemini API key বসান
// key নিন এখান থেকে (কার্ড লাগে না): https://aistudio.google.com/apikey

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.8-flash';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/chat', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'সার্ভারে GEMINI_API_KEY সেট করা নেই।' });
  }
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages প্রয়োজন।' });
  }

  // পুরো কথোপকথনকে একটা টেক্সটে সাজানো হচ্ছে, যাতে কনটেক্সট বজায় থাকে
  const input = messages
    .map(m => (m.role === 'assistant' ? 'Assistant: ' : 'User: ') + m.content)
    .join('\n\n');

  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY
      },
      body: JSON.stringify({ model: MODEL, input, stream: true })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return res.status(response.status).json({ error: 'AI থেকে উত্তর আনতে সমস্যা হয়েছে।' });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const decoder = new TextDecoder();
    const stepTypes = {};
    let buffer = '';

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        try {
          const ev = JSON.parse(json);
          if (ev.event_type === 'step.start' && ev.step) {
            stepTypes[ev.index] = ev.step.type;
          }
          if (
            ev.event_type === 'step.delta' &&
            stepTypes[ev.index] === 'model_output' &&
            ev.delta?.type === 'text' &&
            ev.delta.text
          ) {
            res.write(ev.delta.text);
          }
        } catch (e) {
          // অসম্পূর্ণ JSON উপেক্ষা করা হচ্ছে
        }
      }
    }
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'সার্ভার এরর।' });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`NIROB'S AI চলছে: http://localhost:${PORT}`);
});
