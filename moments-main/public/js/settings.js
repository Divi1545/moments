// ============================================================================
// Settings Page Logic
// ============================================================================

import { supabase, getCurrentUser, showToast } from './config.js';

let currentUser = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await getCurrentUser();
  
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  await loadProfile();
  await loadBlockedUsers();
  setupEventListeners();

  document.getElementById('loader').classList.add('hidden');
});

// ============================================================================
// Load Data
// ============================================================================

async function loadProfile() {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, user_type, profile_photo_url')
    .eq('id', currentUser.id)
    .single();

  if (error || !profile) {
    console.error('Error loading profile:', error);
    return;
  }

  document.getElementById('displayName').textContent = profile.display_name;
  document.getElementById('userType').textContent = 
    profile.user_type.charAt(0).toUpperCase() + profile.user_type.slice(1);

  const avatarEl = document.getElementById('profileAvatar');
  if (profile.profile_photo_url) {
    avatarEl.innerHTML = `<img src="${profile.profile_photo_url}" alt="${profile.display_name}">`;
  } else {
    avatarEl.textContent = profile.display_name.charAt(0).toUpperCase();
  }
}

async function loadBlockedUsers() {
  const listContainer = document.getElementById('blockedUsersList');

  const { data: blockedUsers, error } = await supabase
    .from('blocked_users')
    .select(`
      id,
      blocked_id,
      created_at,
      profiles:blocked_id (
        display_name,
        profile_photo_url
      )
    `)
    .eq('blocker_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading blocked users:', error);
    listContainer.innerHTML = '<p style="color: var(--red-600);">Error loading blocked users</p>';
    return;
  }

  if (!blockedUsers || blockedUsers.length === 0) {
    listContainer.innerHTML = '<p style="color: var(--gray-500);">No blocked users</p>';
    return;
  }

  listContainer.innerHTML = blockedUsers.map(block => {
    const profile = block.profiles;
    const initial = profile.display_name.charAt(0).toUpperCase();
    const avatar = profile.profile_photo_url 
      ? `<img src="${profile.profile_photo_url}" alt="${profile.display_name}">`
      : initial;

    return `
      <div class="blocked-user-item" data-block-id="${block.id}">
        <div class="blocked-user-avatar">${avatar}</div>
        <div class="blocked-user-info">
          <strong>${profile.display_name}</strong>
          <small>Blocked ${formatDate(block.created_at)}</small>
        </div>
        <button class="btn-unblock" data-block-id="${block.id}" data-user-name="${profile.display_name}">
          Unblock
        </button>
      </div>
    `;
  }).join('');

  // Add unblock listeners
  document.querySelectorAll('.btn-unblock').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const blockId = e.target.dataset.blockId;
      const userName = e.target.dataset.userName;
      await unblockUser(blockId, userName);
    });
  });
}

// ============================================================================
// Actions
// ============================================================================

async function unblockUser(blockId, userName) {
  if (!confirm(`Unblock ${userName}?`)) return;

  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('id', blockId);

  if (error) {
    console.error('Error unblocking user:', error);
    showToast('Error unblocking user', 'error');
    return;
  }

  showToast(`${userName} unblocked`, 'success');
  await loadBlockedUsers();
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('signOutBtn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to sign out?')) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast('Error signing out', 'error');
    } else {
      window.location.href = 'index.html';
    }
  });
}

// ============================================================================
// Utilities
// ============================================================================

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}
