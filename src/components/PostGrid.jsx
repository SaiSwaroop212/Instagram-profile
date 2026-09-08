import React from "react";
import PostCard from "./PostCard";
import LoadingSkeleton from "./LoadingSkeleton";

export function PostGrid({
  posts,
  isLoading,
  hasMore,
  onPostClick,
  sentinelRef
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

      {posts.length === 0 && !isLoading && (
        <div className="no-posts-message">
          <p>No posts found</p>
        </div>
      )}

      {/* Sentinel element for infinite scrolling */}
      <div
        id="scroll-sentinel"
        ref={sentinelRef}
        aria-hidden="true"
      />
    </>
  );
}

export default PostGrid;
