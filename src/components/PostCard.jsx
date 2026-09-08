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
      />
    </article>
  );
}

export default PostCard;
