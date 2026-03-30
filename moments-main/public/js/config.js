// ============================================================================
// Supabase Client Configuration
// ============================================================================

// Global variables to store config
let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';
let MAPBOX_TOKEN = '';
let supabase = null;

// Fetch configuration from server
async function loadConfig() {
  try {
    console.log('Fetching configuration from /api/config...');
    const response = await fetch('/api/config');
    
    if (!response.ok) {
      throw new Error(`Failed to load config: ${response.status}`);
    }
    
    const config = await response.json();
    
    SUPABASE_URL = config.SUPABASE_URL || '';
    SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY || '';
    MAPBOX_TOKEN = config.MAPBOX_TOKEN || '';
    
    console.log('✅ Configuration loaded from server');
    console.log('Supabase URL:', SUPABASE_URL || '❌ MISSING');
    console.log('Supabase Key:', SUPABASE_ANON_KEY ? `✅ Set (${SUPABASE_ANON_KEY.substring(0, 20)}...)` : '❌ MISSING');
    console.log('Mapbox Token:', MAPBOX_TOKEN ? '✅ Set' : '⚠️ Not set (optional)');
    
    // Validate required environment variables
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('❌ Missing required Supabase credentials!');
      throw new Error('Configuration error: Missing Supabase credentials');
    }
    
    // Initialize Supabase client
    const { createClient } = window.supabase;
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    console.log('✅ Supabase client initialized successfully');
    
    return { supabase, mapboxToken: MAPBOX_TOKEN };
    
  } catch (error) {
    console.error('❌ Failed to load configuration:', error);
    alert('Configuration Error: Unable to load app configuration. Please contact support.');
    throw error;
  }
}

// Export a promise that resolves when config is loaded
export const configPromise = loadConfig();

// Export getter functions that wait for config
export async function getSupabase() {
  await configPromise;
  return supabase;
}

export async function getMapboxToken() {
  await configPromise;
  return MAPBOX_TOKEN;
}

// For backward compatibility - export supabase directly
// Note: This will be null until configPromise resolves
export { supabase };

// Helper: Get current user
export async function getCurrentUser() {
  const client = await getSupabase();
  const { data: { user }, error } = await client.auth.getUser();
  if (error) {
    console.error('Error getting user:', error);
    return null;
  }
  return user;
}

// Helper: Get user profile
export async function getUserProfile(userId) {
  const client = await getSupabase();
  const { data, error } = await client
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
  const client = await getSupabase();
  const { data, error } = await client
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

