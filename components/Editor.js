'use client';
import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';

// Live-formatting editor: type "# ", "- ", "[ ] ", **bold** and it formats instantly. Notes stay stored as Markdown.
export default function Editor({ value, onChange }) {
  const cb = useRef(onChange); cb.current = onChange;
  const ed = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), Markdown.configure({ html: false, transformPastedText: true }),
      Placeholder.configure({ placeholder: 'Start writing. Try # for a heading, - for a list, [ ] for a task.' })],
    content: value,
    onUpdate: ({ editor }) => cb.current(editor.storage.markdown.getMarkdown()),
  });
  useEffect(() => { // AI Format / Undo change the text from outside
    if (ed && ed.storage.markdown.getMarkdown() !== value) ed.commands.setContent(value, false);
  }, [value, ed]);
  if (!ed) return null;
  const T = ({ l, a, f, t }) => <button className={'tb' + (a ? ' on' : '')} title={t} aria-label={t} onMouseDown={(e) => e.preventDefault()} onClick={f}>{l}</button>;
  const c = () => ed.chain().focus();
  return (
    <>
      <div className="fbar">
        <T l={<b>B</b>} t="Bold" a={ed.isActive('bold')} f={() => c().toggleBold().run()} />
        <T l={<i>I</i>} t="Italic" a={ed.isActive('italic')} f={() => c().toggleItalic().run()} />
        <T l="H1" t="Heading 1" a={ed.isActive('heading', { level: 1 })} f={() => c().toggleHeading({ level: 1 }).run()} />
        <T l="H2" t="Heading 2" a={ed.isActive('heading', { level: 2 })} f={() => c().toggleHeading({ level: 2 }).run()} />
        <T l="•" t="Bullet list" a={ed.isActive('bulletList')} f={() => c().toggleBulletList().run()} />
        <T l="☑" t="Checklist" a={ed.isActive('taskList')} f={() => c().toggleTaskList().run()} />
        <T l="❝" t="Quote" a={ed.isActive('blockquote')} f={() => c().toggleBlockquote().run()} />
      </div>
      <EditorContent editor={ed} />
    </>
  );
}
