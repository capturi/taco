import { useState, type ReactNode } from 'react';

type SortableListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
};

// Native HTML5 drag-and-drop reordering. Each row is draggable via the grip
// handle; dropping on another row moves the dragged item to that position.
// Callers should keep their ↑/↓ buttons as a keyboard-accessible fallback.
export function SortableList<T>({
  items,
  getKey,
  onReorder,
  renderItem,
  className,
}: SortableListProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const reset = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const drop = (to: number) => {
    if (dragIndex === null || dragIndex === to) return reset();
    const next = items.slice();
    const [moved] = next.splice(dragIndex, 1);
    next.splice(to, 0, moved);
    onReorder(next);
    reset();
  };

  return (
    <ol className={className}>
      {items.map((item, index) => {
        const isDragging = dragIndex === index;
        const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;
        const cls =
          [isDragging && 'taco-sortable-dragging', isOver && 'taco-sortable-over']
            .filter(Boolean)
            .join(' ') || undefined;
        return (
          <li
            key={getKey(item)}
            draggable
            className={cls}
            onDragStart={(e) => {
              setDragIndex(index);
              e.dataTransfer.effectAllowed = 'move';
              // Firefox won't start a drag unless some data is set.
              e.dataTransfer.setData('text/plain', getKey(item));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overIndex !== index) setOverIndex(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(index);
            }}
            onDragEnd={reset}
          >
            <span className="taco-drag-handle" aria-hidden="true">
              ⠿
            </span>
            {renderItem(item, index)}
          </li>
        );
      })}
    </ol>
  );
}
