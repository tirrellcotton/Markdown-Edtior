import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import powershell from 'highlight.js/lib/languages/powershell';
import dart from 'highlight.js/lib/languages/dart';
import dockerfile from 'highlight.js/lib/languages/dockerfile';

hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('dart', dart);
hljs.registerLanguage('dockerfile', dockerfile);

/** Highlights sanitized code as text, preserving unknown languages and explicit plain-text blocks. */
function highlightBlock(block: HTMLElement): void {
  const languageClass = [...block.classList].find(/** Finds the language declared by a Markdown fence. */ (name) => name.startsWith('language-'));
  const language = languageClass?.slice('language-'.length).toLowerCase();
  if (block.matches('.no-highlight, .nohighlight') || (language && !hljs.getLanguage(language))) return;
  const code = block.textContent ?? '';
  const result = language ? hljs.highlight(code, { language, ignoreIllegals: true }) : hljs.highlightAuto(code);
  block.innerHTML = DOMPurify.sanitize(result.value, { ALLOWED_TAGS: ['span'], ALLOWED_ATTR: ['class'] });
  block.classList.add('hljs');
}

/** Applies NovarisAI-style syntax highlighting only inside this editor's preview. */
export function highlightCodeBlocks(preview: HTMLElement): void {
  for (const block of preview.querySelectorAll<HTMLElement>('pre code')) highlightBlock(block);
}
