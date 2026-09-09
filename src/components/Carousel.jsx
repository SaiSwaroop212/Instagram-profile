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

  if (!carouselPosts || carouselPosts.length === 0) {
    return null;
  }

  const totalPosts = carouselPosts.length;

  // Current image changes when we move to next/previous
  const currentPost =
    carouselPosts[currentIndex] || carouselPosts[0];

  // ONE POST'S DETAILS
  // These details stay the same for all 3 images
  const postDetails = carouselPosts[0];

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

  const isBookmarked = Boolean(bookmarks[postDetails.id]);

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

  // Bookmark belongs to the ONE POST
  const handleBookmark = (e) => {
    e.stopPropagation();
    onToggleBookmark(postDetails.id);
  };

  const handleCommentIconClick = (e) => {
    e.stopPropagation();

    if (commentInputRef.current) {
      commentInputRef.current.focus();
    }
  };

  const handleShare = (e) => {
    e.stopPropagation();
    console.log("Share clicked for post:", postDetails.id);
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

          {/* 1. HEADER */}
          {/* Same header for all 3 images */}
          <header className="carousel-header">

            <div className="carousel-user-info">

              <img
                src={postDetails.profileImage}
                alt={postDetails.username}
                className="carousel-profile-img"
              />

              <div className="carousel-user-details">

                <span className="carousel-username">
                  {postDetails.username}
                </span>

                <span className="carousel-category">
                  {postDetails.category}
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


          {/* 2. IMAGE SECTION */}
          {/* ONLY THE IMAGE changes */}
          <div className="carousel-image-section">

            <button
              type="button"
              className="carousel-prev"
              onClick={handlePrev}
              aria-label="Previous image"
            >
              ‹
            </button>

            <div className="carousel-image-wrapper">

              <img
                className="carousel-image"
                src={currentPost.imageUrl}
                alt={
                  postDetails.caption ||
                  postDetails.title
                }
              />

              <div
                className="carousel-counter"
                aria-label={`Image ${
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
              aria-label="Next image"
            >
              ›
            </button>

          </div>


          {/* 3. ACTIONS */}
          <div className="carousel-actions">

            <div className="carousel-actions-left">

              {/* ONE SHARED LIKE FOR ALL 3 IMAGES */}
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

              {/* ONE BOOKMARK FOR THE WHOLE POST */}
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


          {/* 4. CAROUSEL DOTS */}
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
                aria-label={`Go to image ${
                  index + 1
                }`}
                role="tab"
                aria-selected={
                  index === currentIndex
                }
              />

            ))}

          </div>


          {/* 5. POST INFORMATION */}
          {/* SAME INFORMATION FOR ALL 3 IMAGES */}
          <div className="carousel-post-info">

            <div className="carousel-caption-row">

              <span className="carousel-caption-username">
                {postDetails.username}
              </span>

              <span className="carousel-caption-text">
                {postDetails.caption}
              </span>

            </div>


            {postDetails.hashtags && (
              <p className="carousel-hashtags">
                {postDetails.hashtags}
              </p>
            )}


            <time className="carousel-timestamp">
              {postDetails.timestamp}
            </time>

          </div>


          {/* 6. COMMENT INPUT */}
          <CommentBox
            inputRef={commentInputRef}
            onAddComment={(text) =>
              onAddComment &&
              onAddComment(
                postDetails.id,
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