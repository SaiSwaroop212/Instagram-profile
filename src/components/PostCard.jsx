import React from "react";

export function PostCard({ post, onClick }) {
  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick(post);
    }
  };

  return (
    <article
      className="grid-post"
      onClick={() => onClick(post)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View post by ${post.username}`}
    >
      <img
        src={post.imageUrl}
        alt={post.caption || post.title}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = `https://picsum.photos/seed/post${(post.id || '').slice(-4)}/600/600`;
        }}
      />
      {post.media && post.media.length > 1 && (
        <div className="grid-post-carousel-badge" title={`${post.media.length} photos`}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M19 3H8c-1.1 0-2 .9-2 2v1H5c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2v-1h1c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 15H5V8h11v10zm3-3h-1V7c0-.55-.45-1-1-1H8V5h11v10z" />
          </svg>
        </div>
      )}
    </article>
  );
}

export default PostCard;
