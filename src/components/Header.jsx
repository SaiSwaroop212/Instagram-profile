import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  getStoredUser,
  fetchUnreadCount,
  fetchNotifications,
  markAllNotificationsRead,
  loginUser,
  registerUser,
  logoutUser,
  deactivateCurrentUser,
  createPost,
  searchUsers,
  followUser,
  unfollowUser,
  acceptFollowRequest,
  rejectFollowRequest,
  fetchSessions,
  revokeSession,
} from "../services/api";

export function Header({ searchTerm, onSearchChange, onUserChange, onPostCreated }) {
  const [currentUser, setCurrentUser] = useState(getStoredUser());
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPostText, setNewPostText] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTextOnlyMode, setIsTextOnlyMode] = useState(false);
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [createPostError, setCreatePostError] = useState("");
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [handleInput, setHandleInput] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("Password123!");
  const [isPrivateInput, setIsPrivateInput] = useState(false);
  const [authError, setAuthError] = useState("");
  const [sessions, setSessions] = useState([]);

  // User search & follow dropdown state
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchedUsers, setSearchedUsers] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [followingMap, setFollowingMap] = useState({});

  const notifRef = useRef(null);
  const fileInputRef = useRef(null);
  const searchDropdownRef = useRef(null);

  // Sync user and poll notifications/unread count
  useEffect(() => {
    const user = getStoredUser();
    setCurrentUser(user);

    const handleUserUpdated = (e) => {
      if (e.detail) setCurrentUser(e.detail);
      else setCurrentUser(getStoredUser());
    };
    window.addEventListener("user-updated", handleUserUpdated);
    return () => window.removeEventListener("user-updated", handleUserUpdated);
  }, []);

  useEffect(() => {
    const refreshData = () => {
      fetchUnreadCount()
        .then((res) => setUnreadCount(res.unreadCount || 0))
        .catch(() => {});

      if (showNotifications) {
        fetchNotifications()
          .then((res) => setNotifications(res.items || []))
          .catch(() => {});
      }
    };

    refreshData();
    const interval = setInterval(refreshData, showNotifications ? 4000 : 10000);
    return () => clearInterval(interval);
  }, [showNotifications, currentUser?.id]);

  // Close dropdown on click outside
  // Close notification or search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch users for search dropdown
  const fetchUsers = useCallback(async (query) => {
    setIsSearchingUsers(true);
    try {
      const users = await searchUsers(query, 8);
      setSearchedUsers(users);
      const map = {};
      users.forEach((u) => {
        map[u.id] =
          u.followStatus ||
          (u.isFollowing ? "accepted" : u.isRequested ? "pending" : "none");
      });
      setFollowingMap((prev) => ({ ...prev, ...map }));
    } catch (err) {
      console.warn("User search failed:", err);
    } finally {
      setIsSearchingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (showSearchDropdown) {
      fetchUsers(searchTerm);
    }
  }, [searchTerm, showSearchDropdown, fetchUsers]);

  // Sync follow state updates globally
  useEffect(() => {
    const handleFollowUpdated = (e) => {
      if (e.detail?.targetId) {
        setFollowingMap((prev) => ({
          ...prev,
          [e.detail.targetId]:
            e.detail.status || (e.detail.following ? "accepted" : "none"),
        }));
      }
    };
    window.addEventListener("follow-updated", handleFollowUpdated);
    return () => window.removeEventListener("follow-updated", handleFollowUpdated);
  }, []);

  const handleToggleFollow = async (e, targetUser) => {
    e.stopPropagation();
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }
    const currentStatus = followingMap[targetUser.id] || "none";
    const isActivelyFollowing = currentStatus === "accepted" || currentStatus === "pending";

    const optimisticNextStatus = isActivelyFollowing
      ? "none"
      : targetUser.isPrivate
      ? "pending"
      : "accepted";

    setFollowingMap((prev) => ({ ...prev, [targetUser.id]: optimisticNextStatus }));

    try {
      if (!isActivelyFollowing) {
        const res = await followUser(targetUser.id);
        const resolved =
          res?.status ||
          (res?.following ? "accepted" : targetUser.isPrivate ? "pending" : "accepted");
        setFollowingMap((prev) => ({ ...prev, [targetUser.id]: resolved }));
        window.dispatchEvent(
          new CustomEvent("follow-updated", {
            detail: {
              targetId: targetUser.id,
              status: resolved,
              following: resolved === "accepted",
            },
          })
        );
      } else {
        await unfollowUser(targetUser.id);
        setFollowingMap((prev) => ({ ...prev, [targetUser.id]: "none" }));
        window.dispatchEvent(
          new CustomEvent("follow-updated", {
            detail: { targetId: targetUser.id, status: "none", following: false },
          })
        );
      }
    } catch (err) {
      setFollowingMap((prev) => ({ ...prev, [targetUser.id]: currentStatus }));
      alert(`Could not update follow status: ${err.message}`);
    }
  };

  const handleAcceptRequest = async (e, notif) => {
    e.stopPropagation();
    try {
      const actorId = notif.actor?.id || notif.actorId;
      await acceptFollowRequest(actorId);
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      window.dispatchEvent(
        new CustomEvent("follow-updated", {
          detail: { targetId: actorId, status: "accepted", following: true },
        })
      );
    } catch (err) {
      console.error("Failed to accept follow request:", err);
      alert(`Could not accept follow request: ${err.message}`);
    }
  };

  const handleRejectRequest = async (e, notif) => {
    e.stopPropagation();
    try {
      const actorId = notif.actor?.id || notif.actorId;
      await rejectFollowRequest(actorId);
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      window.dispatchEvent(
        new CustomEvent("follow-updated", {
          detail: { targetId: actorId, status: "rejected", following: false },
        })
      );
    } catch (err) {
      console.error("Failed to reject follow request:", err);
      alert(`Could not reject follow request: ${err.message}`);
    }
  };

  useEffect(() => {
    const handleOpenAuth = () => setShowAuthModal(true);
    const handleOpenCreate = () => {
      if (!currentUser) {
        setShowAuthModal(true);
      } else {
        setShowCreateModal(true);
      }
    };

    window.addEventListener("open-auth-modal", handleOpenAuth);
    window.addEventListener("open-create-modal", handleOpenCreate);

    return () => {
      window.removeEventListener("open-auth-modal", handleOpenAuth);
      window.removeEventListener("open-create-modal", handleOpenCreate);
    };
  }, [currentUser]);

  const handleOpenNotifications = async () => {
    const nextState = !showNotifications;
    setShowNotifications(nextState);
    if (nextState) {
      try {
        const res = await fetchNotifications();
        setNotifications(res.items || []);
      } catch (err) {
        console.error("Failed to fetch notifications:", err);
      }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: new Date().toISOString() }))
      );
    } catch (err) {
      console.error("Failed to mark read:", err);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      let res;
      if (authMode === "login") {
        res = await loginUser(handleInput.trim(), passwordInput);
      } else {
        res = await registerUser({
          handle: handleInput.trim(),
          displayName: displayNameInput.trim() || handleInput.trim(),
          password: passwordInput,
          isPrivate: isPrivateInput,
        });
      }
      setCurrentUser(res.user);
      setShowAuthModal(false);
      if (onUserChange) onUserChange(res.user);
    } catch (err) {
      setAuthError(err.message || "Authentication failed");
    }
  };

  const handleSwitchToDemoUser = async (demoHandle) => {
    setAuthError("");
    try {
      const res = await loginUser(demoHandle, "Password123!");
      setCurrentUser(res.user);
      setShowAuthModal(false);
      if (onUserChange) onUserChange(res.user);
    } catch (err) {
      setAuthError(`Demo user login failed: ${err.message}`);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setUnreadCount(0);
    setNotifications([]);
    if (onUserChange) onUserChange(null);
  };

  const handleDeactivate = async () => {
    if (!currentUser) return;
    const confirmed = window.confirm(
      `Are you sure you want to deactivate @${currentUser.handle}?\n\n• Your profile will be hidden.\n• Your posts and likes will be removed from feeds.\n• You will be logged out immediately.`
    );
    if (!confirmed) return;

    try {
      await deactivateCurrentUser();
      const deactivatedHandle = currentUser.handle;
      setCurrentUser(null);
      setUnreadCount(0);
      setNotifications([]);
      setShowAuthModal(false);
      if (onUserChange) onUserChange(null);
      alert(`Account @${deactivatedHandle} has been successfully deactivated.`);
      window.location.reload();
    } catch (err) {
      alert(`Deactivation failed: ${err.message}`);
    }
  };

  useEffect(() => {
    if (showAuthModal && currentUser) {
      fetchSessions()
        .then((res) => setSessions(res.sessions || []))
        .catch(() => {});
    }
  }, [showAuthModal, currentUser]);

  const handleRevokeSession = async (sessionId) => {
    try {
      await revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      alert(`Could not log out device: ${err.message}`);
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) processFiles(files);
    if (e.target) e.target.value = "";
  };

  const compressFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_DIM = 1080;
          let width = img.width;
          let height = img.height;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = reject;
        img.src = loadEvent.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processFiles = (files) => {
    const validFiles = files.filter((f) => f.type.startsWith("image/"));
    if (validFiles.length === 0) {
      setCreatePostError("Please select valid image files (JPEG, PNG, WebP).");
      return;
    }
    setCreatePostError("");

    const remainingSlots = 4 - selectedImages.length;
    if (remainingSlots <= 0) {
      setCreatePostError("You can upload a maximum of 4 photos per post.");
      return;
    }

    const filesToProcess = validFiles.slice(0, remainingSlots);
    if (validFiles.length > remainingSlots) {
      setCreatePostError(`Maximum 4 photos allowed per post. Processed first ${remainingSlots} photo(s).`);
    }

    Promise.all(filesToProcess.map(compressFile))
      .then((newImages) => {
        setSelectedImages((prev) => {
          const combined = [...prev, ...newImages].slice(0, 4);
          setPreviewIndex(prev.length); // focus on first newly added image
          return combined;
        });
        setIsTextOnlyMode(false);
      })
      .catch((err) => {
        setCreatePostError("Failed to process images: " + err.message);
      });
  };

  const handleRemoveImage = (indexToRemove) => {
    setSelectedImages((prev) => {
      const updated = prev.filter((_, idx) => idx !== indexToRemove);
      if (previewIndex >= updated.length) {
        setPreviewIndex(Math.max(0, updated.length - 1));
      }
      return updated;
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) processFiles(files);
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setSelectedImages([]);
    setPreviewIndex(0);
    setNewPostText("");
    setCreatePostError("");
    setIsDragging(false);
    setIsTextOnlyMode(false);
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (isCreatingPost) return;

    const caption = newPostText.trim() || (selectedImages.length > 0 ? "Shared photos" : "");
    if (!caption && selectedImages.length === 0) {
      setCreatePostError("Please choose at least one photo or enter a caption.");
      return;
    }

    setIsCreatingPost(true);
    setCreatePostError("");

    try {
      const media = selectedImages.map((dataUrl, idx) => ({
        largeUrl: dataUrl,
        smallUrl: dataUrl,
        altText: `${caption.slice(0, 40) || "Post photo"} - photo ${idx + 1}`,
      }));

      const created = await createPost({
        text: caption,
        media,
      });

      handleCloseCreateModal();
      if (onPostCreated) {
        onPostCreated(created);
      }
    } catch (err) {
      setCreatePostError(err.message || "Failed to create post");
    } finally {
      setIsCreatingPost(false);
    }
  };

  return (
    <header className="page-header">
      <div className="header-left">
        <h1 className="instagram-logo">Instagram</h1>
      </div>

      <div className="header-center" ref={searchDropdownRef}>
        <div className="search-input-wrapper">
          <svg className="search-glass-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="search"
            id="searchInput"
            className="search-bar"
            placeholder="Search users or posts..."
            aria-label="Search users or posts"
            value={searchTerm}
            onFocus={() => setShowSearchDropdown(true)}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setShowSearchDropdown(true);
            }}
          />
          {searchTerm && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => onSearchChange("")}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Live Search Users & Creators Dropdown */}
        {showSearchDropdown && (
          <div className="search-results-dropdown">
            <div className="search-dropdown-header">
              <span className="search-dropdown-title">
                {searchTerm.trim() ? "Users & Creators" : "Suggested Creators to Follow"}
              </span>
              {isSearchingUsers && <span className="search-loading-text">Searching...</span>}
            </div>

            <div className="search-dropdown-list">
              {searchedUsers.length === 0 && !isSearchingUsers ? (
                <div className="search-empty-users">
                  No users found for "{searchTerm}".
                </div>
              ) : (
                searchedUsers.map((userItem) => {
                  const userStatus =
                    followingMap[userItem.id] ||
                    userItem.followStatus ||
                    (userItem.isFollowing ? "accepted" : userItem.isRequested ? "pending" : "none");
                  const isAccepted = userStatus === "accepted";
                  const isPending = userStatus === "pending";
                  const avatar =
                    userItem.avatar?.smallUrl ||
                    userItem.avatarSmallUrl ||
                    `https://picsum.photos/seed/${userItem.handle}/100/100`;

                  return (
                    <div key={userItem.id} className="search-user-item">
                      <img
                        src={avatar}
                        alt={userItem.handle}
                        className="search-user-avatar"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "https://picsum.photos/seed/user50/100/100";
                        }}
                      />
                      <div className="search-user-info">
                        <div className="search-user-handle-row">
                          <strong className="search-user-handle">@{userItem.handle}</strong>
                          {userItem.isPrivate && (
                            <span className="search-private-badge" title="Private Account">🔒</span>
                          )}
                        </div>
                        <span className="search-user-name">
                          {userItem.displayName || userItem.handle}
                        </span>
                        {userItem.bio && (
                          <p className="search-user-bio-snippet">
                            {userItem.bio}
                          </p>
                        )}
                      </div>

                      {currentUser?.id !== userItem.id && (
                        <button
                          type="button"
                          className={`search-follow-btn ${
                            isAccepted ? "following" : isPending ? "requested" : ""
                          }`}
                          onClick={(e) => handleToggleFollow(e, userItem)}
                          title={
                            isPending
                              ? "Follow request pending. Click to cancel request."
                              : isAccepted
                              ? "Following. Click to unfollow."
                              : "Click to follow"
                          }
                        >
                          {isAccepted ? "Following" : isPending ? "Requested" : "Follow"}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      <div className="header-right">
        {/* Create Post Button */}
        {currentUser && (
          <button
            type="button"
            className="header-icon-btn create-post-trigger-btn"
            onClick={() => {
              setCreatePostError("");
              setShowCreateModal(true);
            }}
            aria-label="Create Post"
            title="Create New Post"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>
        )}

        {/* Notification Bell */}
        <div className="notification-wrapper" ref={notifRef}>
          <button
            type="button"
            className="header-icon-btn"
            onClick={handleOpenNotifications}
            aria-label="Notifications"
            title="Notifications"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="notification-badge">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="notification-dropdown">
              <div className="notification-dropdown-header">
                <span className="notif-title">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="notif-mark-read-btn"
                    onClick={handleMarkAllRead}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="notification-list">
                {notifications.length === 0 ? (
                  <div className="notif-empty">No notifications yet</div>
                ) : (
                  notifications.map((notif) => {
                    const eventType = notif.eventType || notif.type;
                    const actorHandle = notif.actor?.handle || "user";
                    const avatarUrl =
                      notif.actor?.avatar?.smallUrl ||
                      notif.actor?.avatarSmallUrl ||
                      `https://picsum.photos/seed/${actorHandle}/150/150`;

                    return (
                      <div
                        key={notif.id}
                        className={`notif-item ${!notif.readAt ? "unread" : ""} ${
                          eventType === "follow_request" ? "notif-request-item" : ""
                        }`}
                      >
                        {eventType === "NEW_LOGIN" || eventType === "new_login" ? (
                          <div
                            className="notif-avatar"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "#eff6ff",
                              borderRadius: "50%",
                              fontSize: "16px",
                            }}
                          >
                            🛡️
                          </div>
                        ) : (
                          <img
                            src={avatarUrl}
                            alt={actorHandle}
                            className="notif-avatar"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = `https://picsum.photos/seed/${actorHandle}/150/150`;
                            }}
                          />
                        )}
                        <div className="notif-content">
                          <div className="notif-text-row">
                            {eventType === "NEW_LOGIN" || eventType === "new_login" ? (
                              <span>
                                <strong>Security Alert:</strong> New login from{" "}
                                <strong>{notif.metadata?.browser || "Browser"}</strong> on{" "}
                                <strong>{notif.metadata?.os || "device"}</strong>{" "}
                                ({notif.metadata?.deviceType || "device"})
                              </span>
                            ) : (
                              <>
                                <strong>@{actorHandle}</strong>{" "}
                                {eventType === "follow" && "started following you."}
                                {eventType === "like" && "liked your post."}
                                {eventType === "reply" && "replied to your post."}
                                {eventType === "repost" && "reposted your post."}
                                {eventType === "follow_request" && "requested to follow you."}
                                {!["follow", "like", "reply", "repost", "follow_request"].includes(
                                  eventType
                                ) && "interacted with your profile."}
                              </>
                            )}
                          </div>
                          {eventType === "follow_request" && (
                            <div className="notif-request-actions">
                              <button
                                type="button"
                                className="notif-confirm-btn"
                                onClick={(e) => handleAcceptRequest(e, notif)}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                className="notif-reject-btn"
                                onClick={(e) => handleRejectRequest(e, notif)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                        <span className="notif-time">
                          {new Date(notif.createdAt).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Current User Badge & Switcher */}
        {currentUser ? (
          <div className="user-badge-container">
            <button
              type="button"
              className="user-badge-btn"
              onClick={() => setShowAuthModal(true)}
              title="Click to switch user"
            >
              <img
                src={currentUser.avatarSmallUrl || "/fixtures/asha-48.jpg"}
                alt={currentUser.handle}
                className="header-avatar"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "https://picsum.photos/seed/user50/150/150";
                }}
              />
              <span className="user-badge-handle">@{currentUser.handle}</span>
            </button>
            <button
              type="button"
              className="logout-mini-btn"
              onClick={handleLogout}
              title="Logout"
            >
              Log out
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="login-btn-primary"
            onClick={() => setShowAuthModal(true)}
          >
            Log In
          </button>
        )}
      </div>

      {/* Auth Modal / User Switcher */}
      {showAuthModal && (
        <div className="auth-modal-backdrop" onClick={() => setShowAuthModal(false)}>
          <div
            className="auth-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auth-modal-header">
              <h3>{authMode === "login" ? "Sign In / Switch User" : "Create Account"}</h3>
              <button
                type="button"
                className="auth-modal-close"
                onClick={() => setShowAuthModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Active User Management Section */}
            {currentUser && (
              <div className="current-user-manage-box">
                <div className="manage-user-info">
                  <img
                    src={currentUser.avatarSmallUrl || "/fixtures/asha-48.jpg"}
                    alt={currentUser.handle}
                    className="manage-avatar"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "https://picsum.photos/seed/user50/150/150";
                    }}
                  />
                  <div className="manage-meta">
                    <span className="manage-label">Signed in as</span>
                    <strong className="manage-handle">@{currentUser.handle}</strong>
                  </div>
                </div>
                <div className="manage-user-actions">
                  <button
                    type="button"
                    className="edit-profile-pill-btn"
                    onClick={() => {
                      setShowAuthModal(false);
                      window.dispatchEvent(new CustomEvent("open-edit-profile"));
                    }}
                    title="Edit your bio and profile details"
                  >
                    ✏️ Edit Bio & Profile
                  </button>
                  <button
                    type="button"
                    className="deactivate-pill-btn"
                    onClick={handleDeactivate}
                    title="Deactivate this account"
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            )}

            {/* Active Logged-in Devices Section */}
            {currentUser && sessions.length > 0 && (
              <div
                style={{
                  margin: "12px 16px",
                  padding: "12px",
                  background: "#f9fafb",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  fontSize: "13px",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>💻 Logged-in Devices ({sessions.length})</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    maxHeight: "140px",
                    overflowY: "auto",
                  }}
                >
                  {sessions.map((sess) => (
                    <div
                      key={sess.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#fff",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        border: "1px solid #f3f4f6",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500, color: "#111827" }}>
                          {sess.browser} on {sess.os}
                          {sess.isCurrent && (
                            <span
                              style={{
                                marginLeft: "6px",
                                fontSize: "11px",
                                background: "#dcfce7",
                                color: "#15803d",
                                padding: "1px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              This device
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: "#6b7280" }}>
                          {sess.deviceType} • {new Date(sess.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </div>
                      </div>
                      {!sess.isCurrent && (
                        <button
                          type="button"
                          onClick={() => handleRevokeSession(sess.id)}
                          style={{
                            background: "none",
                            border: "1px solid #ef4444",
                            color: "#ef4444",
                            borderRadius: "4px",
                            padding: "2px 8px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Log out
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Demo Switcher */}
            <div className="demo-accounts-box">
              <span className="demo-accounts-label">Quick switch demo accounts:</span>
              <div className="demo-accounts-chips">
                <button
                  type="button"
                  className="demo-chip"
                  onClick={() => handleSwitchToDemoUser("asha")}
                >
                  @asha
                </button>
                <button
                  type="button"
                  className="demo-chip"
                  onClick={() => handleSwitchToDemoUser("dan_dev")}
                >
                  @dan_dev
                </button>
                <button
                  type="button"
                  className="demo-chip"
                  onClick={() => handleSwitchToDemoUser("elena_r")}
                >
                  @elena_r
                </button>
              </div>
            </div>

            <div className="auth-divider">
              <span>or enter details</span>
            </div>

            <form onSubmit={handleAuthSubmit} className="auth-form">
              {authError && (
                <div className="auth-error-banner">
                  {authError}
                  {authError.toLowerCase().includes("taken") && (
                    <div style={{ marginTop: "4px" }}>
                      Already registered?{" "}
                      <button
                        type="button"
                        style={{ color: "#0095f6", background: "none", border: "none", textDecoration: "underline", cursor: "pointer", fontWeight: 600 }}
                        onClick={() => {
                          setAuthMode("login");
                          setAuthError("");
                        }}
                      >
                        Sign in as @{handleInput}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="form-group">
                <label>
                  Handle / Username{" "}
                  {authMode === "register" && (
                    <span style={{ fontSize: "11px", color: "#8e8e8e", fontWeight: 400 }}>
                      (choose a new unique name)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  required
                  placeholder={authMode === "register" ? "e.g. your_name, alex_99" : "e.g. asha, dan_dev"}
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                />
              </div>

              {authMode === "register" && (
                <div className="form-group">
                  <label>Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alice Smith"
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  required
                  placeholder="Minimum 8 characters"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
              </div>

              {authMode === "register" && (
                <div className="form-group register-privacy-group">
                  <label>Account Privacy</label>
                  <div className="register-privacy-options">
                    <label className={`register-privacy-card ${!isPrivateInput ? "selected" : ""}`}>
                      <input
                        type="radio"
                        name="registerAccountPrivacy"
                        checked={!isPrivateInput}
                        onChange={() => setIsPrivateInput(false)}
                      />
                      <div className="privacy-card-content">
                        <div className="privacy-card-title">
                          <span className="privacy-icon">🌐</span>
                          <strong>Public Account</strong>
                        </div>
                        <p>Anyone can view your photos, posts, and profile.</p>
                      </div>
                    </label>

                    <label className={`register-privacy-card ${isPrivateInput ? "selected" : ""}`}>
                      <input
                        type="radio"
                        name="registerAccountPrivacy"
                        checked={isPrivateInput}
                        onChange={() => setIsPrivateInput(true)}
                      />
                      <div className="privacy-card-content">
                        <div className="privacy-card-title">
                          <span className="privacy-icon">🔒</span>
                          <strong>Private Account</strong>
                        </div>
                        <p>Only approved followers can view your photos and posts.</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <button type="submit" className="auth-submit-btn">
                {authMode === "login" ? "Sign In" : "Register"}
              </button>

              <div className="auth-toggle-mode">
                {authMode === "login" ? (
                  <span>
                    Need an account?{" "}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setAuthMode("register");
                        setAuthError("");
                      }}
                    >
                      Register
                    </button>
                  </span>
                ) : (
                  <span>
                    Have an account?{" "}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setAuthMode("login");
                        setAuthError("");
                      }}
                    >
                      Sign in
                    </button>
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Post Modal */}
      {showCreateModal && (
        <div className="auth-modal-backdrop" onClick={handleCloseCreateModal}>
          <div
            className={`auth-modal-card create-post-modal-card ${
              selectedImages.length > 0 || isTextOnlyMode ? "has-preview" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="create-post-header-bar">
              {(selectedImages.length > 0 || isTextOnlyMode) ? (
                <button
                  type="button"
                  className="create-post-nav-btn"
                  onClick={() => {
                    setSelectedImages([]);
                    setPreviewIndex(0);
                    setIsTextOnlyMode(false);
                  }}
                  title="Start over"
                >
                  ← Back
                </button>
              ) : (
                <div style={{ width: "40px" }} />
              )}

              <h3 className="create-post-title">
                {selectedImages.length > 1
                  ? `Create carousel post (${selectedImages.length} photos)`
                  : "Create new post"}
              </h3>

              {(selectedImages.length > 0 || isTextOnlyMode) ? (
                <button
                  type="button"
                  className="create-post-share-top-btn"
                  onClick={handleCreatePost}
                  disabled={isCreatingPost}
                >
                  {isCreatingPost ? "Sharing..." : "Share"}
                </button>
              ) : (
                <button
                  type="button"
                  className="auth-modal-close"
                  onClick={handleCloseCreateModal}
                >
                  ✕
                </button>
              )}
            </div>

            {createPostError && (
              <div className="auth-error-banner" style={{ margin: "8px 16px 0" }}>
                {createPostError}
              </div>
            )}

            {/* Hidden native file input with multiple selection */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            {/* STEP 1: Select or Drop Image(s) */}
            {selectedImages.length === 0 && !isTextOnlyMode && (
              <div
                className={`create-post-dropzone ${isDragging ? "dragging" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="dropzone-icon-wrap">
                  <svg
                    aria-label="Media icon"
                    color="currentColor"
                    fill="currentColor"
                    height="77"
                    role="img"
                    viewBox="0 0 97.6 77.3"
                    width="96"
                  >
                    <path
                      d="M16.3 24h.3c2.8-.2 4.9-2.6 4.8-5.4-.2-2.8-2.6-4.9-5.4-4.8s-4.9 2.6-4.8 5.4c.1 2.7 2.4 4.8 5.1 4.8zm-2.4-7.2c.5-.6 1.3-1 2.1-1h.2c1.7 0 3.1 1.4 3.1 3.1 0 1.7-1.4 3.1-3.1 3.1-1.7 0-3.1-1.4-3.1-3.1 0-.8.3-1.5.8-2.1z"
                      fill="currentColor"
                    />
                    <path
                      d="M84.7 18.4L58 16.9l-.2-3c-.3-5.7-5.2-10.1-11-9.8L12.9 6c-5.7.3-10.1 5.3-9.8 11L5 51v.8c.7 5.2 5.1 9.1 10.3 9.1h.6l21.7-1.2v.6c-.3 5.7 4 10.5 9.8 10.8l34 2c.2 0 .3 0 .5 0 5.5 0 10.1-4.3 10.4-9.8l2-34c.4-5.8-4-10.6-9.6-10.9zM7.2 51.5l-1.9-34c-.2-4.4 3.2-8.2 7.6-8.5l33.9-1.9c4.4-.2 8.2 3.2 8.5 7.6l.2 3L23.4 16.6c-5.7.3-10.1 5.3-9.8 11l1.8 30.6-5.1.3c-1.8 0-3.1-1.4-3.1-3.1v-3.9zm80.2 16.2l-34-2c-4.4-.3-7.8-4.2-7.6-8.6l2-34c.3-4.4 4.2-7.8 8.6-7.6l34 2c4.4.3 7.8 4.2 7.6 8.6l-2 34c-.3 4.3-4.1 7.6-8.6 7.6z"
                      fill="currentColor"
                    />
                  </svg>
                </div>

                <p className="dropzone-instructions">Drag up to 4 photos here</p>

                <button
                  type="button"
                  className="select-computer-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Select from computer
                </button>

                <div className="dropzone-text-fallback">
                  <span style={{ color: "#8e8e8e", fontSize: "12px" }}>
                    Select 1 to 4 photos for a multi-image carousel post
                  </span>
                  <button
                    type="button"
                    className="link-btn"
                    style={{ fontSize: "13px", marginTop: "8px" }}
                    onClick={() => setIsTextOnlyMode(true)}
                  >
                    or create text-only post
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Preview & Compose Caption */}
            {(selectedImages.length > 0 || isTextOnlyMode) && (
              <form onSubmit={handleCreatePost} className="create-post-composer-layout">
                {/* Left side: Images Preview & Thumbnail Strip */}
                {selectedImages.length > 0 ? (
                  <div className="composer-preview-pane">
                    <div className="composer-main-image-wrap">
                      <img
                        src={selectedImages[previewIndex] || selectedImages[0]}
                        alt={`Upload preview ${previewIndex + 1}`}
                        className="composer-preview-img"
                      />

                      {/* Navigation arrows if multiple images */}
                      {selectedImages.length > 1 && (
                        <>
                          <button
                            type="button"
                            className="composer-img-nav-btn prev"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewIndex((prev) =>
                                (prev - 1 + selectedImages.length) % selectedImages.length
                              );
                            }}
                            title="Previous image"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            className="composer-img-nav-btn next"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewIndex((prev) =>
                                (prev + 1) % selectedImages.length
                              );
                            }}
                            title="Next image"
                          >
                            ›
                          </button>
                          <div className="composer-img-counter-badge">
                            {previewIndex + 1}/{selectedImages.length}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Thumbnail strip for multi-image management */}
                    <div className="composer-thumb-strip">
                      {selectedImages.map((imgUrl, idx) => (
                        <div
                          key={idx}
                          className={`composer-thumb-item ${
                            idx === previewIndex ? "active" : ""
                          }`}
                          onClick={() => setPreviewIndex(idx)}
                          title={`View photo ${idx + 1}`}
                        >
                          <img src={imgUrl} alt={`Thumb ${idx + 1}`} />
                          <button
                            type="button"
                            className="composer-thumb-remove-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveImage(idx);
                            }}
                            title="Remove this photo"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      {/* Add more button if less than 4 */}
                      {selectedImages.length < 4 && (
                        <button
                          type="button"
                          className="composer-thumb-add-btn"
                          onClick={() => fileInputRef.current?.click()}
                          title={`Add another photo (${selectedImages.length}/4)`}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          <span>Add</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="composer-textonly-pane">
                    <button
                      type="button"
                      className="select-computer-btn"
                      style={{ fontSize: "12px", padding: "6px 14px" }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      + Add Photos from Computer
                    </button>
                  </div>
                )}

                {/* Right side: Author, Caption, Hashtags */}
                <div className="composer-details-pane">
                  <div className="create-post-author-row">
                    <img
                      src={currentUser?.avatarSmallUrl || "/fixtures/asha-48.jpg"}
                      alt={currentUser?.handle}
                      className="header-avatar"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "https://picsum.photos/seed/user50/150/150";
                      }}
                    />
                    <div className="create-post-author-info">
                      <strong>@{currentUser?.handle}</strong>
                      <span>{currentUser?.displayName || currentUser?.handle}</span>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: "12px", flex: 1 }}>
                    <textarea
                      className="create-post-textarea"
                      rows={5}
                      maxLength={280}
                      placeholder="Write a caption..."
                      value={newPostText}
                      onChange={(e) => setNewPostText(e.target.value)}
                      autoFocus
                    />
                    <div className="create-post-counter">
                      <span>{newPostText.length}/280 characters</span>
                    </div>
                  </div>

                  {/* Hashtag suggestions chips */}
                  <div className="hashtag-chips-container">
                    <span className="hashtag-chips-label">Quick tags:</span>
                    <div className="hashtag-chips">
                      {["#photography", "#carousel", "#art", "#daily", "#vibe"].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="hashtag-chip"
                          onClick={() => {
                            setNewPostText((prev) =>
                              prev ? `${prev} ${tag}` : tag
                            );
                          }}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="create-post-actions" style={{ marginTop: "16px" }}>
                    <button
                      type="button"
                      className="cancel-btn-subtle"
                      onClick={handleCloseCreateModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="auth-submit-btn"
                      style={{ margin: 0 }}
                      disabled={isCreatingPost || (selectedImages.length === 0 && !newPostText.trim())}
                    >
                      {isCreatingPost ? "Sharing..." : "Share Post"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export default Header;
