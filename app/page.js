'use client';
import { useEffect, useRef, useState } from 'react';
import { sb } from '../lib/supabase';
import Md from '../components/Md';
import Editor from '../components/Editor';

const FONTS = { sans: '"Segoe UI Variable Text",system-ui,-apple-system,sans-serif', serif: 'Georgia,"Times New Roman",serif', mono: 'ui-monospace,Menlo,Consolas,monospace' };
const COLORS = ['#0f6cbd', '#0e8a7d', '#7160e8', '#d13c8b', '#e26b0a', '#2d9d4f'];
const DEF = { accent: COLORS[0], theme: 'light', font: 'sans', size: 16 };

const P = { plus: 'M12 5v14M5 12h14', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3', share: 'M4 12v7h16v-7M12 3v13M8 7l4-4 4 4', pdf: 'M12 3v12M7 11l5 5 5-5M5 21h14', copy: 'M9 9h11v11H9zM5 15V5h10', trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', split: 'M12 3v6M12 9l-6 6v6M12 9l6 6v6', spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z', back: 'M15 5l-7 7 7 7', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6', gear: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4', layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5', cal: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4', doc: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6', send: 'M12 19V5M6 11l6-6 6 6', undo: 'M9 14l-5-5 5-5M4 9h10a6 6 0 0 1 0 12h-3', out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10', panel: 'M4 5h16v14H4zM9 5v14', pin: 'M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z', home: 'M4 11l8-7 8 7M6 10v10h12V10' };
const I = ({ n }) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>;
const B = ({ n, t, f, c = '' }) => <button className={'cb ' + c} onClick={f} title={t} aria-label={t}><I n={n} /><span className="lb">{t}</span></button>;
const MO = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
// finds a date in a line of text: 2026-10-05 or "Oct 5"
const pd = (l) => { let m = l.match(/\b\d{4}-\d{2}-\d{2}\b/); if (m) return m[0];
  m = l.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? (\d{1,2})\b(?:,? (\d{4}))?/i); if (!m) return null;
  return (m[3] || new Date().getFullYear()) + '-' + String(MO.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0') + '-' + m[2].padStart(2, '0'); };
const ago = (d) => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };


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
  const [screen, setScreen] = useState('home'), [nav, setNav] = useState(true), [sort, setSort] = useState('recent'), [tag, setTag] = useState(null), [pins, setPins] = useState([]), [st, setSt] = useState(''), [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false), [tm, setTm] = useState(''), [gear, setGear] = useState(false), [undo, setUndo] = useState(null), [qa, setQa] = useState(''), [pal, setPal] = useState(false), [pq, setPq] = useState(''), [pi, setPi] = useState(0);
  const NR = useRef(notes), T = useRef({}), RM = useRef({}), pause = useRef(0);
  NR.current = notes;
  const cur = notes.find((n) => n.id == id);
  const home = screen == 'home' || !cur;
  const toast = (m) => { setTm(m); clearTimeout(T.current.t); T.current.t = setTimeout(() => setTm(''), 2800); };
  const upd = (nid, f) => setNotes((ns) => ns.map((n) => (n.id == nid ? { ...n, ...f } : n)));
  useEffect(() => { if (innerWidth < 860) setNav(false); try { setPins(JSON.parse(localStorage.getItem('pins') || '[]')); } catch {} }, []);
  useEffect(() => {
    sb.from('notes').select('*').order('updated_at', { ascending: false }).limit(300).then(({ data, error }) => {
      if (error) toast(error.message); setNotes(data || []);
    });
  }, [user.id]);

  useEffect(() => { // Ctrl/Cmd+K opens the command palette
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() == 'k') { e.preventDefault(); setPal((p) => !p); setPq(''); setPi(0); } };
    addEventListener('keydown', h); return () => removeEventListener('keydown', h);
  }, []);
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
  const open = (nid) => { setId(nid); setUndo(null); setOut(null); setSt(''); setScreen('note'); if (innerWidth < 860) setNav(false); };
  const add = async (o = {}) => {
    const { data, error } = await sb.from('notes').insert({ title: 'Untitled', content: '', ...o }).select().single();
    if (error) return toast(error.message); setNotes((ns) => [data, ...ns]); open(data.id);
  };
  const del = async () => {
    if (!cur || !confirm('Delete "' + cur.title + '"?')) return;
    const { error } = await sb.from('notes').delete().eq('id', cur.id); if (error) return toast(error.message);
    const rest = notes.filter((n) => n.id != cur.id); setNotes(rest); setId(null); setScreen('home');
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
    const t = await ai('format', { note: cur.content }); setUndo(cur.content); edit('content', t); setOut(null);
  });
  const resume = () => run('Writing resume…', async () => { const t = await ai('resume', { note: text() }); setOut({ md: t, ins: t }); });
  const dates = () => run('Finding dates…', async () => { const r = await aj('dates', { note: text() }); setOut({ dates: r.items || [] }); });
  const ask = (t) => {
    const s = (typeof t == 'string' ? t : qa).trim(); if (!s) return; setQa(s);
    run('Searching your notes…', async () => {
      const w = s.toLowerCase().split(/\W+/).filter((x) => x.length > 2);
      const top = notes.map((n) => [w.reduce((a, x) => a + ((n.title + ' ' + n.summary + ' ' + n.tags + ' ' + n.content).toLowerCase().includes(x) ? 1 : 0), 0), n])
        .sort((a, b) => b[0] - a[0]).slice(0, 8).map((x) => x[1]).filter((n) => home || n.id != id)
        .map((n) => ({ id: n.id, title: n.title, summary: n.summary, tags: n.tags, text: n.content.slice(0, 600) }));
      if (cur && !home) top.unshift({ id: cur.id, title: 'CURRENT NOTE: ' + cur.title, text: cur.content.slice(0, 3000) });
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

  const togglePin = (x) => setPins((p) => { const n = p.includes(x) ? p.filter((y) => y != x) : [...p, x]; try { localStorage.setItem('pins', JSON.stringify(n)); } catch {} return n; });
  const delSel = async () => {
    if (!confirm('Delete ' + sel.length + ' notes?')) return;
    const { error } = await sb.from('notes').delete().in('id', sel); if (error) return toast(error.message);
    setNotes((ns) => ns.filter((n) => !sel.includes(n.id))); if (sel.includes(id)) { setId(null); setScreen('home'); } setSel([]);
  };
  const tags = [...new Set(notes.flatMap((n) => n.tags || []))].slice(0, 12);
  const cards = list.filter((n) => !tag || (n.tags || []).includes(tag))
    .sort((a, b) => (pins.includes(b.id) - pins.includes(a.id)) || (sort == 'title' ? a.title.localeCompare(b.title) : 0));
  // ---- Today: tasks and dates found in every note (no AI needed, so it is instant)
  const todayIso = iso(new Date()), in7 = iso(new Date(Date.now() + 7 * 864e5));
  const ag = [];
  notes.forEach((n) => n.content.split('\n').forEach((l, i) => {
    const t = l.match(/^\s*[-*]\s\[( |x|X)\]\s+(.*)/); if (t && t[1] != ' ') return;
    const d = pd(l); if (!t && !d) return;
    ag.push({ n, i, task: !!t, d, text: (t ? t[2] : l.replace(/^[#>\s*-]+/, '')).trim() });
  }));
  const bucket = [['Overdue', ag.filter((x) => x.task && x.d && x.d < todayIso)], ['Today', ag.filter((x) => x.d == todayIso)], ['This week', ag.filter((x) => x.d > todayIso && x.d <= in7)], ['Open tasks', ag.filter((x) => x.task && !x.d)]]
    .map(([k, v]) => [k, v.sort((a, b) => (a.d || '').localeCompare(b.d || '')).slice(0, k == 'Open tasks' ? 6 : 8)]).filter(([, v]) => v.length);
  const tickTask = (x) => {
    const c = x.n.content.split('\n'); c[x.i] = c[x.i].replace('[ ]', '[x]'); upd(x.n.id, { content: c.join('\n') });
    clearTimeout(T.current['s' + x.n.id]); T.current['s' + x.n.id] = setTimeout(() => flush(x.n.id), 400);
  };
  const brief = () => run('Preparing your brief…', async () => {
    if (!ag.length) throw Error('No tasks or dates in your notes yet');
    const agText = ag.slice(0, 60).map((x) => (x.d || 'no date') + ' | ' + (x.task ? 'TASK' : 'EVENT') + ' | ' + x.text + ' (' + x.n.title + ')').join('\n').slice(0, 6000);
    const r = await aj('ask', { prompt: 'Today is ' + todayIso + '. Write my brief for today: what is overdue, what is due today, what is coming this week, and what to focus on first. Short and friendly.', notes: [{ id: 'agenda', title: 'Agenda extracted from my notes', text: agText }] });
    setOut({ md: r.answer, ids: [] });
  });
  const days = new Set(notes.flatMap((n) => [n.created_at, n.updated_at].filter(Boolean).map((d) => iso(new Date(d)))));
  const week = <div className="week" title="Days you wrote or edited notes">{Array.from({ length: 7 }, (_, k) => { const d = new Date(Date.now() - (6 - k) * 864e5); return <span key={k} className={days.has(iso(d)) ? 'on' : ''}>{'SMTWTFS'[d.getDay()]}</span>; })}</div>;
  const today = (
    <section className="today">
      <div className="th"><h2>Today</h2><span>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span><button className="pill" onClick={brief}><I n="spark" />Brief me</button></div>
      {bucket.length ? bucket.map(([k, v]) => <div key={k} className="tg"><h4 className={k == 'Overdue' ? 'od' : ''}>{k}</h4>
        {v.map((x, j) => <div key={j} className="tr" onClick={() => open(x.n.id)}>
          {x.task ? <input type="checkbox" aria-label="Mark done" onClick={(e) => e.stopPropagation()} onChange={() => tickTask(x)} /> : <I n="cal" />}
          <span className="tt">{x.text}</span>{x.d && x.d != todayIso && <time>{x.d.slice(5)}</time>}<em>{x.n.title || 'Untitled'}</em></div>)}</div>)
        : <p className="none">Nothing scheduled. Write a task like “- [ ] Call Sam 2026-10-02” in any note and it appears here.</p>}
    </section>
  );
  // ---- Command palette
  const acts = [['plus', 'New note', () => add()], ['home', 'Go to Home', () => setScreen('home')], ['panel', 'Toggle sidebar', () => setNav((v) => !v)],
    ['gear', 'Toggle dark mode', () => setPref('theme', prefs.theme == 'dark' ? 'light' : 'dark')], ['cal', 'Brief me on today', brief],
    ...(cur && !home ? [['spark', 'Format this note', fmt], ['doc', 'Resume this note', resume], ['cal', 'Find dates in this note', dates], ['pdf', 'Export PDF', pdf], ['share', 'Share or unshare', share]] : [])];
  const pl = pq.toLowerCase();
  const pitems = [...(pq ? [['send', 'Ask AI: “' + pq + '”', () => ask(pq)]] : []), ...acts.filter((a) => a[1].toLowerCase().includes(pl)),
    ...(pq ? notes.filter((n) => (n.title + n.summary + n.content).toLowerCase().includes(pl)).slice(0, 6).map((n) => ['doc', n.title || 'Untitled', () => open(n.id)]) : [])];
  const runItem = (x) => { setPal(false); setPq(''); x && x[2](); };
  const pkey = (e) => { if (e.key == 'Escape') setPal(false); else if (e.key == 'ArrowDown') { e.preventDefault(); setPi((i) => Math.min(i + 1, pitems.length - 1)); } else if (e.key == 'ArrowUp') { e.preventDefault(); setPi((i) => Math.max(i - 1, 0)); } else if (e.key == 'Enter') runItem(pitems[pi]); };
  const wc = cur ? cur.content.trim().split(/\s+/).filter(Boolean).length : 0;
  const hr = new Date().getHours(), hi = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const aiUI = (
    <div id="ai" className={home ? 'home' : ''}>
      {out && <div id="out">
        {out.m ? <i style={{ color: 'var(--mu)' }}>{out.m}</i>
          : out.dates ? (out.dates.length ? out.dates.map((d, i) => <p key={i}><mark>{d.when}</mark> {d.what}</p>) : 'No dates found.')
          : <>
            <Md text={out.md} />
            {out.ins && <button className="pill" onClick={() => { edit('content', cur.content + '\n\n## Summary\n' + out.ins); setOut(null); }}><I n="plus" />Add to note</button>}
            {(out.ids || []).map((i) => <button key={i} className="pill" onClick={() => open(i)}><I n="doc" />{notes.find((n) => n.id == i).title}</button>)}
          </>}
      </div>}
      <div className="cap">
        <I n="spark" />
        <input placeholder="Ask your notes anything…" value={qa} onChange={(e) => setQa(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} />
        <button className="p" onClick={ask} aria-label="Ask"><I n="send" /></button>
      </div>
      <div className="chips">
        {home ? ['What deadlines are coming up?', 'Summarize my recent notes', 'List all my open tasks'].map((t) => <button key={t} className="pill" onClick={() => ask(t)}>{t}</button>)
          : <>
            <button className="pill" onClick={fmt}><I n="spark" />Format</button>
            <button className="pill" onClick={resume}><I n="doc" />Resume</button>
            <button className="pill" onClick={dates}><I n="cal" />Dates</button>
            {undo != null && <button className="pill" onClick={() => { edit('content', undo); setUndo(null); }}><I n="undo" />Undo AI</button>}
          </>}
      </div>
    </div>
  );
  return (
    <>
      <div id="app" className={nav ? '' : 'nonav'}>
        {nav && <div className="scrim navs" onClick={() => setNav(false)} />}
        <aside id="side">
          <header>
            <h2 className="brand" style={{ cursor: 'pointer' }} onClick={() => { setScreen('home'); if (innerWidth < 860) setNav(false); }}><span className="logo"><I n="doc" /></span>Desknotes</h2>
            <button className="ib" title="Style" aria-label="Style" onClick={() => setGear(!gear)}><I n="gear" /></button>
            <button className="ib" title="Commands (Ctrl K)" aria-label="Commands" onClick={() => setPal(true)}><I n="spark" /></button>
            <button className="ib" title="Hide sidebar" aria-label="Hide sidebar" onClick={() => setNav(false)}><I n="panel" /></button>
          </header>
          <div className="srch"><I n="search" /><input placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="act">
            <button className="p" onClick={() => add()}><I n="plus" />New note</button>
            {sel.length > 1 && <button className="pill" onClick={merge}><I n="layers" />Merge {sel.length}</button>}
          </div>
          <div id="list">
            {list.map((n) => (
              <div key={n.id} className={'it' + (n.id == id && !home ? ' on' : '')} onClick={() => open(n.id)}>
                <input type="checkbox" aria-label="Select" checked={sel.includes(n.id)} onClick={(e) => e.stopPropagation()} onChange={() => setSel((s) => (s.includes(n.id) ? s.filter((x) => x != n.id) : [...s, n.id]))} />
                <div className="tx">
                  <div className="r1"><b>{n.title || 'Untitled'}</b><time>{ago(n.updated_at)}</time></div>
                  <small>{n.summary || n.content.slice(0, 100) || 'No content yet'}</small>
                </div>
              </div>
            ))}
            {!list.length && <p style={{ padding: 16, color: 'var(--mu)' }}>{q ? 'No notes match your search.' : 'No notes yet.'}</p>}
          </div>
          <footer><span className="me">{(user.email || '?')[0].toUpperCase()}</span><small>{user.email}</small>
            <button className="ib" title="Log out" aria-label="Log out" onClick={() => sb.auth.signOut()}><I n="out" /></button></footer>
        </aside>
        <main id="main">
          {home ? (
            <div id="doc" className="homepage">
              <div className="hh">
                {!nav && <button className="ib" title="Show sidebar" aria-label="Show sidebar" onClick={() => setNav(true)}><I n="panel" /></button>}
                <div className="srch top"><I n="search" /><input placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                <button className="p" onClick={() => add()}><I n="plus" />New note</button>
              </div>
              <h1 className="hi">{hi}</h1>
              <p className="sub">{notes.length} {notes.length == 1 ? 'note' : 'notes'}. Ask anything, or pick up where you left off.</p>
              {week}
              {aiUI}
              {today}
              <div className="lh">
                <h2>Your notes</h2>
                {sel.length > 0 ? <div className="selbar"><span>{sel.length} selected</span>{sel.length > 1 && <button className="p" onClick={merge}><I n="layers" />Merge</button>}<button className="cb d" onClick={delSel}><I n="trash" />Delete</button><button onClick={() => setSel([])}>Clear</button></div>
                  : <div className="seg sm">{[['recent', 'Recent'], ['title', 'A–Z']].map(([k, l]) => <button key={k} className={sort == k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}</div>}
              </div>
              {tags.length > 0 && <div className="chips left">{tags.map((t) => <button key={t} className={'pill' + (tag == t ? ' on' : '')} onClick={() => setTag(tag == t ? null : t)}>{t}</button>)}</div>}
              <div className="grid">
                {cards.map((n) => (
                  <div key={n.id} className={'card' + (sel.includes(n.id) ? ' sel' : '')} onClick={() => open(n.id)}>
                    <div className="ch"><b>{n.title || 'Untitled'}</b>
                      <button className={'ib pin' + (pins.includes(n.id) ? ' on' : '')} title="Pin" aria-label="Pin" onClick={(e) => { e.stopPropagation(); togglePin(n.id); }}><I n="pin" /></button></div>
                    <p>{n.summary || n.content.replace(/[#*>`\[\]-]/g, '').slice(0, 140) || 'No content yet'}</p>
                    <div className="cf">
                      <input type="checkbox" aria-label="Select" checked={sel.includes(n.id)} onClick={(e) => e.stopPropagation()} onChange={() => setSel((x) => (x.includes(n.id) ? x.filter((y) => y != n.id) : [...x, n.id]))} />
                      <span>{ago(n.updated_at)}</span>{n.share_id && <span className="shr">Shared</span>}
                      {(n.tags || []).slice(0, 2).map((t) => <span key={t} className="chip">{t}</span>)}
                    </div>
                  </div>
                ))}
              </div>
              {!cards.length && <div className="empty"><I n="doc" /><h3>{notes.length ? 'Nothing matches' : 'Your desk is clear'}</h3><p>{notes.length ? 'Try a different search or tag.' : 'Write a note and AI will organise and remember it.'}</p></div>}
            </div>
          ) : (
            <>
              <div id="bar">
                <button className="ib" title="Toggle sidebar" aria-label="Toggle sidebar" onClick={() => setNav(!nav)}><I n="panel" /></button>
                <B n="home" t="Home" f={() => setScreen('home')} />
                <B n="spark" t="Commands" f={() => setPal(true)} />
                <i className="sep" />
                <B n="save" t="Save" f={() => flush(cur.id)} />
                <B n="share" t={cur.share_id ? 'Unshare' : 'Share'} f={share} />
                <B n="pdf" t="Export PDF" f={pdf} />
                <i className="sep" />
                <B n="copy" t="Duplicate" f={() => cp(cur.title + ' (copy)')} />
                <B n="doc" t="Save as" f={() => { const t = prompt('Save as…', cur.title + ' (copy)'); if (t) cp(t); }} />
                <B n="split" t="Split" f={split} />
                <B n="trash" t="Delete" f={del} c="d" />
                <span id="st">{st || wc + ' words'}</span>
              </div>
              <div id="doc">
                <input id="title" placeholder="Title" value={cur.title} onChange={(e) => edit('title', e.target.value)} />
                <div className="meta"><span>Edited {ago(cur.updated_at)}</span>{cur.share_id && <span className="shr">· Shared</span>}{(cur.tags || []).map((t) => <span key={t} className="chip">{t}</span>)}</div>
                <Editor key={cur.id} value={cur.content} onChange={(v) => edit('content', v)} />
              </div>
              {aiUI}
            </>
          )}
        </main>
      </div>
      {pal && <><div className="scrim dim" onClick={() => setPal(false)} /><div id="pal">
        <div className="pi"><I n="search" /><input autoFocus placeholder="Search notes, run a command, or ask AI…" value={pq} onChange={(e) => { setPq(e.target.value); setPi(0); }} onKeyDown={pkey} /></div>
        <div className="pl">{pitems.map((x, i) => <button key={i} className={i == pi ? 'on' : ''} onMouseEnter={() => setPi(i)} onClick={() => runItem(x)}><I n={x[0]} />{x[1]}</button>)}</div>
      </div></>}
      {gear && <><div className="scrim" onClick={() => setGear(false)} /><div id="set">
        <div className="seg">{['light', 'dark'].map((t) => <button key={t} className={prefs.theme == t ? 'on' : ''} onClick={() => setPref('theme', t)}>{t == 'light' ? 'Light' : 'Dark'}</button>)}</div>
        <div className="seg">{['sans', 'serif', 'mono'].map((f) => <button key={f} className={prefs.font == f ? 'on' : ''} onClick={() => setPref('font', f)}>{f == 'sans' ? 'Sans' : f == 'serif' ? 'Serif' : 'Mono'}</button>)}</div>
        <div className="sws">{COLORS.map((c) => <button key={c} className={'sw' + (prefs.accent == c ? ' on' : '')} style={{ background: c }} aria-label={'Accent ' + c} onClick={() => setPref('accent', c)} />)}</div>
        <div className="seg"><button onClick={() => setPref('size', Math.max(13, prefs.size - 1))}>A−</button><button disabled>{prefs.size}px</button><button onClick={() => setPref('size', Math.min(24, prefs.size + 1))}>A+</button></div>
      </div></>}
      <div id="pa" className="pa"><h1>{cur?.title}</h1><Md text={cur?.content} /></div>
      {tm && <div id="toast">{tm}</div>}
    </>
  );
}
