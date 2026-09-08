import React, { useState, useEffect, useRef } from "react";
import CommentBox from "./CommentBox";

export function Carousel({
  carouselPosts,
  onClose,
  isLiked,
  onToggleLike,
  comments,
  onAddComment,
  bookmarks,
  onToggleBookmark
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const commentInputRef = useRef(null);

  const totalPosts = carouselPosts.length;
  const currentPost =
    carouselPosts[currentIndex] || carouselPosts[0];

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        setCurrentIndex(
          (prev) => (prev - 1 + totalPosts) % totalPosts
        );
      } else if (e.key === "ArrowRight") {
        setCurrentIndex(
          (prev) => (prev + 1) % totalPosts
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [totalPosts, onClose]);

  if (!carouselPosts || carouselPosts.length === 0) {
    return null;
  }

  const isBookmarked = Boolean(bookmarks[currentPost.id]);

  const handlePrev = (e) => {
    if (e) e.stopPropagation();

    setCurrentIndex(
      (prev) => (prev - 1 + totalPosts) % totalPosts
    );
  };

  const handleNext = (e) => {
    if (e) e.stopPropagation();

    setCurrentIndex(
      (prev) => (prev + 1) % totalPosts
    );
  };

  // ONE shared Like for the whole carousel
  const handleLike = (e) => {
    e.stopPropagation();
    onToggleLike();
  };

  const handleBookmark = (e) => {
    e.stopPropagation();
    onToggleBookmark(currentPost.id);
  };

  const handleCommentIconClick = (e) => {
    e.stopPropagation();

    if (commentInputRef.current) {
      commentInputRef.current.focus();
    }
  };

  const handleShare = (e) => {
    e.stopPropagation();
    console.log("Share clicked for post:", currentPost.id);
  };

  return (
    <div
      className="carousel"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo carousel modal"
    >
      <div
        className="carousel-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="carousel-post">

          {/* 1. Header */}
          <header className="carousel-header">
            <div className="carousel-user-info">

              <img
                src={currentPost.profileImage}
                alt={currentPost.username}
                className="carousel-profile-img"
              />

              <div className="carousel-user-details">

                <span className="carousel-username">
                  {currentPost.username}
                </span>

                <span className="carousel-category">
                  {currentPost.category}
                </span>

              </div>
            </div>

            <button
              type="button"
              className="carousel-close"
              onClick={onClose}
              aria-label="Close carousel"
            >
              ✕
            </button>
          </header>

          {/* 2. Image section */}
          <div className="carousel-image-section">

            <button
              type="button"
              className="carousel-prev"
              onClick={handlePrev}
              aria-label="Previous post"
            >
              ‹
            </button>

            <div className="carousel-image-wrapper">

              <img
                className="carousel-image"
                src={currentPost.imageUrl}
                alt={
                  currentPost.caption ||
                  currentPost.title
                }
              />

              <div
                className="carousel-counter"
                aria-label={`Post ${
                  currentIndex + 1
                } of ${totalPosts}`}
              >
                {currentIndex + 1}/{totalPosts}
              </div>

            </div>

            <button
              type="button"
              className="carousel-next"
              onClick={handleNext}
              aria-label="Next post"
            >
              ›
            </button>

          </div>

          {/* 3. Actions */}
          <div className="carousel-actions">

            <div className="carousel-actions-left">

              {/* ONE SHARED LIKE FOR ALL 3 POSTS */}
              <button
                type="button"
                className={`carousel-like ${
                  isLiked ? "liked" : ""
                }`}
                onClick={handleLike}
                aria-label={
                  isLiked ? "Unlike" : "Like"
                }
              >
                {isLiked ? "♥" : "♡"}
              </button>

              <button
                type="button"
                className="carousel-comment"
                onClick={handleCommentIconClick}
                aria-label="Comment"
              >
                💬
              </button>

              <button
                type="button"
                className="carousel-share"
                onClick={handleShare}
                aria-label="Share post"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line
                    x1="22"
                    y1="2"
                    x2="11"
                    y2="13"
                  />
                  <polygon
                    points="22 2 15 22 11 13 2 9 22 2"
                  />
                </svg>
              </button>

            </div>

            <div className="carousel-actions-right">

              <button
                type="button"
                className={`carousel-bookmark ${
                  isBookmarked ? "bookmarked" : ""
                }`}
                onClick={handleBookmark}
                aria-label={
                  isBookmarked
                    ? "Remove from saved"
                    : "Save post"
                }
              >

                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill={
                    isBookmarked
                      ? "currentColor"
                      : "none"
                  }
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>

              </button>

            </div>

          </div>

          {/* 4. Carousel dots */}
          <div
            className="carousel-dots"
            role="tablist"
            aria-label="Carousel navigation dots"
          >

            {carouselPosts.map((_, index) => (

              <button
                key={index}
                type="button"
                className={`carousel-dot ${
                  index === currentIndex
                    ? "active"
                    : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(index);
                }}
                aria-label={`Go to slide ${
                  index + 1
                }`}
                role="tab"
                aria-selected={
                  index === currentIndex
                }
              />

            ))}

          </div>

          {/* 5. Post information */}
          <div className="carousel-post-info">

            <div className="carousel-caption-row">

              <span className="carousel-caption-username">
                {currentPost.username}
              </span>

              <span className="carousel-caption-text">
                {currentPost.caption}
              </span>

            </div>

            {currentPost.hashtags && (
              <p className="carousel-hashtags">
                {currentPost.hashtags}
              </p>
            )}

            <time className="carousel-timestamp">
              {currentPost.timestamp}
            </time>

          </div>

          {/* 6. Comment input */}
          <CommentBox
            inputRef={commentInputRef}
            onAddComment={(text) =>
              onAddComment &&
              onAddComment(
                currentPost.id,
                text
              )
            }
          />

        </div>
      </div>
    </div>
  );
}

export default Carousel;