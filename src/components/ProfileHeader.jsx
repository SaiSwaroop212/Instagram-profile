import React, { useState, useEffect } from "react";
import { updateUserProfile, fetchUserProfile, getStoredUser } from "../services/api";

export function ProfileHeader({ postCount = 0, onProfileUpdated }) {
  const [user, setUser] = useState(getStoredUser());
  const [profileStats, setProfileStats] = useState({
    followerCount: 0,
    followingCount: 0,
    postCount: postCount,
  });
  const [showEditModal, setShowEditModal] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [bioInput, setBioInput] = useState("");
  const [isPrivateInput, setIsPrivateInput] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Sync user profile from backend on mount or user switch
  const refreshProfile = () => {
    const stored = getStoredUser();
    setUser(stored);
    if (stored) {
      setDisplayNameInput(stored.displayName || "");
      setBioInput(stored.bio || "");
      setIsPrivateInput(Boolean(stored.isPrivate));

      fetchUserProfile("me")
        .then((profile) => {
          if (profile) {
            setUser((prev) => ({ ...prev, ...profile }));
            setProfileStats({
              followerCount: profile.followerCount ?? 0,
              followingCount: profile.followingCount ?? 0,
              postCount: profile.postCount ?? postCount,
            });
            setBioInput(profile.bio || "");
            setDisplayNameInput(profile.displayName || "");
            setIsPrivateInput(Boolean(profile.isPrivate));
          }
        })
        .catch(() => {});
    }
  };

  useEffect(() => {
    refreshProfile();

    const handleOpenEditEvent = () => handleOpenEdit();
    const handleUserUpdatedEvent = (e) => {
      if (e.detail) {
        setUser((prev) => ({ ...prev, ...e.detail }));
      } else {
        refreshProfile();
      }
    };

    window.addEventListener("open-edit-profile", handleOpenEditEvent);
    window.addEventListener("user-updated", handleUserUpdatedEvent);
    window.addEventListener("follow-updated", refreshProfile);

    return () => {
      window.removeEventListener("open-edit-profile", handleOpenEditEvent);
      window.removeEventListener("user-updated", handleUserUpdatedEvent);
      window.removeEventListener("follow-updated", refreshProfile);
    };
  }, []);

  useEffect(() => {
    if (postCount !== undefined && postCount !== null) {
      setProfileStats((prev) => ({ ...prev, postCount }));
    }
  }, [postCount]);

  const handleOpenEdit = () => {
    const currentUser = getStoredUser() || user;
    setDisplayNameInput(currentUser?.displayName || "");
    setBioInput(currentUser?.bio || "");
    setIsPrivateInput(Boolean(currentUser?.isPrivate));
    setSaveError("");
    setShowEditModal(true);
  };


  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    if (!displayNameInput.trim()) {
      setSaveError("Display name cannot be empty.");
      return;
    }

    if (bioInput.length > 280) {
      setSaveError("Bio cannot exceed 280 characters.");
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const updated = await updateUserProfile({
        displayName: displayNameInput.trim(),
        bio: bioInput.trim(),
        isPrivate: isPrivateInput,
      });

      setUser(updated);
      setShowEditModal(false);
      if (onProfileUpdated) {
        onProfileUpdated(updated);
      }
    } catch (err) {
      setSaveError(err.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) return null;

  const avatarUrl =
    user.avatarLargeUrl ||
    user.avatarSmallUrl ||
    user.avatar?.largeUrl ||
    user.avatar?.smallUrl ||
    "/fixtures/asha-96.jpg";

  return (
    <div className="instagram-profile-banner">
      {/* 1. Avatar with Story Ring */}
      <div className="profile-banner-avatar-wrap">
        <div className="profile-avatar-story-ring">
          <img
            src={avatarUrl}
            alt={user.handle}
            className="profile-banner-avatar-img"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "https://picsum.photos/seed/user50/150/150";
            }}
          />
        </div>
      </div>

      {/* 2. Profile Details & Bio */}
      <div className="profile-banner-info-wrap">
        {/* Top line: handle + Edit Profile Button + Privacy Badge */}
        <div className="profile-banner-top-row">
          <h2 className="profile-banner-handle">@{user.handle}</h2>

          <button
            type="button"
            className="profile-banner-edit-btn"
            onClick={handleOpenEdit}
            title="Edit your bio and profile details"
          >
            Edit Profile
          </button>

          {user.isPrivate ? (
            <span className="profile-privacy-badge private" title="Private Account">
              🔒 Private
            </span>
          ) : (
            <span className="profile-privacy-badge public" title="Public Account">
              Public
            </span>
          )}
        </div>

        {/* Stats Row */}
        <div className="profile-banner-stats-row">
          <div className="profile-stat-item">
            <strong>{profileStats.postCount}</strong> posts
          </div>
          <div className="profile-stat-item">
            <strong>{profileStats.followerCount}</strong> followers
          </div>
          <div className="profile-stat-item">
            <strong>{profileStats.followingCount}</strong> following
          </div>
        </div>

        {/* Display Name & Bio */}
        <div className="profile-banner-bio-section">
          <div className="profile-banner-display-name">
            {user.displayName || user.handle}
          </div>

          <div
            className="profile-banner-bio-text"
            onClick={handleOpenEdit}
            title="Click to edit bio"
          >
            {user.bio ? (
              user.bio
            ) : (
              <span className="profile-empty-bio-hint">
                + Add a bio to tell people about yourself
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Edit Bio & Profile Modal */}
      {showEditModal && (
        <div
          className="auth-modal-backdrop"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="auth-modal-card profile-edit-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auth-modal-header">
              <h3>Edit Profile & Bio</h3>
              <button
                type="button"
                className="auth-modal-close"
                onClick={() => setShowEditModal(false)}
              >
                ✕
              </button>
            </div>

            {saveError && (
              <div className="auth-error-banner" style={{ margin: "12px 16px 0" }}>
                {saveError}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="profile-edit-form">
              {/* User preview */}
              <div className="profile-edit-user-preview">
                <img
                  src={avatarUrl}
                  alt={user.handle}
                  className="profile-edit-avatar-thumb"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "https://picsum.photos/seed/user50/150/150";
                  }}
                />
                <div className="profile-edit-meta">
                  <strong>@{user.handle}</strong>
                  <span>Update your public presence</span>
                </div>
              </div>

              {/* Display Name */}
              <div className="form-group" style={{ marginTop: "14px" }}>
                <label>Display Name</label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  placeholder="e.g. Asha Sharma"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                />
              </div>

              {/* Bio Textarea */}
              <div className="form-group" style={{ marginTop: "14px" }}>
                <label>Bio (About you)</label>
                <textarea
                  className="create-post-textarea"
                  rows={4}
                  maxLength={280}
                  placeholder="Write your bio (e.g. Photographer, designer, coffee lover)..."
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  autoFocus
                />
                <div className="create-post-counter">
                  <span>{bioInput.length}/280 characters</span>
                </div>
              </div>

              {/* Private Account Setting */}
              <div className="profile-edit-privacy-row">
                <label className="profile-checkbox-label">
                  <input
                    type="checkbox"
                    checked={isPrivateInput}
                    onChange={(e) => setIsPrivateInput(e.target.checked)}
                  />
                  <div>
                    <strong>Private Account</strong>
                    <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#8e8e8e" }}>
                      When your account is private, only approved followers can view your posts and media.
                    </p>
                  </div>
                </label>
              </div>

              <div className="create-post-actions" style={{ marginTop: "16px" }}>
                <button
                  type="button"
                  className="cancel-btn-subtle"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="auth-submit-btn"
                  style={{ margin: 0 }}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileHeader;
