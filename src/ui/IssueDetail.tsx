import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { marked } from 'marked';
import type { ADFDocLike, IssueComment, IssueLink, IssueRef } from '../api/types';
import { adfToMarkdown, hasUnsupportedAdf, markdownToAdf } from '../lib/adfMarkdown';
import { useConfig } from '../lib/config';
import { getClient } from './cache';
import { DevInfoSection } from './DevInfoSection';
import {
  AssigneeCell,
  ComponentsCell,
  EditableTitle,
  ParentCell,
  ProductDomainCell,
  SprintCell,
  StatusCell,
} from './editors';
import { useIssueMutations } from './mutations';

type Props = {
  issueKey: string;
  onClose: () => void;
  onSelectIssue: (key: string) => void;
};

const MIN_DETAIL_WIDTH = 320;
const MAX_DETAIL_WIDTH = 1100;

export function IssueDetail({ issueKey, onClose, onSelectIssue }: Props) {
  const client = getClient();
  const { config, update } = useConfig();
  const [width, setWidth] = useState(config.detailWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const clampWidth = (w: number) =>
    Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, w));

  const onResizeStart = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };

    const onMove = (ev: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // Handle is on the left edge; dragging left (smaller clientX) widens.
      setWidth(clampWidth(drag.startWidth + (drag.startX - ev.clientX)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setWidth((w) => {
        update({ detailWidth: w });
        return w;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [width, update]);

  const detailQuery = useQuery({
    queryKey: ['issue-detail', issueKey],
    queryFn: () => client.getIssueDetail(issueKey),
    staleTime: 30_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const childrenQuery = useQuery({
    queryKey: ['issue-children', issueKey],
    queryFn: () => client.getChildren(issueKey),
    staleTime: 30_000,
  });

  const linksByRelation = useMemo<[string, IssueLink[]][]>(() => {
    const map = new Map<string, IssueLink[]>();
    for (const link of detailQuery.data?.links ?? []) {
      const list = map.get(link.relation) ?? [];
      list.push(link);
      map.set(link.relation, list);
    }
    return [...map.entries()];
  }, [detailQuery.data]);

  return (
    <aside
      className="taco-detail-sidebar"
      role="complementary"
      aria-label="Issue detail"
      style={{ width }}
    >
      <div
        className="taco-detail-resize-handle"
        onPointerDown={onResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize detail view"
      />
        <header className="taco-detail-header">
          <div className="taco-detail-header-row">
            {detailQuery.data && (
              <EditableTitle
                issueKey={detailQuery.data.key}
                value={detailQuery.data.summary}
              />
            )}
            <button className="taco-button" onClick={onClose} aria-label="Close detail view">
              Close
            </button>
          </div>
          {detailQuery.data && (
            <a
              className="taco-key"
              href={detailQuery.data.url}
              target="_blank"
              rel="noreferrer"
            >
              {detailQuery.data.key}
            </a>
          )}
        </header>

        {detailQuery.data && (
          <div className="taco-detail-meta">
            <MetaField label="Status">
              <StatusCell issueKey={detailQuery.data.key} status={detailQuery.data.status} />
            </MetaField>
            <MetaField label="Assignee">
              <AssigneeCell
                issueKey={detailQuery.data.key}
                assignee={detailQuery.data.assignee}
              />
            </MetaField>
            <MetaField label="Parent">
              <ParentCell
                issueKey={detailQuery.data.key}
                parent={detailQuery.data.parent}
                onNavigate={onSelectIssue}
              />
            </MetaField>
            <MetaField label="Sprint">
              <SprintCell
                issueKey={detailQuery.data.key}
                sprint={detailQuery.data.sprint ?? null}
              />
            </MetaField>
            <MetaField label="Domain">
              <ProductDomainCell
                issueKey={detailQuery.data.key}
                productDomains={detailQuery.data.productDomains ?? []}
              />
            </MetaField>
            <MetaField label="Components">
              <ComponentsCell
                issueKey={detailQuery.data.key}
                components={detailQuery.data.components ?? []}
                productDomains={detailQuery.data.productDomains ?? []}
              />
            </MetaField>
          </div>
        )}

        <div className="taco-detail-body">
          {detailQuery.isPending && <div className="taco-loading">Loading…</div>}
          {detailQuery.isError && (
            <div className="taco-error">
              Failed to load:{' '}
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : String(detailQuery.error)}
            </div>
          )}
          {detailQuery.data && (
            <>
              <DescriptionSection
                issueKey={detailQuery.data.key}
                issueUrl={detailQuery.data.url}
                descriptionHtml={detailQuery.data.descriptionHtml}
                descriptionAdf={detailQuery.data.descriptionAdf}
              />

              {linksByRelation.length > 0 && (
                <section className="taco-detail-section">
                  <h3>Linked items</h3>
                  {linksByRelation.map(([relation, links]) => (
                    <div key={relation} className="taco-detail-link-group">
                      <h4>{relation}</h4>
                      <IssueRefTable
                        rows={links.map((l) => l.target)}
                        onSelect={onSelectIssue}
                      />
                    </div>
                  ))}
                </section>
              )}

              <CommentsSection
                issueKey={detailQuery.data.key}
                comments={detailQuery.data.comments ?? []}
              />
            </>
          )}
        </div>

        {childrenQuery.data && childrenQuery.data.length > 0 && (
          <div className="taco-detail-footer taco-detail-footer-light">
            <h3>Children</h3>
            <IssueRefTable rows={childrenQuery.data} onSelect={onSelectIssue} />
          </div>
        )}

        {detailQuery.data && <DevInfoSection issueId={detailQuery.data.id} />}
    </aside>
  );
}

function MetaField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="taco-detail-meta-field">
      <span className="taco-detail-meta-label">{label}</span>
      <span className="taco-detail-meta-value">{children}</span>
    </div>
  );
}

function IssueRefTable({ rows, onSelect }: { rows: IssueRef[]; onSelect: (key: string) => void }) {
  return (
    <table className="taco-detail-link-table">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} title={r.key}>
            <td>
              <button
                type="button"
                className="taco-link-button taco-summary"
                onClick={() => onSelect(r.key)}
              >
                {r.summary}
              </button>
            </td>
            <td>
              <span className={`taco-status ${r.status.category}`}>{r.status.name}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type CommentsSectionProps = {
  issueKey: string;
  comments: IssueComment[];
};

function CommentsSection({ issueKey, comments }: CommentsSectionProps) {
  const [draft, setDraft] = useState('');
  const { addComment } = useIssueMutations();

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    addComment.mutate(
      { key: issueKey, adf: markdownToAdf(trimmed) },
      { onSuccess: () => setDraft('') },
    );
  };

  return (
    <section className="taco-detail-section">
      <h3>Comments ({comments.length})</h3>
      {comments.length === 0 ? (
        <p className="taco-detail-empty">No comments yet.</p>
      ) : (
        <ul className="taco-comments">
          {comments.map((c) => (
            <li key={c.id} className="taco-comment">
              <div className="taco-comment-meta">
                <span className="taco-comment-author">
                  {c.author?.displayName ?? 'Unknown'}
                </span>
                <span className="taco-comment-date" title={c.created}>
                  {formatCommentDate(c.created)}
                </span>
              </div>
              <div
                className="taco-detail-description"
                dangerouslySetInnerHTML={{ __html: c.bodyHtml }}
              />
            </li>
          ))}
        </ul>
      )}
      <textarea
        className="taco-input taco-detail-edit-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Add a comment… (Markdown, ⌘/Ctrl+Enter to submit)"
        rows={3}
      />
      {addComment.isError && (
        <div className="taco-cell-error">
          {addComment.error instanceof Error ? addComment.error.message : 'Failed to post'}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          type="button"
          className="taco-button primary"
          onClick={submit}
          disabled={!draft.trim() || addComment.isPending}
        >
          {addComment.isPending ? 'Posting…' : 'Comment'}
        </button>
      </div>
    </section>
  );
}

function formatCommentDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

type DescriptionSectionProps = {
  issueKey: string;
  issueUrl: string;
  descriptionHtml: string;
  descriptionAdf: ADFDocLike | null;
};

function DescriptionSection({
  issueKey,
  issueUrl,
  descriptionHtml,
  descriptionAdf,
}: DescriptionSectionProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { setDescription } = useIssueMutations();
  const unsupported = useMemo(() => hasUnsupportedAdf(descriptionAdf as never), [descriptionAdf]);

  const startEdit = () => {
    setDraft(adfToMarkdown(descriptionAdf as never));
    setEditing(true);
  };

  const save = () => {
    const adf = markdownToAdf(draft);
    const previewHtml = marked.parse(draft, { async: false }) as string;
    setDescription.mutate({ key: issueKey, adf, previewHtml });
    setEditing(false);
  };

  const insertAtCursor = (insertion: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setDraft((d) => d + insertion);
      return;
    }
    const start = ta.selectionStart ?? draft.length;
    const end = ta.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + insertion + draft.slice(end));
    // Restore cursor after the inserted text on next tick.
    requestAnimationFrame(() => {
      const pos = start + insertion.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setUploadError(null);
    setUploading((n) => n + 1);
    try {
      const att = await getClient().uploadAttachment(issueKey, file);
      insertAtCursor(`\n![${att.filename}](${att.contentUrl})\n`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading((n) => n - 1);
    }
  };

  if (editing) {
    return (
      <section className="taco-detail-section">
        <div className="taco-detail-section-head">
          <h3>Description</h3>
          <span className="taco-detail-section-help">
            Markdown · paste an image to attach
          </span>
        </div>
        <textarea
          autoFocus
          ref={textareaRef}
          className="taco-input taco-detail-edit-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            } else if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
          rows={10}
        />
        {uploading > 0 && (
          <div className="taco-cell-loading">Uploading image…</div>
        )}
        {uploadError && (
          <div className="taco-cell-error">Upload failed: {uploadError}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="taco-button" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button
            className="taco-button primary"
            onClick={save}
            disabled={uploading > 0}
          >
            Save
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="taco-detail-section">
      <div className="taco-detail-section-head">
        <h3>Description</h3>
        {unsupported ? (
          <a href={issueUrl} target="_blank" rel="noreferrer" className="taco-detail-section-help">
            Edit in Jira ↗
          </a>
        ) : (
          <button type="button" className="taco-link-button taco-detail-section-help" onClick={startEdit}>
            Edit
          </button>
        )}
      </div>
      {descriptionHtml ? (
        <div
          className="taco-detail-description"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      ) : (
        <p className="taco-detail-empty">
          No description.
          {!unsupported && (
            <>
              {' '}
              <button type="button" className="taco-link-button" onClick={startEdit}>
                Add one
              </button>
            </>
          )}
        </p>
      )}
    </section>
  );
}
