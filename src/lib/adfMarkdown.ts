import { marked, type Token, type Tokens } from 'marked';

// Atlassian Document Format — minimal type that captures the bits we round-trip.
export type ADFDoc = {
  type: 'doc';
  version: number;
  content: ADFNode[];
};

export type ADFNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: ADFMark[];
  content?: ADFNode[];
};

export type ADFMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

const SUPPORTED_NODES = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'blockquote',
  'hardBreak',
  'rule',
  'mediaSingle',
  'media',
]);

const SUPPORTED_MARKS = new Set(['strong', 'em', 'code', 'link', 'strike']);

export function hasUnsupportedAdf(node: ADFNode | ADFDoc | null | undefined): boolean {
  if (!node) return false;
  if (node.type && !SUPPORTED_NODES.has(node.type)) return true;
  if ('marks' in node && node.marks) {
    for (const m of node.marks) if (!SUPPORTED_MARKS.has(m.type)) return true;
  }
  if ('content' in node && node.content) {
    for (const c of node.content) if (hasUnsupportedAdf(c)) return true;
  }
  return false;
}

// ---------- ADF → Markdown ----------

export function adfToMarkdown(doc: ADFDoc | null | undefined): string {
  if (!doc || !doc.content) return '';
  return doc.content.map((n) => blockToMarkdown(n)).join('\n\n').trim();
}

function blockToMarkdown(node: ADFNode): string {
  switch (node.type) {
    case 'paragraph':
      return inlineToMarkdown(node.content ?? []);
    case 'heading': {
      const level = Math.max(1, Math.min(6, Number(node.attrs?.level) || 1));
      return '#'.repeat(level) + ' ' + inlineToMarkdown(node.content ?? []);
    }
    case 'bulletList':
      return (node.content ?? [])
        .map((item) => '- ' + listItemToMarkdown(item).replace(/\n/g, '\n  '))
        .join('\n');
    case 'orderedList':
      return (node.content ?? [])
        .map((item, i) => `${i + 1}. ` + listItemToMarkdown(item).replace(/\n/g, '\n   '))
        .join('\n');
    case 'codeBlock': {
      const lang = (node.attrs?.language as string | undefined) ?? '';
      const text = (node.content ?? []).map((t) => t.text ?? '').join('');
      return '```' + lang + '\n' + text + '\n```';
    }
    case 'blockquote': {
      const inner = (node.content ?? []).map(blockToMarkdown).join('\n\n');
      return inner
        .split('\n')
        .map((l) => '> ' + l)
        .join('\n');
    }
    case 'rule':
      return '---';
    case 'mediaSingle': {
      const media = (node.content ?? []).find((c) => c.type === 'media');
      if (!media) return '';
      const id = String(media.attrs?.id ?? '');
      const collection = String(media.attrs?.collection ?? '');
      const alt = String(media.attrs?.alt ?? '') || 'image';
      // Preserved-scheme URL so we can round-trip back to a mediaSingle on save.
      return `![${alt}](taco:media:${encodeURIComponent(collection)}:${encodeURIComponent(id)})`;
    }
    default:
      return '';
  }
}

function listItemToMarkdown(item: ADFNode): string {
  return (item.content ?? [])
    .map(blockToMarkdown)
    .filter((s) => s.length > 0)
    .join('\n\n');
}

function inlineToMarkdown(nodes: ADFNode[]): string {
  return nodes.map(inlineNodeToMarkdown).join('');
}

function inlineNodeToMarkdown(node: ADFNode): string {
  if (node.type === 'hardBreak') return '  \n';
  if (node.type !== 'text') return '';
  let text = node.text ?? '';
  const marks = node.marks ?? [];
  // Apply marks innermost-out: code → em → strong → link
  if (marks.some((m) => m.type === 'code')) text = '`' + text + '`';
  if (marks.some((m) => m.type === 'em')) text = '*' + text + '*';
  if (marks.some((m) => m.type === 'strong')) text = '**' + text + '**';
  if (marks.some((m) => m.type === 'strike')) text = '~~' + text + '~~';
  const link = marks.find((m) => m.type === 'link');
  if (link) {
    const href = String(link.attrs?.href ?? '');
    text = `[${text}](${href})`;
  }
  return text;
}

// ---------- Markdown → ADF ----------

export function markdownToAdf(markdown: string): ADFDoc {
  const tokens = marked.lexer(markdown);
  const content: ADFNode[] = [];
  for (const token of tokens) {
    const nodes = blockTokenToAdf(token);
    if (nodes) content.push(...nodes);
  }
  if (content.length === 0) {
    content.push({ type: 'paragraph', content: [] });
  }
  return { type: 'doc', version: 1, content };
}

