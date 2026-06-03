import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '../api/types';
import type { CustomFilter } from '../lib/config';
import type { Filters } from '../lib/filter';
import type { GroupKey } from '../lib/groupBy';
import { orderWithMeFirst } from '../lib/users';
import { UserAvatar } from './UserAvatar';

type Props = {
  groupKey: GroupKey;
  onGroupKeyChange: (k: GroupKey) => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  customFilters: CustomFilter[];
  onConfigureCustomFilters: () => void;
  assignees: User[];
  me: User | null;
  allCollapsed: boolean;
  onToggleAllGroups: () => void;
  onCreateClick: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onSettingsClick: () => void;
  onClose: () => void;
};

export function Toolbar(props: Props) {
  const { filters, onFiltersChange } = props;

  const setAssignees = (ids: string[]) => onFiltersChange({ ...filters, assigneeAccountIds: ids });
  const toggleCurrentSprint = () =>
    onFiltersChange({ ...filters, currentSprintOnly: !filters.currentSprintOnly });

  const hasActiveFilters =
    filters.currentSprintOnly ||
    filters.assigneeAccountIds.length > 0 ||
    filters.customFilterId !== null;
  const clearFilters = () =>
    onFiltersChange({
      ...filters,
      currentSprintOnly: false,
      assigneeAccountIds: [],
      customFilterId: null,
    });

  return (
    <div className="taco-toolbar">
      <LoadingBar active={props.isRefreshing} />
      <div className="taco-toolbar-controls">
        <button className="taco-button dark" onClick={props.onCreateClick}>
          + Create
        </button>
        <button
          className="taco-button taco-icon-button"
          onClick={props.onRefresh}
          title="Refresh issues"
          aria-label="Refresh issues"
          disabled={props.isRefreshing}
        >
          <svg
            className={props.isRefreshing ? 'taco-spin' : undefined}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>

        <span style={{ width: 12 }} />

        <label>Group by</label>
        <div className="taco-segmented">
          {(['status', 'epic', 'assignee'] as GroupKey[]).map((k) => (
            <button
              key={k}
              aria-pressed={props.groupKey === k}
              onClick={() => props.onGroupKeyChange(k)}
            >
              {labelFor(k)}
            </button>
          ))}
        </div>
        <button className="taco-button" onClick={props.onToggleAllGroups}>
          {props.allCollapsed ? 'Expand all' : 'Collapse all'}
        </button>
      </div>

      <div className="taco-toolbar-end">
        <input
          className="taco-input"
          style={{ minWidth: 180 }}
          placeholder="Search…"
          value={filters.text}
          onChange={(e) => onFiltersChange({ ...filters, text: e.target.value })}
        />

        <OptionsMenu
          onSettingsClick={props.onSettingsClick}
          onConfigureCustomFilters={props.onConfigureCustomFilters}
        />
        <button
          className="taco-button"
          onClick={props.onClose}
          aria-label="Close Taco"
          title="Close Taco"
        >
          ✕
        </button>
      </div>

      <div className="taco-filter-group">
        <button
          className="taco-button"
          aria-pressed={filters.currentSprintOnly}
          onClick={toggleCurrentSprint}
        >
          Current sprint
        </button>

        <UserFilter
          me={props.me}
          assignees={props.assignees}
          value={filters.assigneeAccountIds}
          onChange={setAssignees}
        />

        <CustomFilterBar
          customFilters={props.customFilters}
          activeId={filters.customFilterId}
          onSelect={(id) =>
            onFiltersChange({
              ...filters,
              customFilterId: filters.customFilterId === id ? null : id,
            })
          }
        />

        <button
          className="taco-pill-clear taco-filter-clear"
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          aria-label="Clear all filters"
          title="Clear all filters"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

type OptionsMenuProps = {
  onSettingsClick: () => void;
  onConfigureCustomFilters: () => void;
};

function OptionsMenu({ onSettingsClick, onConfigureCustomFilters }: OptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      // composedPath is required because Taco lives in a shadow DOM; e.target gets
      // retargeted to the host outside the shadow tree on document-level listeners.
      const path = e.composedPath();
      if (wrapperRef.current && !path.includes(wrapperRef.current)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const runMenuAction = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div className="taco-menu-wrapper" ref={wrapperRef}>
      <button
        className="taco-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Options"
        title="Options"
        onClick={() => setOpen((o) => !o)}
      >
        ⋮
      </button>
      {open && (
        <div className="taco-menu" role="dialog" aria-label="Options">
          <div className="taco-menu-actions">
            <button
              className="taco-button"
              onClick={() => runMenuAction(onConfigureCustomFilters)}
            >
              Custom filters…
            </button>
            <button className="taco-button" onClick={() => runMenuAction(onSettingsClick)}>
              Settings…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function labelFor(k: GroupKey): string {
  return k === 'status' ? 'Status' : k === 'epic' ? 'Epic' : 'Assignee';
}

const MORSE_MESSAGE = 'Simon is very cool';
const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
};
// Standard morse timing: dot = 1 unit, dash = 3, intra-character gap = 1,
// inter-character gap = 3, word gap = 7.
const UNIT_PX = 30;
const UNIT_MS = 70;

type Mark = { on: boolean; px: number };

function morseMarks(message: string): Mark[] {
  const marks: Mark[] = [];
  const push = (on: boolean, units: number) => marks.push({ on, px: units * UNIT_PX });
  const words = message.toUpperCase().trim().split(/\s+/);
  words.forEach((word, wi) => {
    [...word].forEach((ch, li) => {
      const code = MORSE[ch];
      if (!code) return;
      [...code].forEach((sym, si) => {
        push(true, sym === '-' ? 3 : 1);
        if (si < code.length - 1) push(false, 1);
      });
      if (li < word.length - 1) push(false, 3);
    });
    if (wi < words.length - 1) push(false, 7);
  });
  push(false, 7); // trailing gap before the pattern repeats
  return marks;
}

function currentTranslateX(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  return new DOMMatrixReadOnly(t).m41;
}

function LoadingBar({ active }: { active: boolean }) {
  const barRef = useRef<HTMLDivElement>(null);
  const tapeRef = useRef<HTMLDivElement>(null);
  // Stay mounted after `active` flips false so the visible dots can drain off
  // to the left before the bar disappears.
  const [mounted, setMounted] = useState(active);
  const loopRef = useRef<Animation | null>(null);
  const introRef = useRef<Animation | null>(null);
  const drainRef = useRef<Animation | null>(null);
  // The tape's translateX at the moment loading stopped, so the drain picks up
  // exactly where the loop left off instead of snapping back.
  const lastXRef = useRef(0);

  const marks = useMemo(() => morseMarks(MORSE_MESSAGE), []);
  // Two identical copies sit side by side, so sliding by -50% (one copy
  // width) loops seamlessly. Speed is fixed per unit so the rhythm reads.
  const duration = useMemo(
    () => marks.reduce((sum, m) => sum + m.px, 0) * (UNIT_MS / UNIT_PX),
    [marks],
  );

  // Remount instantly if a new load starts.
  useEffect(() => {
    if (active) setMounted(true);
  }, [active]);

  // Running phase: intro slide-in, then seamless loop. Cleanup captures the
  // tape position and stops generating new dots when loading ends.
  useEffect(() => {
    if (!mounted || !active) return;
    const el = tapeRef.current;
    const bar = barRef.current;
    if (!el || !bar) return;

    drainRef.current?.cancel();
    drainRef.current = null;
    bar.style.clipPath = '';

    const startLoop = () =>
      el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }], {
        duration,
        iterations: Infinity,
        easing: 'linear',
      });

    // Start the tape off-screen to the right and slide it in once, at the same
    // pixels-per-ms pace as the loop, then hand off to the seamless loop.
    const barWidth = bar.clientWidth;
    if (barWidth > 0) {
      const introDuration = barWidth * (UNIT_MS / UNIT_PX);
      const intro = el.animate(
        [{ transform: `translateX(${barWidth}px)` }, { transform: 'translateX(0)' }],
        { duration: introDuration, easing: 'linear', fill: 'forwards' },
      );
      introRef.current = intro;
      intro.onfinish = () => {
        loopRef.current = startLoop();
      };
    } else {
      loopRef.current = startLoop();
    }

    return () => {
      lastXRef.current = currentTranslateX(el);
      introRef.current?.cancel();
      introRef.current = null;
      loopRef.current?.cancel();
      loopRef.current = null;
    };
  }, [mounted, active, duration]);

  // Drain phase: no new dots enter (a clip sweeps the right edge inward) while
  // the dots already on screen keep sliding off to the left.
  useEffect(() => {
    if (active || !mounted) return;
    const el = tapeRef.current;
    const bar = barRef.current;
    if (!el || !bar) {
      setMounted(false);
      return;
    }
    const barWidth = bar.clientWidth;
    const drainDuration = Math.max(1, barWidth) * (UNIT_MS / UNIT_PX);
    const startX = lastXRef.current;

    el.animate(
      [
        { transform: `translateX(${startX}px)` },
        { transform: `translateX(${startX - barWidth}px)` },
      ],
      { duration: drainDuration, easing: 'linear', fill: 'forwards' },
    );
    const drain = bar.animate(
      [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 100% 0 0)' }],
      { duration: drainDuration, easing: 'linear', fill: 'forwards' },
    );
    drainRef.current = drain;
    drain.onfinish = () => setMounted(false);

    return () => drain.cancel();
  }, [active, mounted]);

  if (!mounted) return null;

  const copy = (key: string) =>
    marks.map((m, i) => (
      <span
        key={`${key}-${i}`}
        className={m.on ? 'taco-loading-dit' : 'taco-loading-gap'}
        style={{ width: m.px }}
      />
    ));

  return (
    <div className="taco-loading-bar" ref={barRef} role="progressbar" aria-label="Loading issues">
      <div className="taco-loading-tape" ref={tapeRef}>
        {copy('a')}
        {copy('b')}
      </div>
    </div>
  );
}

type CustomFilterBarProps = {
  customFilters: CustomFilter[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

function CustomFilterBar({ customFilters, activeId, onSelect }: CustomFilterBarProps) {
  if (customFilters.length === 0) return null;
  return (
    <div className="taco-custom-filters" role="group" aria-label="Custom filters">
      {customFilters.map((f) => (
        <button
          key={f.id}
          className="taco-button"
          aria-pressed={activeId === f.id}
          onClick={() => onSelect(f.id)}
          title={f.name || 'Untitled filter'}
        >
          {f.name || 'Untitled filter'}
        </button>
      ))}
    </div>
  );
}

type UserFilterProps = {
  me: User | null;
  assignees: User[];
  value: string[];
  onChange: (next: string[]) => void;
};

function UserFilter({ me, assignees, value, onChange }: UserFilterProps) {
  const ordered = orderWithMeFirst(assignees, me);
  const selected = new Set(value);

  if (ordered.length === 0) return null;

  const toggle = (id: string) => {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <div className="taco-user-filter" role="group" aria-label="Filter by assignee">
      {ordered.map((u) => {
        const isMe = me?.accountId === u.accountId;
        const isSelected = selected.has(u.accountId);
        return (
          <button
            key={u.accountId}
            type="button"
            className={`taco-user-pill${isSelected ? ' selected' : ''}${isMe ? ' me' : ''}`}
            aria-pressed={isSelected}
            title={isMe ? `${u.displayName} (you)` : u.displayName}
            onClick={() => toggle(u.accountId)}
          >
            <UserAvatar user={u} size={24} />
          </button>
        );
      })}
    </div>
  );
}

