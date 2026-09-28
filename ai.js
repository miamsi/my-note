// Vercel serverless function (CommonJS). Env: GROQ_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, optional GROQ_QWEN_MODEL
const FAST = 'openai/gpt-oss-20b';
const DEEP = 'openai/gpt-oss-120b';
const FLEX = process.env.GROQ_QWEN_MODEL || 'qwen/qwen3.8-27b';

const J = (s) => s + ' Reply with ONLY valid JSON, no markdown fences.';
// action: [model, fallback models, system prompt, json?, max output tokens, max input chars]
// Small token caps keep requests under Groq's per-minute token limits.
const A = {
  remember: [FAST, [FLEX], J('Read the note. Return {"summary":"max 25 words","tags":["up to 5 lowercase keywords"]}.'), true, 500, 6000],
  dates: [FAST, [FLEX], J('Extract every date, deadline, time or schedule item. Today is {today}. Return {"items":[{"when":"ISO date/time or original text","what":"short description"}]}.'), true, 900, 12000],
  ask: [DEEP, [FAST, FLEX], J('Answer the question using the user\'s notes (JSON list). Be concise, use Markdown, say so if the notes lack the answer. Return {"answer":"markdown","ids":["ids of notes you used"]}.'), true, 1500, 14000],
  resume: [DEEP, [FAST, FLEX], 'Write a concise summary (resume) of the note in Markdown: a one-line gist, then key points, decisions and open tasks. Keep the note\'s language.', false, 1200, 12000],
  format: [FLEX, [DEEP, FAST], 'Reformat the note as clean Markdown: clear headings, lists, bold key terms, and "- [ ]" checkboxes for tasks. Do not add, remove or change information; keep its language. Return ONLY the note.', false, 3500, 12000],
  merge: [FLEX, [DEEP], 'Merge these notes into one coherent Markdown note. Remove duplication, group related ideas, keep every fact. Return ONLY the merged note.', false, 3500, 14000],
  split: [FLEX, [DEEP, FAST], J('Split the note into separate self-contained notes by topic (2-8). Return {"notes":[{"title":"...","content":"markdown"}]}.'), true, 3500, 12000],
};

async function call(model, messages, json, max) {
  const extras = [{ reasoning_effort: model.startsWith('openai/') ? 'low' : 'none' }, {}];
  for (const ex of extras) {
    let r;
    try {
      r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(9000),
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.GROQ_API_KEY },
        body: JSON.stringify({ model, messages, temperature: 0.3, max_completion_tokens: max, ...(json ? { response_format: { type: 'json_object' } } : {}), ...ex }),
      });
    } catch { return { err: 'timeout' }; }
    if (r.ok) return (await r.json()).choices[0];
    if (r.status !== 400) return { err: r.status, retry: Math.ceil(parseFloat(r.headers.get('retry-after')) || 0) };
    // 400 usually = option this model doesn't accept: retry once without it
  }
  return { err: 400 };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const E = process.env;
  if (!E.GROQ_API_KEY || !E.SUPABASE_URL || !E.SUPABASE_ANON_KEY) return res.status(500).json({ error: 'Server is missing environment variables in Vercel' });
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const u = await fetch(E.SUPABASE_URL + '/auth/v1/user', { headers: { apikey: E.SUPABASE_ANON_KEY, authorization: 'Bearer ' + token } });
    if (!u.ok) return res.status(401).json({ error: 'Please log in again' });

    const { action, note = '', prompt = '', notes } = req.body || {};
    const a = A[action];
    if (!a) return res.status(400).json({ error: 'Unknown action' });
    const [primary, fallbacks, sys0, json, max, limit] = a;
    let user = action === 'ask'
      ? `Question: ${String(prompt).slice(0, 500)}\n\nNotes: ${JSON.stringify(notes || []).slice(0, limit)}`
      : String(note);
    if (user.length > limit) return res.status(413).json({ error: `This note is too long for AI (limit about ${limit} characters). Try a shorter note.` });
    const sys = sys0.replace('{today}', new Date().toISOString().slice(0, 10));
    const msgs = [{ role: 'system', content: sys }, { role: 'user', content: user }];

    let last = {};
    for (const model of [primary, ...fallbacks]) {
      const c = await call(model, msgs, json, max);
      if (c.err) { last = c; if (c.err === 401) break; continue; } // rate limit / outage: try the next model
      if (c.finish_reason === 'length') { last = { err: 'length' }; continue; }
      const text = (c.message.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^```(?:json|markdown)?\s*|\s*```$/g, '').trim();
      if (!text) { last = { err: 'empty' }; continue; }
      return res.status(200).json({ text, model });
    }
    const msg = last.err === 429 ? `AI is busy (Groq rate limit). Try again in ${last.retry || 20}s.`
      : last.err === 401 ? 'Groq API key was rejected. Check GROQ_API_KEY in Vercel.'
      : last.err === 'length' ? 'The AI answer was cut off. Try a shorter note.'
      : last.err === 'timeout' ? 'AI took too long. Try again.'
      : 'AI service error (' + last.err + '). Try again.';
    res.status(last.err === 429 ? 429 : 502).json({ error: msg, retry: last.retry });
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
