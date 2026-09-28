'use client';
import { useEffect, useRef, useState } from 'react';
import { sb } from '../lib/supabase';
import Md from '../components/Md';

const FONTS = { sans: 'system-ui,-apple-system,"Segoe UI",sans-serif', serif: 'Georgia,"Times New Roman",serif', mono: 'ui-monospace,Menlo,Consolas,monospace' };
const COLORS = ['#0f8b8d', '#5b5bd6', '#d6336c', '#e8590c', '#2f9e44', '#7048e8'];
const DEF = { accent: COLORS[0], theme: 'light', font: 'sans', size: 16 };

export default function Page() {
  const [user, setUser] = useState(undefined);
  const [prefs, setPrefs] = useState(DEF);
  useEffect(() => {
    try { setPrefs({ ...DEF, ...JSON.parse(localStorage.getItem('prefs') || '{}') }); } catch {}
    if (!sb) return setUser(null);
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, s) => {
      const u = s?.user ?? null; // keep the same object on token refresh so nothing reloads
      setUser((p) => (p && u && p.id === u.id ? p : u));
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.t = prefs.theme; r.style.setProperty('--ac', prefs.accent);
    r.style.setProperty('--fs', prefs.size + 'px'); r.style.setProperty('--ff', FONTS[prefs.font]);
  }, [prefs]);
  const setPref = (k, v) => setPrefs((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem('prefs', JSON.stringify(n)); } catch {} return n; });

  if (!sb) return <div id="auth"><p>Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables, then redeploy.</p></div>;
  if (user === undefined) return null;
  return user ? <Notes user={user} prefs={prefs} setPref={setPref} /> : <Auth />;
}

function Auth() {
  const [up, setUp] = useState(false), [e, setE] = useState(''), [p, setP] = useState(''), [msg, setMsg] = useState('');
  const go = async () => {
    setMsg('…'); const c = { email: e, password: p };
    const { data, error } = await (up ? sb.auth.signUp(c) : sb.auth.signInWithPassword(c));
    setMsg(error ? error.message : up && !data.session ? 'Check your email to confirm your account.' : '');
  };
  return (
    <div id="auth">
      <h1 style={{ margin: 0 }}>Desknotes</h1>
      <p style={{ margin: 0, color: 'var(--mu)' }}>Your notes, organised by AI.</p>
      <input type="email" placeholder="Email" value={e} onChange={(x) => setE(x.target.value)} autoComplete="email" />
      <input type="password" placeholder="Password (6+ characters)" value={p} onChange={(x) => setP(x.target.value)} onKeyDown={(x) => x.key === 'Enter' && go()} autoComplete={up ? 'new-password' : 'current-password'} />
      <button className="p" onClick={go}>{up ? 'Sign up' : 'Log in'}</button>
      <button onClick={() => setUp(!up)}>{up ? 'I have an account' : 'Create an account instead'}</button>
      <small style={{ color: 'var(--mu)' }}>{msg}</small>
    </div>
  );
}

