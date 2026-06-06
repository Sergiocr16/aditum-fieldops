/* © 2026 Aditum — Aditum FieldOps — Sanitized Markdown renderer
   Supports standard Markdown + a safe custom video block:  @[video](URL) */
import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

// Allow <video>/<source> and a few safe attributes; block scripts and event handlers.
const PURIFY_CONFIG: any = {
  ADD_TAGS: ['video', 'source'],
  ADD_ATTR: ['controls', 'src', 'type', 'target', 'rel', 'poster', 'preload'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

function preprocess(md: string): string {
  // @[video](url) -> safe HTML5 video player
  return md.replace(/@\[video\]\(([^)\s]+)\)/g, (_m, url) => {
    const safe = String(url).replace(/"/g, '');
    return `<video controls preload="metadata" src="${safe}" style="width:100%;border-radius:12px;background:#000"></video>`;
  });
}

export default function Markdown({ source }: { source: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(preprocess(source || ''), { async: false }) as string;
    return DOMPurify.sanitize(raw, PURIFY_CONFIG);
  }, [source]);
  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
