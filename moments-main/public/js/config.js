// ============================================================================
// Supabase Client Configuration  
// ============================================================================

// Try multiple methods to get environment variables
const SUPABASE_URL = window.ENV?.SUPABASE_URL || 
                      window.__ENV__?.SUPABASE_URL || 
                      'https://eolomggmsvfbiyiqqbfl.supabase.co';

const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || 
                           window.__ENV__?.SUPABASE_ANON_KEY || 
                           'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvbG9tZ2dtc3ZmYml5aXFxYmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxNDEzNTUsImV4cCI6MjA1MzcxNzM1NX0.qH8Mc3uJPj4d6h2hKrHpeCdXXzBOk5hTcQVLQZhDRzY';

const MAPBOX_TOKEN = window.ENV?.MAPBOX_TOKEN || 
                      window.__ENV__?.MAPBOX_TOKEN || 
                      '';

// Debug logging
console.log('=== Configuration Debug ===');
console.log('window.ENV:', window.ENV);
console.log('SUPABASE_URL:', SUPABASE_URL);
console.log('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? `Set (${SUPABASE_ANON_KEY.substring(0, 20)}...)` : 'NOT SET');
console.log('=========================');

// Validate required environment variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase environment variables!');
  alert('Configuration Error: Missing Supabase credentials');
  throw new Error('Configuration error: Missing Supabase credentials');
}

// Initialize Supabase client
const { createClient } = window.supabase;
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Supabase client initialized successfully');

export const mapboxToken = MAPBOX_TOKEN;

// Helper: Get current user
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error getting user:', error);
    return null;
  }
  return user;
}

// Helper: Get user profile
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
  return data;
}

// Helper: Check if profile exists
export async function checkProfileExists(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  return !!data && !error;
}

// Helper: Format time
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

// Helper: Format datetime for display
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

// Helper: Show toast notification
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

// Add animation styles
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