function Notes({ user, prefs, setPref }) {
  const [notes, setNotes] = useState([]), [id, setId] = useState(null), [sel, setSel] = useState([]), [q, setQ] = useState('');
  const [rd, setRd] = useState(false), [view, setView] = useState('list'), [st, setSt] = useState(''), [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false), [tm, setTm] = useState(''), [gear, setGear] = useState(false), [undo, setUndo] = useState(null), [qa, setQa] = useState('');
  const NR = useRef(notes), T = useRef({}), RM = useRef({}), pause = useRef(0);
  NR.current = notes;
  const cur = notes.find((n) => n.id == id);
  const toast = (m) => { setTm(m); clearTimeout(T.current.t); T.current.t = setTimeout(() => setTm(''), 2800); };
  const upd = (nid, f) => setNotes((ns) => ns.map((n) => (n.id == nid ? { ...n, ...f } : n)));
  useEffect(() => { document.body.dataset.v = view; }, [view]);
  useEffect(() => {
    sb.from('notes').select('*').order('updated_at', { ascending: false }).limit(300).then(({ data, error }) => {
      if (error) toast(error.message); setNotes(data || []); if (data?.length) setId(data[0].id);
    });
  }, [user.id]);

  // ---- saving + AI memory
  const flush = async (nid) => {
    const n = NR.current.find((x) => x.id == nid); if (!n) return;
    const u = new Date().toISOString();
    const { error } = await sb.from('notes').update({ title: n.title || 'Untitled', content: n.content, updated_at: u }).eq('id', nid);
    if (error) toast(error.message); else { setSt('Saved'); upd(nid, { updated_at: u }); }
  };
  const edit = (f, v) => {
    upd(id, { [f]: v }); setSt('Saving…'); const t = T.current, i = id;
    clearTimeout(t['s' + i]); t['s' + i] = setTimeout(() => flush(i), 700);
    clearTimeout(t['r' + i]); t['r' + i] = setTimeout(() => remember(i), 8000);
  };
  const ai = async (action, p) => {
    const { data: { session } } = await sb.auth.getSession(); if (!session) throw Error('Please log in again');
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ action, ...p }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status == 429) pause.current = Date.now() + (j.retry || 20) * 1000; throw Error(j.error || 'AI error ' + r.status); }
    return j.text;
  };
  const aj = async (a, p) => { const t = await ai(a, p), m = t.match(/\{[\s\S]*\}/); try { return JSON.parse(m ? m[0] : t); } catch { throw Error('AI gave an unreadable answer. Try again.'); } };
  const remember = async (nid) => {
    const n = NR.current.find((x) => x.id == nid);
    if (!n || n.content.length < 30 || RM.current[nid] === n.content || Date.now() < pause.current) return;
    RM.current[nid] = n.content;
    try { const r = await aj('remember', { note: n.title + '\n' + n.content }); const f = { summary: String(r.summary || ''), tags: (r.tags || []).slice(0, 5) }; upd(nid, f); await sb.from('notes').update(f).eq('id', nid); } catch {}
  };
  const run = async (msg, fn) => {
    if (busy) return toast('AI is still working…');
    if (Date.now() < pause.current) return toast('AI is cooling down. Try again in ' + Math.ceil((pause.current - Date.now()) / 1000) + 's');
    setBusy(true); setOut({ m: msg });
    try { await fn(); } catch (e) { setOut(null); toast(e.message); } finally { setBusy(false); }
  };

  // ---- note actions
  const open = (nid) => { setId(nid); setRd(false); setUndo(null); setOut(null); setSt(''); setView('edit'); };
  const add = async (o = {}) => {
    const { data, error } = await sb.from('notes').insert({ title: 'Untitled', content: '', ...o }).select().single();
    if (error) return toast(error.message); setNotes((ns) => [data, ...ns]); open(data.id);
  };
  const del = async () => {
    if (!cur || !confirm('Delete "' + cur.title + '"?')) return;
    const { error } = await sb.from('notes').delete().eq('id', cur.id); if (error) return toast(error.message);
    const rest = notes.filter((n) => n.id != cur.id); setNotes(rest); setId(rest[0]?.id ?? null); setView('list');
  };
  const cp = (t) => cur && add({ title: t, content: cur.content, summary: cur.summary, tags: cur.tags });
  const share = async () => {
    const s = cur.share_id ? null : crypto.randomUUID().replaceAll('-', '');
    const { error } = await sb.from('notes').update({ share_id: s }).eq('id', cur.id); if (error) return toast(error.message);
    upd(cur.id, { share_id: s });
    if (s) { try { await navigator.clipboard.writeText(location.origin + '/s/' + s); } catch {} toast('Link copied · anyone with it can read this note'); } else toast('Sharing turned off');
  };
  const text = () => '# ' + cur.title + '\n' + cur.content;
  const fmt = () => run('Formatting…', async () => {
    if (!cur.content.trim()) throw Error('Write something first');
    const t = await ai('format', { note: cur.content }); setUndo(cur.content); edit('content', t); setOut(null); setRd(false);
  });
  const resume = () => run('Writing resume…', async () => { const t = await ai('resume', { note: text() }); setOut({ md: t, ins: t }); });
  const dates = () => run('Finding dates…', async () => { const r = await aj('dates', { note: text() }); setOut({ dates: r.items || [] }); });
  const ask = () => {
    const s = qa.trim(); if (!s) return;
    run('Searching your notes…', async () => {
      const w = s.toLowerCase().split(/\W+/).filter((x) => x.length > 2);
      const top = notes.map((n) => [w.reduce((a, x) => a + ((n.title + ' ' + n.summary + ' ' + n.tags + ' ' + n.content).toLowerCase().includes(x) ? 1 : 0), 0), n])
        .sort((a, b) => b[0] - a[0]).slice(0, 8).map((x) => x[1]).filter((n) => n.id != id)
        .map((n) => ({ id: n.id, title: n.title, summary: n.summary, tags: n.tags, text: n.content.slice(0, 600) }));
      if (cur) top.unshift({ id: cur.id, title: 'CURRENT NOTE: ' + cur.title, text: cur.content.slice(0, 3000) });
      const r = await aj('ask', { prompt: s, notes: top });
      setOut({ md: r.answer, ids: (r.ids || []).filter((i) => notes.some((n) => n.id == i)) });
    });
  };
  const merge = () => {
    const ns = notes.filter((n) => sel.includes(n.id));
    run('Merging…', async () => {
      const j = ns.map((n) => '# ' + n.title + '\n' + n.content).join('\n\n---\n\n'); let t;
      try { t = await ai('merge', { note: j }); } catch { t = j; }
      setSel([]); await add({ title: ns[0].title + ' + ' + (ns.length - 1) + ' more', content: t }); setOut(null);
    });
  };
  const split = () => cur && run('Splitting…', async () => {
    const r = await aj('split', { note: text() });
    const ns = (r.notes || []).filter((n) => n.title && n.content).map((n) => ({ title: String(n.title), content: String(n.content) }));
    if (ns.length < 2) throw Error('Nothing to split');
    const { data, error } = await sb.from('notes').insert(ns).select(); if (error) throw error;
    setNotes((x) => [...data, ...x]); setOut(null); toast('Split into ' + data.length + ' notes (original kept)');
  });
  const pdf = () => { document.title = cur?.title || 'Note'; window.print(); document.title = 'Desknotes'; };

  const list = [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .filter((n) => !q || (n.title + n.content + n.summary + n.tags).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div id="app">
        <aside id="side">
          <header>
            <button className="p" onClick={() => add()}>+ New note</button>
            {sel.length > 1 && <button onClick={merge}>Merge ({sel.length})</button>}
            <button style={{ marginLeft: 'auto' }} onClick={() => setGear(!gear)}>Style</button>
          </header>
          <div style={{ padding: '0 12px 8px' }}><input placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div id="list">
            {list.map((n) => (
              <div key={n.id} className={'it' + (n.id == id ? ' on' : '')} onClick={() => open(n.id)}>
                <input type="checkbox" aria-label="Select" checked={sel.includes(n.id)} onClick={(e) => e.stopPropagation()} onChange={() => setSel((s) => (s.includes(n.id) ? s.filter((x) => x != n.id) : [...s, n.id]))} />
                <div style={{ minWidth: 0 }}>
                  <b>{n.title}{n.share_id ? ' 🔗' : ''}</b><small>{n.summary || n.content.slice(0, 90)}</small>
                  {(n.tags || []).map((t) => <span key={t} className="chip" style={{ background: 'var(--bg)' }}>{t}</span>)}
                </div>
              </div>
            ))}
            {!list.length && <p style={{ padding: 16, color: 'var(--mu)' }}>No notes yet. Create one and start writing.</p>}
          </div>
          <header><small style={{ color: 'var(--mu)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</small><button style={{ marginLeft: 'auto' }} onClick={() => sb.auth.signOut()}>Log out</button></header>
        </aside>
        <main id="main">
          {cur ? (
            <>
              <div id="bar">
                <button id="back" onClick={() => setView('list')}>‹ Notes</button>
                <button onClick={() => setRd(!rd)}>{rd ? 'Edit' : 'Read'}</button>
                <button onClick={() => flush(cur.id)}>Save</button>
                <button onClick={share}>{cur.share_id ? 'Unshare' : 'Share'}</button>
                <button onClick={pdf}>PDF</button>
                <button onClick={() => cp(cur.title + ' (copy)')}>Duplicate</button>
                <button onClick={() => { const t = prompt('Save as…', cur.title + ' (copy)'); if (t) cp(t); }}>Save as</button>
                <button onClick={split}>Split</button>
                <button className="d" onClick={del}>Delete</button>
                <span id="st">{st}</span>
              </div>
              <div id="doc">
                <input id="title" placeholder="Title" value={cur.title} onChange={(e) => edit('title', e.target.value)} />
                {rd ? <div id="view"><Md text={cur.content} /></div>
                  : <textarea id="body" placeholder="Start writing… AI will understand and remember it." value={cur.content} onChange={(e) => edit('content', e.target.value)} />}
              </div>
            </>
          ) : <div id="doc"><p style={{ color: 'var(--mu)' }}>Create or pick a note to start.</p></div>}
          <div id="ai">
            <div className="r">
              <input placeholder="Ask your notes: “what did we decide about the launch?”" style={{ flex: 1, minWidth: 200 }} value={qa} onChange={(e) => setQa(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} />
              <button className="p" onClick={ask}>Ask</button>
            </div>
            {cur && <div className="r"><button onClick={fmt}>✨ Format</button><button onClick={resume}>Resume</button><button onClick={dates}>Dates</button>
              {undo != null && <button onClick={() => { edit('content', undo); setUndo(null); }}>Undo AI</button>}</div>}
            {out && <div id="out">
              {out.m ? <i style={{ color: 'var(--mu)' }}>{out.m}</i>
                : out.dates ? (out.dates.length ? out.dates.map((d, i) => <p key={i}><mark>{d.when}</mark> {d.what}</p>) : 'No dates found.')
                : <>
                  <Md text={out.md} />
                  {out.ins && <button onClick={() => { edit('content', cur.content + '\n\n## Summary\n' + out.ins); setOut(null); }}>Add to note</button>}
                  {(out.ids || []).map((i) => <button key={i} className="chip" onClick={() => open(i)}>{notes.find((n) => n.id == i).title}</button>)}
                </>}
            </div>}
          </div>
        </main>
      </div>
      {gear && <div id="set">
        <div>{COLORS.map((c) => <button key={c} className="sw" style={{ background: c }} aria-label={'Accent ' + c} onClick={() => setPref('accent', c)} />)}</div>
        <div><button onClick={() => setPref('theme', prefs.theme == 'dark' ? 'light' : 'dark')}>Light / Dark</button> <button onClick={() => setPref('font', { sans: 'serif', serif: 'mono', mono: 'sans' }[prefs.font])}>Font</button></div>
        <div><button onClick={() => setPref('size', Math.max(13, prefs.size - 1))}>A−</button> <button onClick={() => setPref('size', Math.min(24, prefs.size + 1))}>A+</button></div>
      </div>}
      <div id="pa" className="pa"><h1>{cur?.title}</h1><Md text={cur?.content} /></div>
      {tm && <div id="toast">{tm}</div>}
    </>
  );
}
