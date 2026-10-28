const API_URL = "http://localhost:3001";

// ============================================================================
// Auth Storage Helpers
// ============================================================================

export function getAuthToken() {
  return localStorage.getItem("social_feed_token");
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem("social_feed_token", token);
  } else {
    localStorage.removeItem("social_feed_token");
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem("social_feed_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  if (user) {
    localStorage.setItem("social_feed_user", JSON.stringify(user));
  } else {
    localStorage.removeItem("social_feed_user");
  }
}

export function getAuthHeaders(customHeaders = {}) {
  const headers = { ...customHeaders };
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Initializes default user session (Asha) if none exists,
 * ensuring all like, follow, and reply operations work smoothly.
 */
export async function initDefaultAuth() {
  const existingToken = getAuthToken();
  if (existingToken) {
    try {
      // Validate session with /auth/me
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${existingToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStoredUser(data.user);
        return data.user;
      }
    } catch {
      // Token expired or invalid
    }
  }

  // If no valid session, remain guest (do not auto-login as Asha)
  setAuthToken(null);
  setStoredUser(null);
  return null;
}

export async function loginUser(handle, password) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Login failed: ${response.status}`);
  }

  const data = await response.json();
  setAuthToken(data.token);
  setStoredUser(data.user);
  return data;
}

export async function registerUser({ handle, displayName, password, isPrivate = false }) {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, displayName, password, isPrivate: Boolean(isPrivate) }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Registration failed: ${response.status}`);
  }

  const data = await response.json();
  setAuthToken(data.token);
  setStoredUser(data.user);
  return data;
}

export async function logoutUser() {
  const token = getAuthToken();
  if (token) {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
    } catch {}
  }
  setAuthToken(null);
  setStoredUser(null);
}

export async function deactivateCurrentUser() {
  const response = await fetch(`${API_URL}/users/me/deactivate`, {
    method: "POST",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Deactivation failed: ${response.status}`);
  }

  setAuthToken(null);
  setStoredUser(null);
  return await response.json();
}

export async function fetchUserProfile(userIdOrHandle = "me") {
  const response = await fetch(`${API_URL}/users/${encodeURIComponent(userIdOrHandle)}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user profile: ${response.status}`);
  }

  const data = await response.json();
  return data.item || data.user || data;
}

export async function updateUserProfile(updateData) {
  const response = await fetch(`${API_URL}/users/me`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(updateData),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to update profile: ${response.status}`);
  }

  const data = await response.json();
  const updatedItem = data.item || data.user || data;

  // Merge and update local stored user
  const current = getStoredUser() || {};
  const merged = {
    ...current,
    ...updatedItem,
    bio: updatedItem.bio !== undefined ? updatedItem.bio : current.bio,
    displayName: updatedItem.displayName || current.displayName,
    isPrivate: updatedItem.isPrivate !== undefined ? updatedItem.isPrivate : current.isPrivate,
  };
  setStoredUser(merged);
  window.dispatchEvent(new CustomEvent("user-updated", { detail: merged }));
  return merged;
}

// ============================================================================
// Post Formatting
// ============================================================================

function resolveImageUrl(item, index = 0) {
  if (item.media && item.media.length > 0) {
    const m = item.media[index] || item.media[0];
    if (m.largeUrl && !m.largeUrl.startsWith("/fixtures/")) {
      return m.largeUrl;
    }
    const seed = (item.id || "").replace(/[^0-9]/g, "").slice(-4) || "100";
    return `https://picsum.photos/seed/post${seed}/800/800`;
  }
  if (item.imageUrl && !item.imageUrl.startsWith("/fixtures/")) {
    return item.imageUrl;
  }
  const seed = (item.id || "").replace(/[^0-9]/g, "").slice(-4) || "200";
  return `https://picsum.photos/seed/post${seed}/800/800`;
}

function resolveProfileImage(author, id) {
  if (author?.avatar?.smallUrl && !author.avatar.smallUrl.startsWith("/fixtures/")) {
    return author.avatar.smallUrl;
  }
  const seed = (author?.id || id || "user").replace(/[^0-9]/g, "").slice(-3) || "50";
  return `https://picsum.photos/seed/user${seed}/150/150`;
}

