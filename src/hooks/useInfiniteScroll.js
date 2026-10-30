import { useEffect } from "react";

/**
 * Hook to trigger callback when sentinel element scrolls near the viewport.
 * Automatically disconnects while loading to prevent concurrent fetches,
 * and re-connects when loading finishes to detect new intersection.
 *
 * @param {React.RefObject} sentinelRef Ref to the sentinel DOM node
 * @param {Object} options Options containing hasMore, isLoading, and onLoadMore
 */
export function useInfiniteScroll(
  sentinelRef,
  { hasMore, isLoading, onLoadMore, rootMargin = "300px" }
) {
  useEffect(() => {
    const sentinel = sentinelRef.current;
    // Do not attach observer if no more posts exist or a fetch is in progress
    if (!sentinel || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && typeof onLoadMore === "function") {
          onLoadMore();
        }
      },
      {
        root: null,
        rootMargin,
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [sentinelRef, hasMore, isLoading, onLoadMore, rootMargin]);
}

export default useInfiniteScroll;
