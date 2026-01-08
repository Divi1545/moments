import { 
  getCurrentUser, 
  getMoment,
  getMomentContext,
  getParticipants,
  isParticipant as checkParticipant,
  joinMoment,
  leaveMoment,
  getMomentPhotos,
  createSosAlert,
  createFlag,
  formatDateTime, 
  showToast 
} from './config.js';

let momentId = null;
let currentUser = null;
let isParticipant = false;

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
});

async function loadMoment() {
  const loader = document.getElementById('loader');
  const content = document.getElementById('momentContent');

  try {
    const moment = await getMoment(momentId);

    if (!moment) {
      showError('Moment not found');
      return;
    }

    isParticipant = await checkParticipant(momentId);

    const context = await getMomentContext(momentId);

    await loadPreviewPhotos();

    document.getElementById('momentTitle').textContent = moment.title;
    document.getElementById('momentLocation').textContent = 
      `${moment.lat.toFixed(5)}, ${moment.lng.toFixed(5)}`;
    document.getElementById('momentTime').textContent = 
      `${formatDateTime(moment.startsAt || moment.starts_at)} - ${formatDateTime(moment.endsAt || moment.ends_at)}`;
    document.getElementById('participantCount').textContent = 
      `${context?.participant_count || 0}/${moment.maxParticipants || moment.max_participants} participants`;

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

    if (isParticipant) {
      document.getElementById('leaveBtn').classList.remove('hidden');
      document.getElementById('chatBtn').classList.remove('hidden');
      document.getElementById('sosBtn').classList.remove('hidden');
    } else {
      const isFull = context?.participant_count >= (moment.maxParticipants || moment.max_participants);
      if (!isFull) {
        document.getElementById('joinBtn').classList.remove('hidden');
      }
    }

    await loadParticipants();

    loader.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading moment:', error);
    showError('Failed to load moment');
  }
}

