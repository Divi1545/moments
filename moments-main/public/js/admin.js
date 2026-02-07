// ============================================================================
// Admin Dashboard Logic
// ============================================================================

import { supabase, getCurrentUser, showToast } from './config.js';

let currentUser = null;
let flaggedContent = [];
let currentFilters = { type: 'all', reason: 'all' };
let selectedContent = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await getCurrentUser();
  
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  // Check if user is admin
  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (!role || !['admin', 'moderator'].includes(role.role)) {
    showToast('Access denied. Admin only.', 'error');
    setTimeout(() => window.location.href = 'index.html', 2000);
    return;
  }

  await loadStats();
  await loadFlaggedContent();
  setupEventListeners();

  document.getElementById('loader').classList.add('hidden');
});

// ============================================================================
// Load Data
// ============================================================================

async function loadStats() {
  // Total flags
  const { count: totalFlags } = await supabase
    .from('flags')
    .select('*', { count: 'exact', head: true });

  document.getElementById('totalFlags').textContent = totalFlags || 0;

  // Pending flags (not resolved)
  document.getElementById('pendingFlags').textContent = totalFlags || 0;

  // Hidden moments
  const { count: hiddenMoments } = await supabase
    .from('moments')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'hidden');

  document.getElementById('hiddenMoments').textContent = hiddenMoments || 0;

  // Total blocks
  const { count: totalBlocks } = await supabase
    .from('blocked_users')
    .select('*', { count: 'exact', head: true });

  document.getElementById('totalBlocks').textContent = totalBlocks || 0;
}

async function loadFlaggedContent() {
  const listContainer = document.getElementById('flaggedContentList');
  listContainer.innerHTML = '<div class="loader-small"><div class="spinner"></div></div>';

  // Build query
  let query = supabase
    .from('flags')
    .select(`
      id,
      target_type,
      target_id,
      reason,
      created_at,
      reporter:reporter_id (
        display_name
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  // Apply filters
  if (currentFilters.type !== 'all') {
    query = query.eq('target_type', currentFilters.type);
  }
  if (currentFilters.reason !== 'all') {
    query = query.eq('reason', currentFilters.reason);
  }

  const { data: flags, error } = await query;

  if (error) {
    console.error('Error loading flags:', error);
    listContainer.innerHTML = '<p style="color: var(--red-600);">Error loading flagged content</p>';
    return;
  }

  if (!flags || flags.length === 0) {
    listContainer.innerHTML = '<p style="color: var(--gray-500); text-align: center; padding: 40px;">No flagged content</p>';
    return;
  }

  // Group flags by target
  const groupedFlags = {};
  for (const flag of flags) {
    const key = `${flag.target_type}-${flag.target_id}`;
    if (!groupedFlags[key]) {
      groupedFlags[key] = {
        target_type: flag.target_type,
        target_id: flag.target_id,
        flags: [],
        first_flagged: flag.created_at
      };
    }
    groupedFlags[key].flags.push(flag);
  }

  // Fetch content details for each target
  const contentPromises = Object.values(groupedFlags).map(async (group) => {
    if (group.target_type === 'moment') {
      const { data } = await supabase
        .from('moments')
        .select('title, status, creator_id')
        .eq('id', group.target_id)
        .maybeSingle();
      return { ...group, content: data };
    } else {
      const { data } = await supabase
        .from('moment_messages')
        .select('content, user_id')
        .eq('id', group.target_id)
        .maybeSingle();
      return { ...group, content: data };
    }
  });

  flaggedContent = await Promise.all(contentPromises);

  // Render
  listContainer.innerHTML = flaggedContent.map((item, index) => {
    const flagCount = item.flags.length;
    const reasons = [...new Set(item.flags.map(f => f.reason))].join(', ');
    const contentPreview = item.content 
      ? (item.target_type === 'moment' ? item.content.title : truncate(item.content.content, 100))
      : '[Content deleted]';

    return `
      <div class="flagged-item" data-index="${index}">
        <div class="flagged-header">
          <span class="flag-badge">${flagCount} 🚩</span>
          <span class="flag-type">${item.target_type}</span>
          <span class="flag-date">${formatDate(item.first_flagged)}</span>
        </div>
        <div class="flagged-content">
          <strong>Content:</strong> ${escapeHtml(contentPreview)}
        </div>
        <div class="flagged-reasons">
          <strong>Reasons:</strong> ${reasons}
        </div>
        <div class="flagged-actions">
          <button class="btn-small btn-view" data-index="${index}">Review</button>
          <button class="btn-small btn-hide" data-index="${index}">Hide</button>
          <button class="btn-small btn-delete" data-index="${index}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners
  document.querySelectorAll('.btn-view').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      showActionModal(flaggedContent[index]);
    });
  });

  document.querySelectorAll('.btn-hide').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.dataset.index);
      await hideContent(flaggedContent[index]);
    });
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.dataset.index);
      await deleteContent(flaggedContent[index]);
    });
  });
}

