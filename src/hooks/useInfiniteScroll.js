import { useEffect } from "react";

/**
 * Hook to trigger callback when sentinel element scrolls near the viewport
 * @param {React.RefObject} sentinelRef Ref to the sentinel DOM node
 * @param {Object} options Options containing hasMore, isLoading, and onLoadMore
 */
export function useInfiniteScroll(
  sentinelRef,
  { hasMore, isLoading, onLoadMore, rootMargin = "120px" }
) {
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !isLoading) {
          onLoadMore();
        }
      },
      {
        root: null,
        rootMargin,
        threshold: 0
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [sentinelRef, hasMore, isLoading, onLoadMore, rootMargin]);
}

export default useInfiniteScroll;
