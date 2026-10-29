import React, { 
  useState, 
  useEffect, 
  useRef, 
  useCallback, 
  useMemo, 
} from "react"; 
 
 
 
import { useNavigate, useLocation } from "react-router-dom";
import Header from "./components/Header"; 
import PostGrid from "./components/PostGrid"; 
import Carousel from "./components/Carousel"; 
import ProfileHeader from "./components/ProfileHeader";
import { 
  fetchPosts, 
  fetchUserPosts, 
  fetchPostById, 
  searchPosts, 
  createReply, 
  initDefaultAuth, 
  getStoredUser 
} from "./services/api"; 
import { useDebounce } from "./hooks/useDebounce"; 
import { useInfiniteScroll } from "./hooks/useInfiniteScroll"; 
 
function getShortId(id) {
  if (!id) return "";
  const parts = String(id).split("-");
  return parts[parts.length - 1].replace(/^0+/, "") || "";
}

export function App() { 
  const navigate = useNavigate(); 
  const location = useLocation(); 

  // Match /p/:postId or /posts/:postId
  const routeMatch = location.pathname.match(/^\/(?:p|posts)\/([^/]+)/); 
  const routePostId = routeMatch ? decodeURIComponent(routeMatch[1]) : null; 

  const [currentUser, setCurrentUser] = useState(getStoredUser());
  const [activeTab, setActiveTab] = useState(getStoredUser() ? "my-posts" : "explore");
  const [userPostCount, setUserPostCount] = useState(0);
  const activeTabRef = useRef(getStoredUser() ? "my-posts" : "explore");

  const [posts, setPosts] = useState([]); 
  const [nextCursor, setNextCursor] = useState(null); 
  const [isLoading, setIsLoading] = useState(false); 
  const [hasMore, setHasMore] = useState(true); 
  const [searchTerm, setSearchTerm] = useState(""); 
  const [errorMessage, setErrorMessage] = useState(null); 
  
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
  const nextCursorRef = useRef(null); 
  
  // Load posts based on current tab (my-posts, following, or explore)
  const loadPosts = useCallback(async (cursor = null, tabToLoad = activeTabRef.current) => { 
    if (isFetchingRef.current) return; 
  
    isFetchingRef.current = true; 
    setIsLoading(true); 
    setErrorMessage(null); 
  
    try { 
      let result;
      const effectiveTab = tabToLoad;

      if (effectiveTab === "my-posts") {
        const stored = getStoredUser();
        if (!stored) {
          result = await fetchPosts(cursor, 10, "public");
        } else {
          result = await fetchUserPosts("me", cursor, 10);
          if (!cursor) {
            setUserPostCount(result.items.length);
          }
        }
      } else if (effectiveTab === "following") {
        result = await fetchPosts(cursor, 10, "following");
      } else {
        // Default Explore Community Feed
        result = await fetchPosts(cursor, 10, "public");
      }
  
      if (!result || result.items.length === 0) { 
        if (!cursor) {
          setPosts([]);
        }
        setHasMore(false); 
        nextCursorRef.current = null; 
        return; 
      } 
  
      setPosts((prevPosts) => { 
        if (!cursor) return result.items;
        const existingIds = new Set(prevPosts.map((p) => p.id)); 
        const filteredNew = result.items.filter((p) => !existingIds.has(p.id)); 
        return [...prevPosts, ...filteredNew]; 
      }); 
  
      setNextCursor(result.nextCursor); 
      nextCursorRef.current = result.nextCursor; 
  
      if (!result.nextCursor || result.hasMore === false) { 
        setHasMore(false); 
      } 
    } catch (err) { 
      console.error("Error fetching posts:", err); 
      setErrorMessage("Unable to connect to backend server (http://localhost:3001). Please make sure the backend is running."); 
    } finally { 
      setIsLoading(false); 
      isFetchingRef.current = false; 
    } 
  }, []); 
 
  // Initial session check
  useEffect(() => { 
    initDefaultAuth().then((user) => {
      setCurrentUser(user);
      const initialTab = user ? "my-posts" : "explore";
      setActiveTab(initialTab);
      activeTabRef.current = initialTab;
      loadPosts(null, initialTab); 
    });
  }, [loadPosts]); 

  // Switch feed tabs
  const handleTabChange = useCallback((newTab) => {
    if (activeTabRef.current === newTab) return;
    setActiveTab(newTab);
    activeTabRef.current = newTab;
    setPosts([]);
    setNextCursor(null);
    nextCursorRef.current = null;
    setHasMore(true);
    loadPosts(null, newTab);
  }, [loadPosts]);

  // Handle user login / switch / logout
  const handleUserChange = useCallback((user) => {
    setCurrentUser(user);
    const nextTab = user ? "my-posts" : "explore";
    setActiveTab(nextTab);
    activeTabRef.current = nextTab;
    setPosts([]);
    setNextCursor(null);
    nextCursorRef.current = null;
    setHasMore(true);
    loadPosts(null, nextTab);
  }, [loadPosts]);

  // Sync user updates across components
  useEffect(() => {
    const handleUserUpdated = (e) => {
      const user = e.detail || getStoredUser();
      setCurrentUser(user);
    };

    const handleFollowUpdated = () => {
      if (activeTabRef.current === "following") {
        setPosts([]);
        setNextCursor(null);
        nextCursorRef.current = null;
        setHasMore(true);
        loadPosts(null, "following");
      }
    };

    window.addEventListener("user-updated", handleUserUpdated);
    window.addEventListener("follow-updated", handleFollowUpdated);

    return () => {
      window.removeEventListener("user-updated", handleUserUpdated);
      window.removeEventListener("follow-updated", handleFollowUpdated);
    };
  }, [loadPosts]);
 
  // Handle loading next page from scroll 
  const handleLoadMore = useCallback(() => { 
    if (!isFetchingRef.current && nextCursorRef.current) { 
      loadPosts(nextCursorRef.current); 
    } 
  }, [loadPosts]); 
 
  // Infinite scroll 
  useInfiniteScroll(sentinelRef, { 
    hasMore: hasMore && !debouncedSearch.trim(), 
    isLoading, 
    onLoadMore: handleLoadMore, 
  }); 
 
  // Backend search query for terms with length >= 2
  useEffect(() => {
    const term = debouncedSearch.trim();
    if (!term || term.length < 2) return;

    let isCancelled = false;
    searchPosts(term)
      .then((res) => {
        if (!isCancelled && res?.items?.length > 0) {
          setPosts((prev) => {
            const existing = new Set(prev.map((p) => p.id));
            const newItems = res.items.filter((p) => !existing.has(p.id));
            return newItems.length > 0 ? [...prev, ...newItems] : prev;
          });
        }
      })
      .catch((err) => console.warn("Backend search notice:", err));

    return () => {
      isCancelled = true;
    };
  }, [debouncedSearch]);

  // Synchronize URL route with carousel display
  useEffect(() => {
    if (!routePostId) {
      setCarouselPosts(null);
      return;
    }

    // Try finding post in existing posts
    const targetPost = posts.find((p) => {
      const idStr = String(p.id).toLowerCase();
      const shortId = getShortId(p.id);
      return (
        idStr === routePostId.toLowerCase() ||
        shortId === routePostId ||
        p.id === routePostId
      );
    });

    if (targetPost) {
      const clickedIndex = posts.findIndex((p) => p.id === targetPost.id);
      const total = posts.length;
      const count = Math.min(3, total);
      const selected = [];
      for (let i = 0; i < count; i++) {
        selected.push(posts[(clickedIndex + i) % total]);
      }
      setCarouselPosts(selected);
    } else {
      // Direct deep link: fetch post from backend
      let isCancelled = false;
      fetchPostById(routePostId)
        .then((fetched) => {
          if (!isCancelled && fetched) {
            setPosts((prev) => {
              const withoutFetched = prev.filter((p) => p.id !== fetched.id);
              const updated = [fetched, ...withoutFetched];
              const count = Math.min(3, updated.length);
              const selected = [];
              for (let i = 0; i < count; i++) {
                selected.push(updated[i % updated.length]);
              }
              setCarouselPosts(selected);
              return updated;
            });
          }
        })
        .catch((err) => console.error("Error loading route post:", err));

      return () => {
        isCancelled = true;
      };
    }
  }, [routePostId, posts]);

  // Filter posts based on search 
  const filteredPosts = useMemo(() => { 
    const term = debouncedSearch.trim().toLowerCase(); 
 
    if (!term) return posts; 
 
    return posts.filter((post) => { 
      const idStr = String(post.id).toLowerCase(); 
      const shortId = getShortId(post.id); 
      const title = (post.title || "").toLowerCase(); 
      const caption = (post.caption || "").toLowerCase(); 
      const username = (post.username || "").toLowerCase(); 
      const category = (post.category || "").toLowerCase(); 
      const hashtags = (post.hashtags || "").toLowerCase(); 
 
      return ( 
        idStr === term || 
        shortId === term || 
        `post ${shortId}` === term || 
        `#${shortId}` === term || 
        `post ${idStr}` === term || 
        `#${idStr}` === term || 
        idStr.includes(term) || 
        title.includes(term) || 
        caption.includes(term) || 
        username.includes(term) || 
        category.includes(term) || 
        hashtags.includes(term) 
      ); 
    }); 
  }, [posts, debouncedSearch]); 
 
  // Open carousel by navigating to /p/:id
  const handlePostClick = useCallback( 
    (post) => { 
      navigate(`/p/${post.id}`); 
    }, 
    [navigate] 
  ); 
  
  // Close carousel by navigating back to /
  const handleCloseCarousel = useCallback(() => { 
    navigate("/"); 
  }, [navigate]); 
 
  // Create a unique key for the current 3-post carousel 
  const getCarouselKey = useCallback((posts) => { 
    if (!posts || posts.length === 0) return ""; 
 
    return posts.map((post) => post.id).join("-"); 
  }, []); 
 
  // Shared Like toggle for the whole carousel 
  const handleToggleLike = useCallback((postId, nextLiked, nextCount) => { 
    if (carouselPosts && carouselPosts.length > 0) {
      const carouselKey = getCarouselKey(carouselPosts); 
      setCarouselLikes((prev) => ({ 
        ...prev, 
        [carouselKey]: nextLiked !== undefined ? nextLiked : !prev[carouselKey], 
      })); 
    }

    if (postId) {
      setPosts((prevPosts) =>
        prevPosts.map((p) =>
          p.id === postId
            ? {
                ...p,
                likedByViewer: nextLiked !== undefined ? nextLiked : !p.likedByViewer,
                likeCount: nextCount !== undefined ? nextCount : (p.likedByViewer ? Math.max(0, p.likeCount - 1) : p.likeCount + 1),
              }
            : p
        )
      );
    }
  }, [carouselPosts, getCarouselKey]); 
 
  // Per-post bookmark toggle 
  const handleToggleBookmark = useCallback((postId) => { 
    setBookmarks((prev) => ({ 
      ...prev, 
      [postId]: !prev[postId], 
    })); 
  }, []); 
 
  // Per-post comment add 
  const handleAddComment = useCallback(async (postId, commentText) => { 
    setComments((prev) => ({ 
      ...prev, 
      [postId]: [...(prev[postId] || []), commentText], 
    })); 
 
    try { 
      await createReply(postId, commentText); 
    } catch (err) { 
      console.warn("Could not save comment to backend:", err); 
    } 
  }, []); 

  const handlePostCreated = useCallback((newPost) => {
    setUserPostCount((prev) => prev + 1);
    if (activeTabRef.current === "my-posts") {
      setPosts((prev) => [newPost, ...prev]);
    } else {
      handleTabChange("my-posts");
    }
  }, [handleTabChange]);

  const handlePostUpdated = useCallback((updatedPost) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === updatedPost.id ? { ...p, ...updatedPost } : p))
    );
    setCarouselPosts((prev) =>
      prev ? prev.map((p) => (p.id === updatedPost.id ? { ...p, ...updatedPost } : p)) : prev
    );
  }, []);

  const handlePostDeleted = useCallback((deletedId) => {
    setUserPostCount((prev) => Math.max(0, prev - 1));
    setPosts((prev) => prev.filter((p) => p.id !== deletedId));
    handleCloseCarousel();
  }, [handleCloseCarousel]);

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
        onPostCreated={handlePostCreated}
        onUserChange={handleUserChange}
      /> 
 
      <main> 
        <ProfileHeader
          postCount={userPostCount || filteredPosts.length}
          onProfileUpdated={(updated) => {
            setCurrentUser(updated);
          }}
        />

        {/* Instagram Profile Navigation Tabs */}
        <div className="feed-navigation-tabs">
          <button
            type="button"
            className={`feed-tab-btn ${activeTab === "my-posts" || activeTab === "explore" ? "active" : ""}`}
            onClick={() => handleTabChange("my-posts")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <span>POSTS</span>
          </button>

          <button
            type="button"
            className={`feed-tab-btn ${activeTab === "following" ? "active" : ""}`}
            onClick={() => handleTabChange("following")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span>FOLLOWING</span>
          </button>
        </div>
        {/* Empty States for My Posts & Following */}
        {currentUser && activeTab === "my-posts" && filteredPosts.length === 0 && !isLoading ? (
          <div className="my-posts-empty-state">
            <div className="my-posts-empty-icon">📷</div>
            <h3>No Posts Yet</h3>
            <p>When you share photos and carousels, they will appear right here on your personal profile feed.</p>
            <button
              type="button"
              className="create-first-post-btn"
              onClick={() => window.dispatchEvent(new CustomEvent("open-create-modal"))}
            >
              + Create Your First Post
            </button>
          </div>
        ) : currentUser && activeTab === "following" && filteredPosts.length === 0 && !isLoading ? (
          <div className="my-posts-empty-state">
            <div className="my-posts-empty-icon">👥</div>
            <h3>Your Following Feed is Empty</h3>
            <p>You are not following anyone yet. Explore trending creators in the Default Community Feed to see their latest posts here!</p>
            <button
              type="button"
              className="create-first-post-btn"
              onClick={() => handleTabChange("explore")}
            >
              Explore Default Community Feed
            </button>
          </div>
        ) : (
          <PostGrid 
            posts={filteredPosts} 
            isLoading={isLoading} 
            hasMore={hasMore} 
            onPostClick={handlePostClick} 
            sentinelRef={sentinelRef} 
            error={errorMessage} 
            onRetry={() => loadPosts(null)} 
          /> 
        )}
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
          onPostUpdated={handlePostUpdated}
          onPostDeleted={handlePostDeleted}
        /> 
      )} 
    </div> 
  ); 
} 
 
export default App; 