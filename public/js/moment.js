// ============================================================================
// Moment Detail Page Logic
// ============================================================================

import { supabase, getCurrentUser, formatDateTime, showToast } from './config.js';

let momentId = null;
let currentUser = null;
let isParticipant = false;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  momentId = params.get('id');

  if (!momentId) {
    showError('Invalid moment ID');
    return;
  }

  currentUser = await getCurrentUser();
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  await loadMoment();
  setupEventListeners();
  subscribeToUpdates();
});

// ============================================================================
// Load Moment Data
// ============================================================================

async function loadMoment() {
  const loader = document.getElementById('loader');
  const content = document.getElementById('momentContent');

  // Fetch moment
  const { data: moment, error } = await supabase
    .from('moments')
    .select('*')
    .eq('id', momentId)
    .single();

  if (error || !moment) {
    console.error('Error loading moment:', error);
    showError('Moment not found');
    return;
  }

  // Check if user is participant
  const { data: participation } = await supabase
    .from('moment_participants')
    .select('id')
    .eq('moment_id', momentId)
    .eq('user_id', currentUser.id)
    .maybeSingle();

  isParticipant = !!participation;

  // Get context badges
  const { data: context } = await supabase.rpc('get_moment_context', {
    moment_uuid: momentId,
  });

  // Load preview photos
  await loadPreviewPhotos();

  // Display moment
  document.getElementById('momentTitle').textContent = moment.title;
  document.getElementById('momentLocation').textContent = 
    `${moment.lat.toFixed(5)}, ${moment.lng.toFixed(5)}`;
  document.getElementById('momentTime').textContent = 
    `${formatDateTime(moment.starts_at)} - ${formatDateTime(moment.ends_at)}`;
  document.getElementById('participantCount').textContent = 
    `${context?.participant_count || 0}/${moment.max_participants} participants`;

  // Display badges
  const badgesContainer = document.getElementById('contextBadges');
  badgesContainer.innerHTML = '';
  if (context?.badges) {
    context.badges.forEach(badge => {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'badge';
      if (badge.toLowerCase().includes('international')) {
        badgeEl.classList.add('international');
      } else if (badge.toLowerCase().includes('english')) {
        badgeEl.classList.add('english');
      }
      badgeEl.textContent = badge;
      badgesContainer.appendChild(badgeEl);
    });
  }

  // Show appropriate buttons
  if (isParticipant) {
    document.getElementById('leaveBtn').classList.remove('hidden');
    document.getElementById('chatBtn').classList.remove('hidden');
  } else {
    const isFull = context?.participant_count >= moment.max_participants;
    if (!isFull) {
      document.getElementById('joinBtn').classList.remove('hidden');
    }
  }

  // Load participants
  await loadParticipants();

  loader.classList.add('hidden');
  content.classList.remove('hidden');
}

// Load preview photos
async function loadPreviewPhotos() {
  const { data: photos, error } = await supabase
    .from('moment_photos')
    .select('*')
    .eq('moment_id', momentId)
    .eq('is_preview', true)
    .order('uploaded_at', { ascending: true });

  if (error) {
    console.error('Error loading photos:', error);
    return;
  }

  const section = document.getElementById('previewPhotosSection');
  const container = document.getElementById('previewPhotos');
  
  if (!photos || photos.length === 0) {
    section.classList.add('hidden');
    return;
  }

  // Show photos
  section.classList.remove('hidden');
  container.innerHTML = '';

  photos.forEach(photo => {
    const photoEl = document.createElement('div');
    photoEl.className = 'preview-photo-item';
    photoEl.innerHTML = `<img src="${photo.photo_url}" alt="Moment preview">`;
    
    // Click to view full size
    photoEl.addEventListener('click', () => {
      window.open(photo.photo_url, '_blank');
    });
    
    container.appendChild(photoEl);
  });
}

