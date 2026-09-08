import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Header from "./components/Header";
import PostGrid from "./components/PostGrid";
import Carousel from "./components/Carousel";
import { fetchPosts } from "./services/api";
import { useDebounce } from "./hooks/useDebounce";
import { useInfiniteScroll } from "./hooks/useInfiniteScroll";

export function App() {
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);

  // Carousel state
  const [carouselPosts, setCarouselPosts] = useState(null);

  // Shared Like state for each carousel group
  const [carouselLikes, setCarouselLikes] = useState({});

  // Per-post interactive state
  const [comments, setComments] = useState({});
  const [bookmarks, setBookmarks] = useState({});

  const sentinelRef = useRef(null);
  const isFetchingRef = useRef(false);

  // Load next page of posts from API (9 posts per request)
  const loadPosts = useCallback(async (pageNumber) => {
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    setIsLoading(true);

    try {
      const newPosts = await fetchPosts(pageNumber, 9);

      if (!newPosts || newPosts.length === 0) {
        setHasMore(false);
        return;
      }

      setPosts((prevPosts) => {
        const existingIds = new Set(prevPosts.map((p) => p.id));
        const filteredNew = newPosts.filter(
          (p) => !existingIds.has(p.id)
        );

        return [...prevPosts, ...filteredNew];
      });

      setPage(pageNumber + 1);
    } catch (err) {
      console.error("Error fetching posts:", err);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPosts(1);
  }, [loadPosts]);

  // Infinite scroll
  useInfiniteScroll(sentinelRef, {
    hasMore: hasMore && !debouncedSearch.trim(),
    isLoading,
    onLoadMore: () => {
      if (!isLoading && hasMore) {
        loadPosts(page);
      }
    }
  });

  // Filter posts based on search
  const filteredPosts = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();

    if (!term) return posts;

    return posts.filter((post) => {
      const idStr = String(post.id);
      const title = (post.title || "").toLowerCase();
      const caption = (post.caption || "").toLowerCase();
      const username = (post.username || "").toLowerCase();
      const category = (post.category || "").toLowerCase();
      const hashtags = (post.hashtags || "").toLowerCase();

      return (
        idStr === term ||
        `post ${idStr}` === term ||
        `#${idStr}` === term ||
        title.includes(term) ||
        caption.includes(term) ||
        username.includes(term) ||
        category.includes(term) ||
        hashtags.includes(term)
      );
    });
  }, [posts, debouncedSearch]);

  // Open carousel with 3 posts
  const handlePostClick = useCallback(
    (post) => {
      const postList =
        filteredPosts.length > 0 ? filteredPosts : posts;

      const clickedIndex = postList.findIndex(
        (p) => p.id === post.id
      );

      if (clickedIndex === -1) {
        setCarouselPosts([post]);
        return;
      }

      const total = postList.length;
      const count = Math.min(3, total);
      const selected = [];

      for (let i = 0; i < count; i++) {
        const idx = (clickedIndex + i) % total;
        selected.push(postList[idx]);
      }

      setCarouselPosts(selected);
    },
    [filteredPosts, posts]
  );

  const handleCloseCarousel = useCallback(() => {
    setCarouselPosts(null);
  }, []);

  // Create a unique key for the current 3-post carousel
  const getCarouselKey = useCallback((posts) => {
    if (!posts || posts.length === 0) return "";

    return posts.map((post) => post.id).join("-");
  }, []);

  // Shared Like toggle for the whole carousel
  const handleToggleLike = useCallback(() => {
    if (!carouselPosts || carouselPosts.length === 0) return;

    const carouselKey = getCarouselKey(carouselPosts);

    setCarouselLikes((prev) => ({
      ...prev,
      [carouselKey]: !prev[carouselKey]
    }));
  }, [carouselPosts, getCarouselKey]);

  // Per-post bookmark toggle
  const handleToggleBookmark = useCallback((postId) => {
    setBookmarks((prev) => ({
      ...prev,
      [postId]: !prev[postId]
    }));
  }, []);

  // Per-post comment add
  const handleAddComment = useCallback((postId, commentText) => {
    setComments((prev) => ({
      ...prev,
      [postId]: [...(prev[postId] || []), commentText]
    }));
  }, []);

  // Current carousel Like state
  const currentCarouselKey = getCarouselKey(carouselPosts);
  const isCarouselLiked = Boolean(
    carouselLikes[currentCarouselKey]
  );

  return (
    <div className="instagram-page">
      <Header
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      <main>
        <PostGrid
          posts={filteredPosts}
          isLoading={isLoading}
          hasMore={hasMore}
          onPostClick={handlePostClick}
          sentinelRef={sentinelRef}
        />
      </main>

      {carouselPosts && (
        <Carousel
          carouselPosts={carouselPosts}
          onClose={handleCloseCarousel}

          // Shared Like for all 3 carousel posts
          isLiked={isCarouselLiked}
          onToggleLike={handleToggleLike}

          comments={comments}
          onAddComment={handleAddComment}

          bookmarks={bookmarks}
          onToggleBookmark={handleToggleBookmark}
        />
      )}
    </div>
  );
}

export default App;

