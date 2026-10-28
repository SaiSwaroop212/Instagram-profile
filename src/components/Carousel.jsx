import React, { useState, useEffect, useRef } from "react";
import CommentBox from "./CommentBox";
import {
  fetchReplies,
  followUser,
  unfollowUser,
  checkIsFollowing,
  getStoredUser,
  toggleLike,
  updatePost,
  deletePost,
} from "../services/api";

export function Carousel({
  carouselPosts,
  onClose,
  isLiked,
  onToggleLike,
  comments,
  onAddComment,
  bookmarks,
  onToggleBookmark,
  onPostUpdated,
  onPostDeleted,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dbReplies, setDbReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [followStatus, setFollowStatus] = useState("none"); // "none" | "pending" | "accepted"
  const [followLoading, setFollowLoading] = useState(false);
  const isFollowing = followStatus === "accepted";
  const isRequested = followStatus === "pending";
  const commentInputRef = useRef(null);

  if (!carouselPosts || carouselPosts.length === 0) {
    return null;
  }

  const postDetails = carouselPosts[0];

  // If this specific post has multiple media items (up to 4), slide through its images!
  const hasPostMedia = Boolean(postDetails?.media && postDetails.media.length > 0);
  const mediaList = hasPostMedia
    ? postDetails.media.map((m) => m.largeUrl || m.smallUrl)
    : carouselPosts.map((p) => p.imageUrl);

  const totalImages = mediaList.length;
  const currentPost = carouselPosts[currentIndex] || carouselPosts[0];
  const currentImageUrl = mediaList[currentIndex] || mediaList[0] || currentPost.imageUrl;

  useEffect(() => {
    setCurrentIndex(0);
  }, [postDetails?.id]);

  const [likesCount, setLikesCount] = useState(postDetails?.likeCount ?? 0);
  const [isLikedState, setIsLikedState] = useState(Boolean(postDetails?.likedByViewer || isLiked));

  // Edit post state
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(postDetails?.caption || "");
  const [currentCaption, setCurrentCaption] = useState(postDetails?.caption || "");
  const [currentVersion, setCurrentVersion] = useState(postDetails?.version ?? 1);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    setLikesCount(postDetails?.likeCount ?? 0);
    setIsLikedState(Boolean(postDetails?.likedByViewer || isLiked));
    setCurrentCaption(postDetails?.caption || "");
    setEditText(postDetails?.caption || "");
    setCurrentVersion(postDetails?.version ?? 1);
    setIsEditing(false);
    setEditError("");
  }, [postDetails?.id, postDetails?.likeCount, postDetails?.likedByViewer, postDetails?.caption, postDetails?.version, isLiked]);

  // Load existing replies from PostgreSQL
  useEffect(() => {
    if (!postDetails?.id) return;
    let isCancelled = false;
    setLoadingReplies(true);

    fetchReplies(postDetails.id)
      .then((res) => {
        if (!isCancelled && res?.items) {
          setDbReplies(res.items);
        }
      })
      .catch((err) => console.error("Error loading replies:", err))
      .finally(() => {
        if (!isCancelled) setLoadingReplies(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [postDetails?.id]);

  const currentUser = getStoredUser();
  const isSelf = Boolean(
    currentUser &&
      (currentUser.id === postDetails?.authorId ||
        currentUser.handle?.toLowerCase() === postDetails?.username?.toLowerCase())
  );

  // Load follow status for this post's author from PostgreSQL
  useEffect(() => {
    if (!postDetails?.username || isSelf) return;
    let isCancelled = false;

    checkIsFollowing(postDetails.username)
      .then((res) => {
        if (!isCancelled) {
          const status = res?.status || (res?.following ? "accepted" : "none");
          setFollowStatus(status);
        }
      })
      .catch((err) => console.error("Error checking follow status:", err));

    return () => {
      isCancelled = true;
    };
  }, [postDetails?.username, isSelf]);

  // Listen to follow updates from elsewhere
  useEffect(() => {
    const handleFollowUpdated = (e) => {
      if (
        e.detail?.targetId &&
        (e.detail.targetId === postDetails?.authorId ||
          e.detail.targetId?.toLowerCase() === postDetails?.username?.toLowerCase())
      ) {
        setFollowStatus(e.detail.status || (e.detail.following ? "accepted" : "none"));
      }
    };
    window.addEventListener("follow-updated", handleFollowUpdated);
    return () => window.removeEventListener("follow-updated", handleFollowUpdated);
  }, [postDetails?.authorId, postDetails?.username]);

  // Toggle follow/unfollow in PostgreSQL
  const handleToggleFollow = async (e) => {
    if (e) e.stopPropagation();
    if (followLoading || !postDetails?.username || isSelf) return;

    const prevStatus = followStatus;
    const isActivelyFollowing = prevStatus === "accepted" || prevStatus === "pending";
    setFollowLoading(true);

    try {
      if (!isActivelyFollowing) {
        const res = await followUser(postDetails.username);
        const resolved = res?.status || (res?.following ? "accepted" : "pending");
        setFollowStatus(resolved);
        window.dispatchEvent(
          new CustomEvent("follow-updated", {
            detail: {
              targetId: postDetails.authorId || postDetails.username,
              status: resolved,
              following: resolved === "accepted",
            },
          })
        );
      } else {
        await unfollowUser(postDetails.username);
        setFollowStatus("none");
        window.dispatchEvent(
          new CustomEvent("follow-updated", {
            detail: {
              targetId: postDetails.authorId || postDetails.username,
              status: "none",
              following: false,
            },
          })
        );
      }
    } catch (err) {
      console.error("Failed to update follow state:", err);
      setFollowStatus(prevStatus); // Rollback on failure
    } finally {
      setFollowLoading(false);
    }
  };

  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editText.trim() || isUpdating) return;

    setIsUpdating(true);
    setEditError("");

    try {
      const updated = await updatePost(postDetails.id, editText.trim(), currentVersion);
      setCurrentCaption(updated.caption);
      setCurrentVersion(updated.version ?? (currentVersion + 1));
      setIsEditing(false);
      if (onPostUpdated) {
        onPostUpdated({
          ...postDetails,
          caption: updated.caption,
          text: updated.caption,
          version: updated.version,
        });
      }
    } catch (err) {
      if (err.message && err.message.includes("409")) {
        setEditError("Conflict: This post was modified in another session. Please refresh and try again.");
      } else {
        setEditError(err.message || "Failed to update post");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeletePost = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this post? This cannot be undone."
    );
    if (!confirmed) return;

    try {
      await deletePost(postDetails.id);
      if (onPostDeleted) {
        onPostDeleted(postDetails.id);
      } else {
        onClose();
      }
    } catch (err) {
      alert(`Failed to delete post: ${err.message}`);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        setCurrentIndex(
          (prev) => (prev - 1 + totalImages) % totalImages
        );
      } else if (e.key === "ArrowRight") {
        setCurrentIndex(
          (prev) => (prev + 1) % totalImages
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [totalImages, onClose]);

  const isBookmarked = Boolean(bookmarks[postDetails.id]);

  const handlePrev = (e) => {
    if (e) e.stopPropagation();

    setCurrentIndex(
      (prev) => (prev - 1 + totalImages) % totalImages
    );
  };

  const handleNext = (e) => {
    if (e) e.stopPropagation();

    setCurrentIndex(
      (prev) => (prev + 1) % totalImages
    );
  };

  // ONE shared Like for the whole carousel
  const handleLike = async (e) => {
    e.stopPropagation();
    const nextLiked = !isLikedState;
    const nextCount = nextLiked ? likesCount + 1 : Math.max(0, likesCount - 1);

    setIsLikedState(nextLiked);
    setLikesCount(nextCount);

    try {
      await toggleLike(postDetails.id, !nextLiked);
      if (onToggleLike) {
        onToggleLike(postDetails.id, nextLiked, nextCount);
      }
    } catch (err) {
      console.error("Failed to toggle like:", err);
      // Rollback on failure
      setIsLikedState(!nextLiked);
      setLikesCount(likesCount);
    }
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
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "https://picsum.photos/seed/user50/150/150";
                }}
              />

              <div className="carousel-user-details">

                <div className="carousel-user-header-row">
                  <span className="carousel-username">
                    {postDetails.username}
                  </span>

                  {!isSelf ? (
                    <>
                      <span className="carousel-user-dot">•</span>
                      <button
                        type="button"
                        className={`carousel-follow-btn ${
                          isFollowing ? "following" : isRequested ? "requested" : ""
                        }`}
                        onClick={handleToggleFollow}
                        disabled={followLoading}
                        aria-label={
                          isFollowing
                            ? "Unfollow user"
                            : isRequested
                            ? "Cancel follow request"
                            : "Follow user"
                        }
                        title={
                          isRequested
                            ? "Follow request sent. Click to cancel."
                            : isFollowing
                            ? "Following. Click to unfollow."
                            : "Click to follow"
                        }
                      >
                        {followLoading
                          ? "..."
                          : isFollowing
                          ? "Following"
                          : isRequested
                          ? "Requested"
                          : "Follow"}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="carousel-user-dot">•</span>
                      <button
                        type="button"
                        className="carousel-owner-edit-btn"
                        onClick={() => {
                          setEditText(currentCaption);
                          setIsEditing(!isEditing);
                        }}
                        aria-label="Edit post"
                        title="Edit post"
                      >
                        {isEditing ? "Cancel" : "Edit"}
                      </button>
                      <button
                        type="button"
                        className="carousel-owner-delete-btn"
                        onClick={handleDeletePost}
                        aria-label="Delete post"
                        title="Delete post"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>

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
          <div className="carousel-image-section">

            {totalImages > 1 && (
              <button
                type="button"
                className="carousel-prev"
                onClick={handlePrev}
                aria-label="Previous image"
              >
                ‹
              </button>
            )}

            <div className="carousel-image-wrapper">

              <img
                className="carousel-image"
                src={currentImageUrl}
                alt={
                  postDetails.caption ||
                  postDetails.title
                }
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  const seed = (currentPost.id || "").replace(/[^0-9]/g, "").slice(-4) || "200";
                  e.currentTarget.src = `https://picsum.photos/seed/post${seed}/800/800`;
                }}
              />

              {totalImages > 1 && (
                <div
                  className="carousel-counter"
                  aria-label={`Image ${
                    currentIndex + 1
                  } of ${totalImages}`}
                >
                  {currentIndex + 1}/{totalImages}
                </div>
              )}

            </div>

            {totalImages > 1 && (
              <button
                type="button"
                className="carousel-next"
                onClick={handleNext}
                aria-label="Next image"
              >
                ›
              </button>
            )}

          </div>


          {/* 3. ACTIONS */}
          <div className="carousel-actions">

            <div className="carousel-actions-left">

              {/* ONE SHARED LIKE FOR ALL 3 IMAGES */}
              <button
                type="button"
                className={`carousel-like ${
                  isLikedState ? "liked" : ""
                }`}
                onClick={handleLike}
                aria-label={
                  isLikedState ? "Unlike" : "Like"
                }
              >
                {isLikedState ? "♥" : "♡"}
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
          {totalImages > 1 && (
            <div
              className="carousel-dots"
              role="tablist"
              aria-label="Carousel navigation dots"
            >
              {mediaList.map((_, index) => (
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
          )}


          {/* 5. POST INFORMATION */}
          {/* SAME INFORMATION FOR ALL 3 IMAGES */}
          <div className="carousel-post-info">

            <div className="carousel-likes-count">
              <strong>{likesCount} {likesCount === 1 ? "like" : "likes"}</strong>
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveEdit} className="carousel-inline-edit-form">
                {editError && <div className="auth-error-banner">{editError}</div>}
                <textarea
                  className="carousel-edit-textarea"
                  value={editText}
                  maxLength={280}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  required
                  autoFocus
                />
                <div className="carousel-edit-controls">
                  <span className="carousel-edit-counter">{editText.length}/280</span>
                  <div className="carousel-edit-btn-group">
                    <button
                      type="button"
                      className="carousel-edit-cancel-btn"
                      onClick={() => {
                        setIsEditing(false);
                        setEditText(currentCaption);
                        setEditError("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="carousel-edit-save-btn"
                      disabled={!editText.trim() || isUpdating}
                    >
                      {isUpdating ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="carousel-caption-row">
                <span className="carousel-caption-username">
                  {postDetails.username}
                </span>

                <span className="carousel-caption-text">
                  {currentCaption}
                </span>

                {isSelf && (
                  <button
                    type="button"
                    className="carousel-caption-edit-link"
                    onClick={() => {
                      setEditText(currentCaption);
                      setIsEditing(true);
                    }}
                    title="Edit caption"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}


            {postDetails.hashtags && (
              <p className="carousel-hashtags">
                {postDetails.hashtags}
              </p>
            )}


            <time className="carousel-timestamp">
              {postDetails.timestamp}
            </time>

          </div>


          {/* 6. COMMENTS LIST */}
          <div className="carousel-comments-list">
            {loadingReplies && dbReplies.length === 0 && (
              <div className="carousel-no-comments">Loading comments...</div>
            )}

            {/* Existing replies from PostgreSQL */}
            {dbReplies.map((reply) => (
              <div key={reply.id} className="carousel-comment-item">
                <img
                  src={reply.profileImage}
                  alt={reply.username}
                  className="carousel-comment-avatar"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "https://picsum.photos/seed/user50/50/50";
                  }}
                />
                <div className="carousel-comment-content">
                  <span className="carousel-comment-username">
                    {reply.username}
                  </span>
                  <span className="carousel-comment-text">
                    {reply.caption}
                  </span>
                  <div className="carousel-comment-meta">
                    {reply.timestamp || "Recently"}
                  </div>
                </div>
              </div>
            ))}

            {/* Local comments posted in this session */}
            {(comments[postDetails.id] || []).map((text, idx) => (
              <div key={`local-${idx}`} className="carousel-comment-item">
                <img
                  src="https://picsum.photos/seed/you50/50/50"
                  alt="You"
                  className="carousel-comment-avatar"
                />
                <div className="carousel-comment-content">
                  <span className="carousel-comment-username">
                    you
                  </span>
                  <span className="carousel-comment-text">
                    {text}
                  </span>
                  <div className="carousel-comment-meta">
                    Just now
                  </div>
                </div>
              </div>
            ))}

            {!loadingReplies &&
              dbReplies.length === 0 &&
              (!comments[postDetails.id] || comments[postDetails.id].length === 0) && (
                <div className="carousel-no-comments">
                  No comments yet. Be the first to comment!
                </div>
              )}
          </div>


          {/* 7. COMMENT INPUT */}
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