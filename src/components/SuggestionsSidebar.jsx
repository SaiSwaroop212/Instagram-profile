import React, { useState, useEffect } from "react";
import { searchUsers, followUser, unfollowUser, getStoredUser } from "../services/api";

export function SuggestionsSidebar({ onUserSwitch }) {
  const [currentUser, setCurrentUser] = useState(getStoredUser());
  const [suggestions, setSuggestions] = useState([]);
  const [followingMap, setFollowingMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Sync current user if changed
  useEffect(() => {
    const handleStorageChange = () => {
      setCurrentUser(getStoredUser());
    };
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("auth-changed", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("auth-changed", handleStorageChange);
    };
  }, []);

  // Fetch suggested creators
  useEffect(() => {
    let isMounted = true;
    async function loadSuggestions() {
      setLoading(true);
      try {
        const users = await searchUsers("", 8);
        if (!isMounted) return;

        // Exclude current logged in user from suggestions
        const stored = getStoredUser();
        const filtered = users.filter((u) => !stored || (u.id !== stored.id && u.handle !== stored.handle));
        setSuggestions(filtered.slice(0, 5));

        const map = {};
        filtered.forEach((u) => {
          map[u.id] = u.followStatus || (u.isFollowing ? "accepted" : u.isRequested ? "pending" : "none");
        });
        setFollowingMap((prev) => ({ ...prev, ...map }));
      } catch (err) {
        console.warn("Failed to load suggested creators:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadSuggestions();

    const handleFollowUpdated = (e) => {
      if (e.detail?.targetId && e.detail?.status) {
        setFollowingMap((prev) => ({ ...prev, [e.detail.targetId]: e.detail.status }));
      }
    };
    window.addEventListener("follow-updated", handleFollowUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener("follow-updated", handleFollowUpdated);
    };
  }, [currentUser?.id]);

  const handleToggleFollow = async (user) => {
    if (!currentUser) {
      window.dispatchEvent(new CustomEvent("open-auth-modal"));
      return;
    }

    const currentStatus = followingMap[user.id] || "none";
    const isCurrentlyFollowing = currentStatus === "accepted" || currentStatus === "pending";

    // Optimistic UI update
    const optimisticNextStatus = isCurrentlyFollowing
      ? "none"
      : user.isPrivate
      ? "pending"
      : "accepted";

    setFollowingMap((prev) => ({ ...prev, [user.id]: optimisticNextStatus }));

    try {
      if (!isCurrentlyFollowing) {
        const res = await followUser(user.id);
        const resolved = res?.status || (res?.following ? "accepted" : user.isPrivate ? "pending" : "accepted");
        setFollowingMap((prev) => ({ ...prev, [user.id]: resolved }));
        window.dispatchEvent(
          new CustomEvent("follow-updated", {
            detail: { targetId: user.id, status: resolved, following: resolved === "accepted" },
          })
        );
      } else {
        await unfollowUser(user.id);
        setFollowingMap((prev) => ({ ...prev, [user.id]: "none" }));
        window.dispatchEvent(
          new CustomEvent("follow-updated", {
            detail: { targetId: user.id, status: "none", following: false },
          })
        );
      }
    } catch (err) {
      setFollowingMap((prev) => ({ ...prev, [user.id]: currentStatus }));
      alert(`Could not update follow status: ${err.message}`);
    }
  };

  return (
    <aside className="suggestions-sidebar">
      {/* Current User Card */}
      {currentUser && (
        <div className="sidebar-current-user">
          <img
            src={currentUser.avatarSmallUrl || "/fixtures/asha-48.jpg"}
            alt={currentUser.handle}
            className="sidebar-avatar"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "https://picsum.photos/seed/user50/150/150";
            }}
          />
          <div className="sidebar-user-meta">
            <span className="sidebar-handle">@{currentUser.handle}</span>
            <span className="sidebar-fullname">{currentUser.displayName || currentUser.handle}</span>
          </div>
          <button
            type="button"
            className="sidebar-switch-btn"
            onClick={() => {
              if (onUserSwitch) onUserSwitch();
              else window.dispatchEvent(new CustomEvent("open-auth-modal"));
            }}
          >
            Switch
          </button>
        </div>
      )}

      {/* Suggested for You Header */}
      <div className="sidebar-header">
        <span className="sidebar-header-title">Suggested for you</span>
        <button
          type="button"
          className="sidebar-see-all-btn"
          onClick={() => {
            // Focus header search bar or trigger search view
            const searchInput = document.querySelector(".search-bar");
            if (searchInput) {
              searchInput.focus();
            }
          }}
        >
          See All
        </button>
      </div>

      {/* Suggestions List */}
      <div className="sidebar-suggestions-list">
        {loading ? (
          <div className="sidebar-loading-state">Loading suggestions...</div>
        ) : suggestions.length === 0 ? (
          <div className="sidebar-empty-state">No new suggestions</div>
        ) : (
          suggestions.map((user) => {
            const status = followingMap[user.id] || "none";
            const isFollowing = status === "accepted";
            const isPending = status === "pending";

            return (
              <div key={user.id} className="sidebar-suggestion-item">
                <img
                  src={user.avatar?.smallUrl || user.avatarSmallUrl || "/fixtures/default-avatar-48.jpg"}
                  alt={user.handle}
                  className="sidebar-suggestion-avatar"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "https://picsum.photos/seed/u40/150/150";
                  }}
                />
                <div className="sidebar-suggestion-meta">
                  <span className="sidebar-suggestion-handle">@{user.handle}</span>
                  <span className="sidebar-suggestion-sub">
                    {user.isPrivate ? "Private creator" : "Suggested for you"}
                  </span>
                </div>
                <button
                  type="button"
                  className={`sidebar-follow-btn ${isFollowing ? "following" : isPending ? "pending" : ""}`}
                  onClick={() => handleToggleFollow(user)}
                >
                  {isFollowing ? "Following" : isPending ? "Requested" : "Follow"}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Meta Footer */}
      <div className="sidebar-footer">
        <nav className="sidebar-footer-links">
          <a href="#about" onClick={(e) => e.preventDefault()}>About</a> •{" "}
          <a href="#help" onClick={(e) => e.preventDefault()}>Help</a> •{" "}
          <a href="#press" onClick={(e) => e.preventDefault()}>Press</a> •{" "}
          <a href="#api" onClick={(e) => e.preventDefault()}>API</a> •{" "}
          <a href="#jobs" onClick={(e) => e.preventDefault()}>Jobs</a> •{" "}
          <a href="#privacy" onClick={(e) => e.preventDefault()}>Privacy</a> •{" "}
          <a href="#terms" onClick={(e) => e.preventDefault()}>Terms</a>
        </nav>
        <span className="sidebar-copyright">© 2026 INSTAGRAM CLONE</span>
      </div>
    </aside>
  );
}

export default SuggestionsSidebar;