function deriveCategory(text, kind) {
  if (kind === "reply") return "Reply";
  if (kind === "repost") return "Repost";
  const lower = (text || "").toLowerCase();
  if (lower.includes("travel") || lower.includes("amalfi") || lower.includes("alps") || lower.includes("wanderlust")) return "Travel";
  if (lower.includes("street") || lower.includes("tokyo") || lower.includes("kyoto") || lower.includes("neon")) return "Street Life";
  if (lower.includes("nature") || lower.includes("wilderness") || lower.includes("forest") || lower.includes("mountain")) return "Nature";
  if (lower.includes("food") || lower.includes("pasta") || lower.includes("chef") || lower.includes("coffee")) return "Culinary";
  if (lower.includes("astro") || lower.includes("milky") || lower.includes("star") || lower.includes("space")) return "Astrophotography";
  if (lower.includes("architecture") || lower.includes("minimalism") || lower.includes("geometry") || lower.includes("design")) return "Architecture";
  if (lower.includes("aerial") || lower.includes("drone") || lower.includes("ocean")) return "Aerial";
  return "Photography";
}

export function formatPost(item) {
  return {
    id: item.id,
    caption: item.text || item.caption || "",
    username: item.author?.handle || item.author?.username || item.author?.displayName || "user",
    authorId: item.author?.id,
    displayName: item.author?.displayName || item.author?.handle || "User",
    profileImage: resolveProfileImage(item.author, item.id),
    category: deriveCategory(item.text, item.kind),
    hashtags: item.text && item.text.includes("#") ? "" : "#photography #visualsoflife #artofvisuals",
    timestamp: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "",
    imageUrl: resolveImageUrl(item, 0),
    media: item.media || [],
    likeCount: item.likeCount ?? 0,
    replyCount: item.replyCount ?? 0,
    likedByViewer: Boolean(item.likedByViewer),
    kind: item.kind || "original",
    version: item.version ?? 1,
  };
}

// ============================================================================
// Core API Calls (Personalized Feed, Likes, Replies, Follows)
// ============================================================================

export async function fetchPosts(cursor = null, limit = 10, scope = null) {
  let url = `${API_URL}/feed?limit=${limit}`;

  if (cursor) {
    url += `&cursor=${encodeURIComponent(cursor)}`;
  }
  if (scope) {
    url += `&scope=${encodeURIComponent(scope)}`;
  }

  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch posts: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return {
    items: (data.items || []).map(formatPost),
    nextCursor: data.nextCursor,
    hasMore: Boolean(data.hasMore),
    feedType: data.feedType,
    isFallback: Boolean(data.isFallback),
    onboarding: Boolean(data.onboarding),
    message: data.message,
  };
}

export async function fetchUserPosts(userIdOrHandle = "me", cursor = null, limit = 10) {
  let url = `${API_URL}/users/${encodeURIComponent(userIdOrHandle)}/posts?limit=${limit}`;
  if (cursor) {
    url += `&cursor=${encodeURIComponent(cursor)}`;
  }

  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user posts: ${response.status}`);
  }

  const data = await response.json();

  return {
    items: (data.items || []).map(formatPost),
    nextCursor: data.nextCursor,
    hasMore: Boolean(data.hasMore),
    feedType: "user_posts",
  };
}

export async function fetchPostById(id) {
  let fullId = String(id).trim();
  if (/^\d+$/.test(fullId)) {
    fullId = `b0000000-0000-4000-8000-${fullId.padStart(12, "0")}`;
  }
  const response = await fetch(`${API_URL}/posts/${encodeURIComponent(fullId)}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch post: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return formatPost(data.item);
}

