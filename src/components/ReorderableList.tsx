import { useState, type DragEvent, type ReactNode } from 'react';

type Props<T> = {
  items: T[];
  getKey: (item: T) => string;
  /** Move the element at `from` to index `to`. */
  onReorder: (from: number, to: number) => void;
  /**
   * Render one row. `handle` is the drag grip + position number + up/down
   * arrows — place it wherever it fits the row's layout.
   */
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode;
  /** Classes for each row wrapper (the drop target). */
  itemClassName?: string;
};

/**
 * A list whose rows can be reordered by dragging the grip handle (desktop) or
 * the up/down arrows (works everywhere, incl. touch). Native HTML5 drag — no deps.
 */
export default function ReorderableList<T>({
  items,
  getKey,
  onReorder,
  renderItem,
  itemClassName = '',
}: Props<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const reset = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <>
      {items.map((item, i) => {
        const isDragging = dragIndex === i;
        const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
        const handle = (
          <OrderControls
            index={i}
            count={items.length}
            onMove={(dir) => onReorder(i, i + dir)}
            onDragStart={(e) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(i)); // Firefox needs data
            }}
          />
        );
        return (
          <div
            key={getKey(item)}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overIndex !== i) setOverIndex(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i);
              reset();
            }}
            onDragEnd={reset}
            className={`${itemClassName} transition-[box-shadow,opacity] ${
              isOver ? 'ring-2 ring-accent' : ''
            } ${isDragging ? 'opacity-40' : ''}`}
          >
            {renderItem(item, i, handle)}
          </div>
        );
      })}
    </>
  );
}

function OrderControls({
  index,
  count,
  onMove,
  onDragStart,
}: {
  index: number;
  count: number;
  onMove: (dir: -1 | 1) => void;
  onDragStart: (e: DragEvent) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-px">
      <span
        draggable
        onDragStart={onDragStart}
        aria-label="Drag to reorder"
        title="Drag to reorder"
        className="cursor-grab select-none px-0.5 text-[15px] leading-none text-faint active:cursor-grabbing"
      >
        ⠿
      </span>
      <span className="tnum w-4 text-center text-xs font-bold text-faint">
        {index + 1}
      </span>
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label="Move up"
          className="grid h-[13px] w-[18px] place-items-center text-[8px] leading-none text-faint transition-colors hover:text-accent disabled:text-line-strong disabled:hover:text-line-strong"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === count - 1}
          aria-label="Move down"
          className="grid h-[13px] w-[18px] place-items-center text-[8px] leading-none text-faint transition-colors hover:text-accent disabled:text-line-strong disabled:hover:text-line-strong"
        >
          ▼
        </button>
      </div>
    </div>
  );
}
