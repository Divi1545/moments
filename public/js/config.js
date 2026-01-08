const MAPBOX_TOKEN = window.ENV?.MAPBOX_TOKEN || 'YOUR_MAPBOX_TOKEN';

export const mapboxToken = MAPBOX_TOKEN;

export async function getCurrentUser() {
  try {
    const response = await fetch('/api/auth/user', { credentials: 'include' });
    const data = await response.json();
    return data.user;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

export async function getSession() {
  try {
    const response = await fetch('/api/auth/user', { credentials: 'include' });
    const data = await response.json();
    return { user: data.user, profile: data.profile, needsProfile: data.needsProfile };
  } catch (error) {
    console.error('Error getting session:', error);
    return { user: null, profile: null, needsProfile: false };
  }
}

export async function login(email, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }
  return response.json();
}

export async function register(email, password) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Registration failed');
  }
  return response.json();
}

export async function logout() {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  return response.json();
}

export async function getUserProfile(userId) {
  try {
    const response = await fetch(`/api/profiles/${userId}`, { credentials: 'include' });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
}

export async function createProfile(data) {
  const response = await fetch('/api/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create profile');
  }
  return response.json();
}

export async function checkProfileExists(userId) {
  try {
    const response = await fetch(`/api/profiles/${userId}`, { credentials: 'include' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

export async function getNearbyMoments(lat, lng, radius = 5000, limit = 50) {
  const response = await fetch(
    `/api/moments/nearby?lat=${lat}&lng=${lng}&radius=${radius}&limit=${limit}`,
    { credentials: 'include' }
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch moments');
  }
  return response.json();
}

export async function searchMoments(query, lat, lng, radius = 10000, limit = 20) {
  const response = await fetch(
    `/api/moments/search?q=${encodeURIComponent(query)}&lat=${lat}&lng=${lng}&radius=${radius}&limit=${limit}`,
    { credentials: 'include' }
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Search failed');
  }
  return response.json();
}

export async function getMoment(id) {
  const response = await fetch(`/api/moments/${id}`, { credentials: 'include' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch moment');
  }
  return response.json();
}

export async function createMoment(data) {
  const response = await fetch('/api/moments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create moment');
  }
  return response.json();
}

export async function getMomentContext(momentId) {
  const response = await fetch(`/api/moments/${momentId}/context`, { credentials: 'include' });
  if (!response.ok) return { participant_count: 0, badges: [] };
  return response.json();
}

export async function joinMoment(momentId) {
  const response = await fetch(`/api/moments/${momentId}/join`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to join moment');
  }
  return response.json();
}

export async function leaveMoment(momentId) {
  const response = await fetch(`/api/moments/${momentId}/leave`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to leave moment');
  }
  return response.json();
}

export async function getParticipants(momentId) {
  const response = await fetch(`/api/moments/${momentId}/participants`, { credentials: 'include' });
  if (!response.ok) return [];
  return response.json();
}

export async function isParticipant(momentId) {
  const response = await fetch(`/api/moments/${momentId}/participation`, { credentials: 'include' });
  if (!response.ok) return false;
  const data = await response.json();
  return data.isParticipant;
}

export async function getMessages(momentId, limit = 100) {
  const response = await fetch(`/api/moments/${momentId}/messages?limit=${limit}`, { credentials: 'include' });
  if (!response.ok) return [];
  return response.json();
}

export async function sendMessage(momentId, content) {
  const response = await fetch(`/api/moments/${momentId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to send message');
  }
  return response.json();
}

export async function getMomentPhotos(momentId, isPreview = true) {
  const response = await fetch(`/api/moments/${momentId}/photos?preview=${isPreview}`, { credentials: 'include' });
  if (!response.ok) return [];
  return response.json();
}

export async function uploadMomentPhoto(momentId, file, isPreview = false) {
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('isPreview', isPreview.toString());
  
  const response = await fetch(`/api/moments/${momentId}/photos`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload photo');
  }
  return response.json();
}

export async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append('photo', file);
  
  const response = await fetch('/api/upload/avatar', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload avatar');
  }
  return response.json();
}

export async function getSosAlerts() {
  const response = await fetch('/api/sos-alerts', { credentials: 'include' });
  if (!response.ok) return [];
  return response.json();
}

export async function createSosAlert(momentId, lat, lng) {
  const response = await fetch('/api/sos-alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ momentId, lat, lng }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create SOS alert');
  }
  return response.json();
}

export async function createFlag(targetType, targetId, reason) {
  const response = await fetch('/api/flags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ targetType, targetId, reason }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create flag');
  }
  return response.json();
}

export function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

export function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });

  if (date.toDateString() === today.toDateString()) {
    return `Today at ${timeStr}`;
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow at ${timeStr}`;
  } else {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
}

export function showToast(message, type = 'info') {
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#6366f1'};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    animation: slideUp 0.3s ease;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideDown 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from {
      transform: translateX(-50%) translateY(100px);
      opacity: 0;
    }
    to {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  }
  @keyframes slideDown {
    from {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    to {
      transform: translateX(-50%) translateY(100px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