// ============================================================================
// Actions
// ============================================================================

function showActionModal(item) {
  selectedContent = item;
  const modal = document.getElementById('actionModal');
  const preview = document.getElementById('contentPreview');

  const contentText = item.content 
    ? (item.target_type === 'moment' ? item.content.title : item.content.content)
    : '[Content deleted]';

  preview.innerHTML = `
    <p><strong>Type:</strong> ${item.target_type}</p>
    <p><strong>Flags:</strong> ${item.flags.length}</p>
    <p><strong>Content:</strong></p>
    <div style="background: var(--gray-100); padding: 10px; border-radius: 8px; margin-top: 10px;">
      ${escapeHtml(contentText)}
    </div>
  `;

  modal.classList.remove('hidden');
}

async function hideContent(item) {
  if (!confirm('Hide this content?')) return;

  if (item.target_type === 'moment') {
    const { error } = await supabase
      .from('moments')
      .update({ status: 'hidden' })
      .eq('id', item.target_id);

    if (error) {
      showToast('Error hiding moment', 'error');
    } else {
      showToast('Moment hidden', 'success');
      await loadFlaggedContent();
      await loadStats();
    }
  } else {
    showToast('Messages cannot be hidden, only deleted', 'error');
  }
}

async function deleteContent(item) {
  if (!confirm('Permanently delete this content? This cannot be undone.')) return;

  const table = item.target_type === 'moment' ? 'moments' : 'moment_messages';
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', item.target_id);

  if (error) {
    console.error('Delete error:', error);
    showToast('Error deleting content', 'error');
  } else {
    showToast('Content deleted', 'success');
    
    // Also delete associated flags
    await supabase
      .from('flags')
      .delete()
      .eq('target_type', item.target_type)
      .eq('target_id', item.target_id);

    await loadFlaggedContent();
    await loadStats();
  }
}

async function dismissFlag(item) {
  if (!confirm('Dismiss all flags for this content?')) return;

  const { error } = await supabase
    .from('flags')
    .delete()
    .eq('target_type', item.target_type)
    .eq('target_id', item.target_id);

  if (error) {
    showToast('Error dismissing flags', 'error');
  } else {
    showToast('Flags dismissed', 'success');
    document.getElementById('actionModal').classList.add('hidden');
    await loadFlaggedContent();
    await loadStats();
  }
}

async function banUser(item) {
  if (!item.content) {
    showToast('Cannot ban user - content deleted', 'error');
    return;
  }

  const userId = item.target_type === 'moment' ? item.content.creator_id : item.content.user_id;
  
  if (!confirm('Ban this user? This will delete all their content and prevent them from logging in.')) return;

  // Delete user's moments
  await supabase.from('moments').delete().eq('creator_id', userId);
  
  // Delete user's messages
  await supabase.from('moment_messages').delete().eq('user_id', userId);
  
  // Delete user profile (cascades to everything)
  const { error } = await supabase.from('profiles').delete().eq('id', userId);

  if (error) {
    console.error('Ban error:', error);
    showToast('Error banning user', 'error');
  } else {
    showToast('User banned', 'success');
    document.getElementById('actionModal').classList.add('hidden');
    await loadFlaggedContent();
    await loadStats();
  }
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await loadStats();
    await loadFlaggedContent();
    showToast('Refreshed', 'success');
  });

  document.getElementById('applyFilters').addEventListener('click', () => {
    currentFilters.type = document.getElementById('filterType').value;
    currentFilters.reason = document.getElementById('filterReason').value;
    loadFlaggedContent();
  });

  // Action modal
  document.getElementById('closeActionModal').addEventListener('click', () => {
    document.getElementById('actionModal').classList.add('hidden');
    selectedContent = null;
  });

  document.getElementById('hideContentBtn').addEventListener('click', () => {
    if (selectedContent) hideContent(selectedContent);
  });

  document.getElementById('deleteContentBtn').addEventListener('click', () => {
    if (selectedContent) deleteContent(selectedContent);
  });

  document.getElementById('dismissFlagBtn').addEventListener('click', () => {
    if (selectedContent) dismissFlag(selectedContent);
  });

  document.getElementById('banUserBtn').addEventListener('click', () => {
    if (selectedContent) banUser(selectedContent);
  });
}

// ============================================================================
// Utilities
// ============================================================================

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function truncate(str, length) {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
