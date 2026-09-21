import React, { useState, useEffect, useRef, useMemo, UIEvent, ReactNode } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight?: number | string;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  overscan?: number;
  emptyState?: ReactNode;
}

export function VirtualList<T>({
  items,
  itemHeight,
  containerHeight = '600px',
  renderItem,
  className = '',
  overscan = 5,
  emptyState
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [clientViewportHeight, setClientViewportHeight] = useState(600);

  useEffect(() => {
    if (containerRef.current) {
      setClientViewportHeight(containerRef.current.clientHeight || 600);
    }
  }, [containerHeight]);

  const totalHeight = items.length * itemHeight;

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const { startIndex, endIndex, offsetY } = useMemo(() => {
    const rawStart = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(clientViewportHeight / itemHeight);

    const start = Math.max(0, rawStart - overscan);
    const end = Math.min(items.length, rawStart + visibleCount + overscan);
    const offset = start * itemHeight;

    return {
      startIndex: start,
      endIndex: end,
      offsetY: offset
    };
  }, [scrollTop, itemHeight, clientViewportHeight, overscan, items.length]);

  if (items.length === 0) {
    return <div className={className}>{emptyState || null}</div>;
  }

  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-y-auto relative contain-strict ${className}`}
      style={{
        height: typeof containerHeight === 'number' ? `${containerHeight}px` : containerHeight,
        willChange: 'scroll-position'
      }}
    >
      <div style={{ height: `${totalHeight}px`, width: '100%', position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map((item, localIndex) => {
            const actualIndex = startIndex + localIndex;
            return (
              <div key={actualIndex} style={{ height: `${itemHeight}px` }}>
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