export async function toggleLike(postId, currentLikedState) {
  const method = currentLikedState ? "DELETE" : "POST";
  const response = await fetch(`${API_URL}/posts/${postId}/like`, {
    method,
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to update like: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

export async function fetchReplies(postId, limit = 10) {
  const response = await fetch(`${API_URL}/posts/${postId}/replies?limit=${limit}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch replies: ${response.status}`);
  }

  const data = await response.json();
  return {
    items: (data.items || []).map(formatPost),
    nextCursor: data.nextCursor,
  };
}

export async function createReply(postId, text) {
  const response = await fetch(`${API_URL}/posts`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      kind: "reply",
      text,
      replyToId: postId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create reply: ${response.status}`);
  }

  const data = await response.json();
  return formatPost(data.item);
}

export async function createPost({ text, kind = "original", media = [] }) {
  const body = {
    kind,
    text: text?.trim(),
  };

  if (media && media.length > 0) {
    body.media = media;
  }

  const response = await fetch(`${API_URL}/posts`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create post: ${response.status}`);
  }

  const data = await response.json();
  return formatPost(data.item);
}

export async function updatePost(postId, text, version) {
  const body = { text: text?.trim() };
  if (version !== undefined && version !== null) {
    body.version = version;
  }

  const response = await fetch(`${API_URL}/posts/${encodeURIComponent(postId)}`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to update post: ${response.status}`);
  }

  const data = await response.json();
  return formatPost(data.item);
}

export async function deletePost(postId) {
  const response = await fetch(`${API_URL}/posts/${encodeURIComponent(postId)}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to delete post: ${response.status}`);
  }

  return await response.json();
}

export async function searchPosts(query, limit = 10) {
  const response = await fetch(
    `${API_URL}/search/posts?q=${encodeURIComponent(query)}&limit=${limit}`,
    {
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    items: (data.items || []).map(formatPost),
    nextCursor: data.nextCursor,
  };
}

export async function searchUsers(query = "", limit = 10) {
  const url = query?.trim()
    ? `${API_URL}/search/users?q=${encodeURIComponent(query.trim())}&limit=${limit}`
    : `${API_URL}/search/users?limit=${limit}`;

  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.items || [];
}

export async function followUser(userIdOrHandle) {
  const response = await fetch(`${API_URL}/users/${encodeURIComponent(userIdOrHandle)}/follow`, {
    method: "POST",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to follow user: ${response.status}`);
  }

  return await response.json();
}

export async function unfollowUser(userIdOrHandle) {
  const response = await fetch(`${API_URL}/users/${encodeURIComponent(userIdOrHandle)}/follow`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to unfollow user: ${response.status}`);
  }

  return await response.json();
}

export async function acceptFollowRequest(requesterIdOrHandle) {
  const response = await fetch(
    `${API_URL}/users/requests/${encodeURIComponent(requesterIdOrHandle)}/accept`,
    {
      method: "POST",
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to accept follow request: ${response.status}`);
  }

  return await response.json();
}

export async function rejectFollowRequest(requesterIdOrHandle) {
  const response = await fetch(
    `${API_URL}/users/requests/${encodeURIComponent(requesterIdOrHandle)}/reject`,
    {
      method: "POST",
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to reject follow request: ${response.status}`);
  }

  return await response.json();
}

export async function checkIsFollowing(userIdOrHandle) {
  try {
    const response = await fetch(`${API_URL}/users/${encodeURIComponent(userIdOrHandle)}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      return { following: false, status: "none" };
    }
    const data = await response.json();
    const rel = data.item?.relationship || data.relationship;
    const isFollowing = Boolean(data.item?.following ?? rel?.following);
    return {
      following: isFollowing,
      status: rel?.status || (isFollowing ? "accepted" : "none"),
    };
  } catch {
    return { following: false, status: "none" };
  }
}

// ============================================================================
// Notifications API Calls
// ============================================================================

export async function fetchNotifications() {
  const response = await fetch(`${API_URL}/notifications`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) return { items: [] };
  return await response.json();
}

export async function fetchUnreadCount() {
  const response = await fetch(`${API_URL}/notifications/unread-count`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) return { unreadCount: 0 };
  return await response.json();
}

export async function markAllNotificationsRead() {
  const response = await fetch(`${API_URL}/notifications/read-all`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) return { count: 0 };
  return await response.json();
}