function blockTokenToAdf(token: Token): ADFNode[] | null {
  switch (token.type) {
    case 'heading': {
      const t = token as Tokens.Heading;
      return [
        {
          type: 'heading',
          attrs: { level: t.depth },
          content: inlineTokensToAdf(t.tokens ?? []),
        },
      ];
    }
    case 'paragraph': {
      const t = token as Tokens.Paragraph;
      const inlineTokens = t.tokens ?? [];
      // Image-only paragraph → mediaSingle (best-effort inline image embed).
      if (inlineTokens.length === 1 && inlineTokens[0].type === 'image') {
        const img = inlineTokens[0] as Tokens.Image;
        const media = parseMediaUrl(img.href);
        if (media) {
          return [
            {
              type: 'mediaSingle',
              attrs: { layout: 'center' },
              content: [
                {
                  type: 'media',
                  attrs: {
                    type: 'file',
                    id: media.id,
                    collection: media.collection,
                    ...(img.text ? { alt: img.text } : {}),
                  },
                },
              ],
            },
          ];
        }
      }
      return [{ type: 'paragraph', content: inlineTokensToAdf(inlineTokens) }];
    }
    case 'code': {
      const t = token as Tokens.Code;
      const attrs: Record<string, unknown> = {};
      if (t.lang) attrs.language = t.lang;
      return [
        {
          type: 'codeBlock',
          attrs,
          content: t.text ? [{ type: 'text', text: t.text }] : [],
        },
      ];
    }
    case 'list': {
      const t = token as Tokens.List;
      const items = t.items.map((item) => ({
        type: 'listItem',
        content: listItemContentToAdf(item),
      }));
      return [{ type: t.ordered ? 'orderedList' : 'bulletList', content: items }];
    }
    case 'blockquote': {
      const t = token as Tokens.Blockquote;
      const inner: ADFNode[] = [];
      for (const sub of t.tokens ?? []) {
        const subNodes = blockTokenToAdf(sub);
        if (subNodes) inner.push(...subNodes);
      }
      return [{ type: 'blockquote', content: inner.length ? inner : [{ type: 'paragraph', content: [] }] }];
    }
    case 'hr':
      return [{ type: 'rule' }];
    case 'space':
    case 'br':
      return null;
    default:
      // Fallback: dump raw text as a paragraph
      const raw = (token as { raw?: string }).raw;
      if (raw && raw.trim()) {
        return [{ type: 'paragraph', content: [{ type: 'text', text: raw.trim() }] }];
      }
      return null;
  }
}

function listItemContentToAdf(item: Tokens.ListItem): ADFNode[] {
  const content: ADFNode[] = [];
  for (const t of item.tokens ?? []) {
    if (t.type === 'text') {
      const innerTokens = (t as Tokens.Text).tokens;
      content.push({
        type: 'paragraph',
        content: innerTokens
          ? inlineTokensToAdf(innerTokens)
          : [{ type: 'text', text: (t as Tokens.Text).text }],
      });
    } else {
      const sub = blockTokenToAdf(t);
      if (sub) content.push(...sub);
    }
  }
  if (content.length === 0) {
    content.push({ type: 'paragraph', content: [] });
  }
  return content;
}

function inlineTokensToAdf(tokens: Token[], marks: ADFMark[] = []): ADFNode[] {
  const out: ADFNode[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text;
        if (t.tokens && t.tokens.length > 0) {
          out.push(...inlineTokensToAdf(t.tokens, marks));
        } else {
          out.push(textNode(t.text, marks));
        }
        break;
      }
      case 'escape':
        out.push(textNode((token as Tokens.Escape).text, marks));
        break;
      case 'strong':
        out.push(...inlineTokensToAdf((token as Tokens.Strong).tokens, [...marks, { type: 'strong' }]));
        break;
      case 'em':
        out.push(...inlineTokensToAdf((token as Tokens.Em).tokens, [...marks, { type: 'em' }]));
        break;
      case 'codespan':
        out.push(textNode((token as Tokens.Codespan).text, [...marks, { type: 'code' }]));
        break;
      case 'del':
        out.push(...inlineTokensToAdf((token as Tokens.Del).tokens, [...marks, { type: 'strike' }]));
        break;
      case 'link': {
        const t = token as Tokens.Link;
        out.push(
          ...inlineTokensToAdf(t.tokens ?? [{ type: 'text', raw: t.text, text: t.text }], [
            ...marks,
            { type: 'link', attrs: { href: t.href } },
          ]),
        );
        break;
      }
      case 'image': {
        // ADF has no plain image inline; convert to a labelled link to the attachment URL.
        const t = token as Tokens.Image;
        out.push(textNode(t.text || t.title || 'image', [
          ...marks,
          { type: 'link', attrs: { href: t.href } },
        ]));
        break;
      }
      case 'br':
        out.push({ type: 'hardBreak' });
        break;
      case 'html':
        // Strip HTML tags; emit raw text
        out.push(textNode((token as Tokens.HTML).text.replace(/<[^>]+>/g, ''), marks));
        break;
      default:
        // Best-effort: emit raw text if available
        const raw = (token as { raw?: string }).raw ?? '';
        if (raw) out.push(textNode(raw, marks));
    }
  }
  return out.filter((n) => n.type !== 'text' || (n.text !== undefined && n.text.length > 0));
}

function textNode(text: string, marks: ADFMark[]): ADFNode {
  if (marks.length === 0) return { type: 'text', text };
  return { type: 'text', text, marks: dedupeMarks(marks) };
}

function dedupeMarks(marks: ADFMark[]): ADFMark[] {
  const seen = new Map<string, ADFMark>();
  for (const m of marks) seen.set(m.type + ':' + (m.attrs?.href ?? ''), m);
  return [...seen.values()];
}

// Parse our round-trip scheme `taco:media:<collection>:<id>` so existing
// mediaSingle nodes (already-embedded images Jira created) survive a re-save.
// New issue attachments don't go through here — Jira's renderer doesn't accept
// our attachment-id-as-media-id substitution, so pasted images stay as links.
function parseMediaUrl(href: string): { id: string; collection: string } | null {
  if (href.startsWith('taco:media:')) {
    const rest = href.slice('taco:media:'.length);
    const sep = rest.indexOf(':');
    if (sep >= 0) {
      return {
        collection: decodeURIComponent(rest.slice(0, sep)),
        id: decodeURIComponent(rest.slice(sep + 1)),
      };
    }
  }
  return null;
}