// Load participants list
async function loadParticipants() {
  const { data: participants, error } = await supabase
    .from('moment_participants')
    .select(`
      id,
      user_id,
      joined_at,
      profiles:user_id (
        display_name,
        user_type,
        profile_photo_url
      )
    `)
    .eq('moment_id', momentId)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Error loading participants:', error);
    return;
  }

  const listContainer = document.getElementById('participantsList');
  listContainer.innerHTML = '';

  if (participants.length === 0) {
    listContainer.innerHTML = '<p style="color: var(--gray-600); text-align: center;">No participants yet</p>';
    return;
  }

  participants.forEach(p => {
    const profile = p.profiles;
    const item = document.createElement('div');
    item.className = 'participant-item';
    
    const initial = profile?.display_name?.charAt(0).toUpperCase() || '?';
    const profilePhotoUrl = profile?.profile_photo_url;
    
    // Create avatar HTML - show photo if available, otherwise show initial
    const avatarHTML = profilePhotoUrl 
      ? `<div class="participant-avatar"><img src="${profilePhotoUrl}" alt="${profile?.display_name}" onerror="this.style.display='none'; this.parentElement.textContent='${initial}';"></div>`
      : `<div class="participant-avatar">${initial}</div>`;
    
    item.innerHTML = `
      ${avatarHTML}
      <div class="participant-info">
        <div class="participant-name">${profile?.display_name || 'Unknown'}</div>
        <div class="participant-type">${profile?.user_type || 'user'}</div>
      </div>
    `;
    
    listContainer.appendChild(item);
  });
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  // Back button
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Join button
  document.getElementById('joinBtn').addEventListener('click', async () => {
    const { error } = await supabase
      .from('moment_participants')
      .insert({
        moment_id: momentId,
        user_id: currentUser.id,
      });

    if (error) {
      console.error('Error joining moment:', error);
      showToast('Could not join moment: ' + error.message, 'error');
    } else {
      showToast('Joined moment!', 'success');
      await loadMoment();
    }
  });

  // Leave button
  document.getElementById('leaveBtn').addEventListener('click', async () => {
    const { error } = await supabase
      .from('moment_participants')
      .delete()
      .eq('moment_id', momentId)
      .eq('user_id', currentUser.id);

    if (error) {
      console.error('Error leaving moment:', error);
      showToast('Could not leave moment: ' + error.message, 'error');
    } else {
      showToast('Left moment', 'success');
      await loadMoment();
    }
  });

  // Chat button
  document.getElementById('chatBtn').addEventListener('click', () => {
    window.location.href = `chat.html?id=${momentId}`;
  });

  // Flag button
  document.getElementById('flagBtn').addEventListener('click', () => {
    document.getElementById('flagModal').classList.remove('hidden');
  });

  document.getElementById('closeFlagModal').addEventListener('click', () => {
    document.getElementById('flagModal').classList.add('hidden');
  });

  document.getElementById('flagForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = document.getElementById('flagReason').value;

    const { error } = await supabase
      .from('flags')
      .insert({
        reporter_id: currentUser.id,
        target_type: 'moment',
        target_id: momentId,
        reason,
      });

    if (error) {
      if (error.code === '23505') {
        showToast('You already flagged this moment', 'error');
      } else {
        showToast('Error reporting moment: ' + error.message, 'error');
      }
    } else {
      showToast('Moment reported. Thank you.', 'success');
      document.getElementById('flagModal').classList.add('hidden');
    }
  });
}

// ============================================================================
// Real-time Updates
// ============================================================================

function subscribeToUpdates() {
  // Subscribe to participant changes
  supabase
    .channel(`moment-${momentId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'moment_participants',
        filter: `moment_id=eq.${momentId}`,
      },
      () => {
        loadParticipants();
      }
    )
    .subscribe();
}

// ============================================================================
// Error Handling
// ============================================================================

function showError(message) {
  document.getElementById('loader').classList.add('hidden');
  document.getElementById('momentContent').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
  document.getElementById('errorMessage').textContent = message;
}

