const API_URL = "http://localhost:3001";

/**
 * Resolve a displayable image URL from post media or fallback.
 */
function resolveImageUrl(item, index = 0) {
  if (item.media && item.media.length > 0) {
    const m = item.media[index] || item.media[0];
    if (m.largeUrl && !m.largeUrl.startsWith('/fixtures/')) {
      return m.largeUrl;
    }
    const seed = (item.id || '').replace(/[^0-9]/g, '').slice(-4) || '100';
    return `https://picsum.photos/seed/post${seed}/800/800`;
  }
  if (item.imageUrl && !item.imageUrl.startsWith('/fixtures/')) {
    return item.imageUrl;
  }
  const seed = (item.id || '').replace(/[^0-9]/g, '').slice(-4) || '200';
  return `https://picsum.photos/seed/post${seed}/800/800`;
}

/**
 * Resolve a profile avatar image URL.
 */
function resolveProfileImage(author, id) {
  if (author?.avatar?.smallUrl && !author.avatar.smallUrl.startsWith('/fixtures/')) {
    return author.avatar.smallUrl;
  }
  const seed = (author?.id || id || 'user').replace(/[^0-9]/g, '').slice(-3) || '50';
  return `https://picsum.photos/seed/user${seed}/150/150`;
}

/**
 * Format a backend post into the format used by the React frontend.
 */
export function formatPost(item) {
  return {
    id: item.id,
    caption: item.text || item.caption || "",
    username: item.author?.handle || item.author?.username || item.author?.displayName || "user",
    displayName: item.author?.displayName || item.author?.handle || "User",
    profileImage: resolveProfileImage(item.author, item.id),
    category: item.kind === 'reply' ? 'Reply' : (item.kind === 'repost' ? 'Repost' : 'Photography'),
    hashtags: item.text && item.text.includes('#') ? '' : "#photography #visualsoflife #artofvisuals",
    timestamp: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "",
    imageUrl: resolveImageUrl(item, 0),
    media: item.media || [],
    likeCount: item.likeCount ?? 0,
    replyCount: item.replyCount ?? 0,
    likedByViewer: Boolean(item.likedByViewer),
    kind: item.kind || 'original',
  };
}

/**
 * Fetch posts from NestJS backend using cursor pagination.
 *
 * @param {string|null} cursor Cursor for the next set of posts
 * @param {number} limit Number of posts per request (1-50)
 */
export async function fetchPosts(cursor = null, limit = 10) {
  let url = `${API_URL}/feed?limit=${limit}`;

  if (cursor) {
    url += `&cursor=${encodeURIComponent(cursor)}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch posts: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  return {
    items: (data.items || []).map(formatPost),
    nextCursor: data.nextCursor,
    hasMore: Boolean(data.hasMore),
  };
}

/**
 * Like / unlike a post via NestJS backend.
 */
export async function toggleLike(postId, currentLikedState) {
  const method = currentLikedState ? "DELETE" : "POST";
  const response = await fetch(`${API_URL}/posts/${postId}/like`, {
    method,
  });

  if (!response.ok) {
    throw new Error(`Failed to update like: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetch replies for a post.
 */
export async function fetchReplies(postId, limit = 10) {
  const response = await fetch(`${API_URL}/posts/${postId}/replies?limit=${limit}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch replies: ${response.status}`);
  }

  const data = await response.json();
  return {
    items: (data.items || []).map(formatPost),
    nextCursor: data.nextCursor,
  };
}

/**
 * Create a reply for a post.
 */
export async function createReply(postId, text) {
  const response = await fetch(`${API_URL}/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

/**
 * Search posts by query string.
 */
export async function searchPosts(query, limit = 10) {
  const response = await fetch(`${API_URL}/search/posts?q=${encodeURIComponent(query)}&limit=${limit}`);

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    items: (data.items || []).map(formatPost),
    nextCursor: data.nextCursor,
  };
}

/**
 * Follow a user by ID or handle
 */
export async function followUser(userIdOrHandle) {
  const response = await fetch(`${API_URL}/users/${encodeURIComponent(userIdOrHandle)}/follow`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to follow user: ${response.status}`);
  }

  return await response.json();
}

/**
 * Unfollow a user by ID or handle
 */
export async function unfollowUser(userIdOrHandle) {
  const response = await fetch(`${API_URL}/users/${encodeURIComponent(userIdOrHandle)}/follow`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to unfollow user: ${response.status}`);
  }

  return await response.json();
}

/**
 * Check if viewer is currently following a user
 */
export async function checkIsFollowing(userIdOrHandle) {
  try {
    const response = await fetch(`${API_URL}/users/${encodeURIComponent(userIdOrHandle)}/following`);
    if (!response.ok) {
      return { following: false };
    }
    return await response.json();
  } catch {
    return { following: false };
  }
}