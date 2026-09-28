import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Children, createElement } from 'react';
// Highlights dates and times inside rendered notes. react-markdown never renders raw HTML, so it is XSS-safe.
const RE = /(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:, \d{4})?|\b\d{1,2}:\d{2}(?:\s?[AP]M)?)/gi;
const mark = (s) => s.split(RE).map((x, i) => (i % 2 ? <mark key={i}>{x}</mark> : x));
const H = (t) => ({ children }) => createElement(t, null, Children.map(children, (c) => (typeof c === 'string' ? mark(c) : c)));
const C = { p: H('p'), li: H('li'), td: H('td'), h1: H('h1'), h2: H('h2'), h3: H('h3') };
export default function Md({ text }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={C}>{text || ''}</ReactMarkdown>;
}
