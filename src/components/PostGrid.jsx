import React from "react";
import PostCard from "./PostCard";
import LoadingSkeleton from "./LoadingSkeleton";

export function PostGrid({
  posts,
  isLoading,
  hasMore,
  onPostClick,
  sentinelRef,
  error,
  onRetry,
}) {
  return (
    <>
      <section
        className="instagram-grid"
        aria-label="Instagram photo grid"
      >
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onClick={onPostClick}
          />
        ))}

        {isLoading && <LoadingSkeleton count={3} />}
      </section>

      {error && !isLoading && posts.length === 0 && (
        <div className="no-posts-message error-message">
          <p style={{ color: "#ed4956", marginBottom: "12px", fontWeight: "500" }}>{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                padding: "8px 16px",
                background: "#0095f6",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {!error && posts.length === 0 && !isLoading && (
        <div className="no-posts-message">
          <p>No posts found</p>
        </div>
      )}

      {/* Sentinel element for infinite scrolling */}
      <div
        id="scroll-sentinel"
        ref={sentinelRef}
        style={{ height: "20px", width: "100%", pointerEvents: "none" }}
        aria-hidden="true"
      />
    </>
  );
}

export default PostGrid;
