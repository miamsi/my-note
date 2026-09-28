import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import Md from '../../../components/Md';
export const dynamic = 'force-dynamic'; // so "Unshare" takes effect immediately

const get = cache(async (id) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const { data } = await createClient(url, key).rpc('get_shared_note', { sid: id });
  return data?.[0] || null;
});
export async function generateMetadata({ params }) {
  const n = await get((await params).id);
  return { title: n ? n.title : 'Desknotes' };
}
export default async function Shared({ params }) {
  const n = await get((await params).id);
  return (
    <div id="shared" style={{ display: 'block' }}>
      {n ? (
        <article>
          <h1>{n.title}</h1><Md text={n.content} />
          <p style={{ color: 'var(--mu)' }}><small>Shared with Desknotes</small></p>
        </article>
      ) : <p style={{ padding: 24 }}>This link is no longer shared.</p>}
    </div>
  );
}
