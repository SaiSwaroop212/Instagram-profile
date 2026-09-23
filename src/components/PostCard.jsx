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
    </article>
  );
}

export default PostCard;