async function loadPreviewPhotos() {
  try {
    const photos = await getMomentPhotos(momentId, true);

    const section = document.getElementById('previewPhotosSection');
    const container = document.getElementById('previewPhotos');
    
    if (!photos || photos.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    container.innerHTML = '';

    photos.forEach(photo => {
      const photoEl = document.createElement('div');
      photoEl.className = 'preview-photo-item';
      photoEl.innerHTML = `<img src="${photo.photoUrl || photo.photo_url}" alt="Moment preview">`;
      
      photoEl.addEventListener('click', () => {
        window.open(photo.photoUrl || photo.photo_url, '_blank');
      });
      
      container.appendChild(photoEl);
    });
  } catch (error) {
    console.error('Error loading photos:', error);
  }
}

async function loadParticipants() {
  try {
    const participants = await getParticipants(momentId);

    const listContainer = document.getElementById('participantsList');
    listContainer.innerHTML = '';

    if (participants.length === 0) {
      listContainer.innerHTML = '<p style="color: var(--gray-600); text-align: center;">No participants yet</p>';
      return;
    }

    participants.forEach(p => {
      const item = document.createElement('div');
      item.className = 'participant-item';
      
      const displayName = p.displayName || p.display_name || 'Unknown';
      const initial = displayName.charAt(0).toUpperCase();
      const profilePhotoUrl = p.profilePhotoUrl || p.profile_photo_url;
      
      const avatarHTML = profilePhotoUrl 
        ? `<div class="participant-avatar"><img src="${profilePhotoUrl}" alt="${displayName}" onerror="this.style.display='none'; this.parentElement.textContent='${initial}';"></div>`
        : `<div class="participant-avatar">${initial}</div>`;
      
      item.innerHTML = `
        ${avatarHTML}
        <div class="participant-info">
          <div class="participant-name">${displayName}</div>
          <div class="participant-type">${p.userType || p.user_type || 'user'}</div>
        </div>
      `;
      
      listContainer.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading participants:', error);
  }
}

function setupEventListeners() {
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('joinBtn').addEventListener('click', async () => {
    try {
      await joinMoment(momentId);
      showToast('Joined moment!', 'success');
      await loadMoment();
    } catch (error) {
      console.error('Error joining moment:', error);
      showToast('Could not join moment: ' + error.message, 'error');
    }
  });

  document.getElementById('leaveBtn').addEventListener('click', async () => {
    try {
      await leaveMoment(momentId);
      showToast('Left moment', 'success');
      await loadMoment();
    } catch (error) {
      console.error('Error leaving moment:', error);
      showToast('Could not leave moment: ' + error.message, 'error');
    }
  });

  document.getElementById('chatBtn').addEventListener('click', () => {
    window.location.href = `chat.html?id=${momentId}`;
  });

  document.getElementById('flagBtn').addEventListener('click', () => {
    document.getElementById('flagModal').classList.remove('hidden');
  });

  document.getElementById('closeFlagModal').addEventListener('click', () => {
    document.getElementById('flagModal').classList.add('hidden');
  });

  document.getElementById('flagForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = document.getElementById('flagReason').value;

    try {
      await createFlag('moment', momentId, reason);
      showToast('Moment reported. Thank you.', 'success');
      document.getElementById('flagModal').classList.add('hidden');
    } catch (error) {
      if (error.message.includes('duplicate')) {
        showToast('You already flagged this moment', 'error');
      } else {
        showToast('Error reporting moment: ' + error.message, 'error');
      }
    }
  });

  const sosBtn = document.getElementById('sosBtn');
  const sosModal = document.getElementById('sosModal');
  const confirmSosBtn = document.getElementById('confirmSosBtn');
  const cancelSosBtn = document.getElementById('cancelSosBtn');
  
  let sosTimer = null;
  let sosPressed = false;

  sosBtn.addEventListener('mousedown', () => {
    sosPressed = true;
    sosBtn.classList.add('pressing');
    sosTimer = setTimeout(() => {
      if (sosPressed) {
        sosModal.classList.remove('hidden');
        sosBtn.classList.remove('pressing');
      }
    }, 2000);
  });

  sosBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    sosPressed = true;
    sosBtn.classList.add('pressing');
    sosTimer = setTimeout(() => {
      if (sosPressed) {
        sosModal.classList.remove('hidden');
        sosBtn.classList.remove('pressing');
      }
    }, 2000);
  });

  sosBtn.addEventListener('mouseup', () => {
    sosPressed = false;
    clearTimeout(sosTimer);
    sosBtn.classList.remove('pressing');
  });

  sosBtn.addEventListener('touchend', () => {
    sosPressed = false;
    clearTimeout(sosTimer);
    sosBtn.classList.remove('pressing');
  });

  sosBtn.addEventListener('mouseleave', () => {
    sosPressed = false;
    clearTimeout(sosTimer);
    sosBtn.classList.remove('pressing');
  });

  confirmSosBtn.addEventListener('click', async () => {
    confirmSosBtn.disabled = true;
    confirmSosBtn.textContent = 'Sending...';

    try {
      let lat = null, lng = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000
            });
          });
          lat = position.coords.latitude;
          lng = position.coords.longitude;
        } catch (err) {
          console.warn('Could not get location:', err);
        }
      }

      await createSosAlert(momentId, lat, lng);
      showToast('ALERT SENT! Help is on the way!', 'success');
      sosModal.classList.add('hidden');
    } catch (error) {
      console.error('Error sending SOS:', error);
      showToast('Failed to send alert: ' + error.message, 'error');
    }

    confirmSosBtn.disabled = false;
    confirmSosBtn.textContent = 'Send Alert';
  });

  cancelSosBtn.addEventListener('click', () => {
    sosModal.classList.add('hidden');
  });
}

function showError(message) {
  document.getElementById('loader').classList.add('hidden');
  document.getElementById('momentContent').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
  document.getElementById('errorMessage').textContent = message;
}
