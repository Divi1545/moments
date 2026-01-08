import { 
  mapboxToken, 
  getCurrentUser, 
  getSession,
  login,
  register,
  checkProfileExists, 
  createProfile,
  getNearbyMoments,
  searchMoments,
  createMoment,
  getSosAlerts,
  uploadAvatar,
  uploadMomentPhoto,
  formatDateTime, 
  showToast 
} from './config.js';
import { validateImage, createSquareThumbnail, getPreviewUrl } from './imageUtils.js';

let map = null;
let markers = [];
let sosMarkers = [];
let userLocation = null;
let selectedLocation = null;
let currentUser = null;
let selectionMarker = null;
let searchTimeout = null;
let currentSearchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {
  if (!mapboxToken || mapboxToken === 'YOUR_MAPBOX_TOKEN') {
    showErrorScreen('Mapbox token not configured. Please add MAPBOX_TOKEN to environment variables.');
    return;
  }
  
  await initAuth();
});

async function initAuth() {
  const welcomeScreen = document.getElementById('welcomeScreen');
  const loader = document.getElementById('loader');
  
  welcomeScreen.classList.remove('hidden');
  
  document.getElementById('getStartedBtn').addEventListener('click', () => {
    welcomeScreen.classList.add('hidden');
    loader.classList.remove('hidden');
    checkAuthStatus();
  });
}

async function checkAuthStatus() {
  const loader = document.getElementById('loader');
  
  try {
    const session = await getSession();
    
    if (session.user) {
      currentUser = session.user;
      console.log('User logged in:', currentUser.id);
      
      if (session.needsProfile) {
        showProfileModal();
        loader.classList.add('hidden');
      } else {
        await initApp();
        loader.classList.add('hidden');
      }
    } else {
      showAuthModal();
      loader.classList.add('hidden');
    }
  } catch (error) {
    console.error('Auth error:', error);
    loader.classList.add('hidden');
    showAuthModal();
  }
}

function showAuthModal() {
  const modal = document.getElementById('authModal');
  modal.classList.remove('hidden');

  const form = document.getElementById('authForm');
  const message = document.getElementById('authMessage');
  
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  
  const emailInput = newForm.querySelector('#email');
  
  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.id = 'password';
  passwordInput.placeholder = 'Enter your password';
  passwordInput.required = true;
  passwordInput.style.marginTop = '10px';
  
  const registerLink = document.createElement('p');
  registerLink.innerHTML = '<a href="#" id="toggleAuth" style="color: var(--primary);">Need an account? Register</a>';
  registerLink.style.marginTop = '10px';
  registerLink.style.textAlign = 'center';
  
  emailInput.after(passwordInput);
  newForm.querySelector('button[type="submit"]').before(registerLink);
  
  let isRegistering = false;
  const submitBtn = newForm.querySelector('button[type="submit"]');
  
  document.getElementById('toggleAuth').addEventListener('click', (e) => {
    e.preventDefault();
    isRegistering = !isRegistering;
    submitBtn.textContent = isRegistering ? 'Register' : 'Login';
    document.getElementById('toggleAuth').textContent = isRegistering ? 'Already have an account? Login' : 'Need an account? Register';
  });
  
  const updatedMessage = document.getElementById('authMessage');

  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !email.includes('@')) {
      updatedMessage.textContent = 'Please enter a valid email address';
      updatedMessage.style.color = 'var(--danger)';
      return;
    }

    if (!password || password.length < 6) {
      updatedMessage.textContent = 'Password must be at least 6 characters';
      updatedMessage.style.color = 'var(--danger)';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = isRegistering ? 'Registering...' : 'Logging in...';

    try {
      const result = isRegistering 
        ? await register(email, password)
        : await login(email, password);

      currentUser = result.user;
      
      if (result.needsProfile) {
        modal.classList.add('hidden');
        showProfileModal();
      } else {
        showToast('Welcome!', 'success');
        modal.classList.add('hidden');
        await initApp();
      }
    } catch (error) {
      updatedMessage.textContent = error.message;
      updatedMessage.style.color = 'var(--danger)';
      submitBtn.disabled = false;
      submitBtn.textContent = isRegistering ? 'Register' : 'Login';
    }
  });
}

function showProfileModal() {
  const modal = document.getElementById('profileModal');
  modal.classList.remove('hidden');

  const form = document.getElementById('profileForm');
  
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);

  let selectedPhotoFile = null;
  
  const photoInput = document.getElementById('profilePhotoInput');
  const photoUploadContainer = document.querySelector('.photo-upload-container');
  const photoPreview = document.getElementById('photoPreview');
  const photoPreviewImg = document.getElementById('photoPreviewImg');
  const photoUploadPrompt = document.getElementById('photoUploadPrompt');

  photoUploadContainer.addEventListener('click', () => {
    photoInput.click();
  });

  photoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validation = validateImage(file);
    if (!validation.valid) {
      showToast(validation.error, 'error');
      photoInput.value = '';
      return;
    }

    try {
      const previewUrl = await getPreviewUrl(file);
      photoPreviewImg.src = previewUrl;
      photoPreview.classList.remove('hidden');
      photoUploadPrompt.style.display = 'none';
      
      selectedPhotoFile = file;
      showToast('Photo selected!', 'success');
    } catch (error) {
      console.error('Error loading preview:', error);
      showToast('Error loading photo preview', 'error');
    }
  });

  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const displayName = document.getElementById('displayName').value.trim();
    const homeCountryRaw = document.getElementById('homeCountry').value;
    const homeCountry = homeCountryRaw === 'OTHER' ? 'XX' : homeCountryRaw;
    const userType = document.getElementById('userType').value;
    
    const languageCheckboxes = document.querySelectorAll('input[name="language"]:checked');
    const languages = Array.from(languageCheckboxes).map(cb => cb.value);

    if (!displayName || displayName.length < 2) {
      showToast('Please enter a display name (at least 2 characters)', 'error');
      return;
    }

    if (!homeCountry) {
      showToast('Please select your country', 'error');
      return;
    }

    if (languages.length === 0) {
      showToast('Please select at least 1 language', 'error');
      return;
    }

    if (languages.length > 3) {
      showToast('Please select maximum 3 languages', 'error');
      return;
    }

    if (!userType) {
      showToast('Please select your user type', 'error');
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating profile...';

    try {
      let profilePhotoUrl = null;

      if (selectedPhotoFile) {
        submitBtn.textContent = 'Uploading photo...';
        
        try {
          const compressedBlob = await createSquareThumbnail(selectedPhotoFile, 200);
          const file = new File([compressedBlob], 'profile.jpg', { type: 'image/jpeg' });
          const uploadResult = await uploadAvatar(file);
          profilePhotoUrl = uploadResult.url;
        } catch (photoError) {
          console.error('Photo upload error:', photoError);
          showToast('Photo upload failed, continuing without photo', 'info');
        }
      }

      submitBtn.textContent = 'Saving profile...';

      const profileData = {
        displayName,
        homeCountry,
        languages,
        userType,
        profilePhotoUrl,
      };

      await createProfile(profileData);

      modal.classList.add('hidden');
      showToast('Profile created!', 'success');
      await initApp();
    } catch (error) {
      console.error('Profile creation error:', error);
      showToast('Error creating profile: ' + error.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Profile';
    }
  });
}

async function initApp() {
  try {
    document.getElementById('mainHeader').classList.remove('hidden');
    document.getElementById('map').classList.remove('hidden');
    
    await initMap();
    setupCreateMomentButton();
    setupSearch();
    await loadNearbyMoments();
    await loadSOSAlerts();
  } catch (error) {
    console.error('App initialization error:', error);
    showErrorScreen('Failed to initialize app: ' + error.message);
  }
}

function showErrorScreen(message) {
  const errorScreen = document.getElementById('errorScreen');
  const errorMessage = document.getElementById('errorMessage');
  const loader = document.getElementById('loader');
  const welcomeScreen = document.getElementById('welcomeScreen');
  
  loader.classList.add('hidden');
  welcomeScreen.classList.add('hidden');
  errorMessage.textContent = message;
  errorScreen.classList.remove('hidden');
}

async function initMap() {
  try {
    mapboxgl.accessToken = mapboxToken;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          userLocation = [position.coords.longitude, position.coords.latitude];
          createMap(userLocation);
        },
        (error) => {
          console.warn('Geolocation error:', error);
          showToast('Location access denied. Using default location.', 'info');
          userLocation = [-122.4194, 37.7749];
          createMap(userLocation);
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      showToast('Geolocation not supported. Using default location.', 'info');
      userLocation = [-122.4194, 37.7749];
      createMap(userLocation);
    }
  } catch (error) {
    console.error('Map initialization error:', error);
    throw new Error('Failed to initialize map: ' + error.message);
  }
}

function createMap(center) {
  try {
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: center,
      zoom: 13,
    });

    map.on('load', () => {
      console.log('Map loaded successfully');
    });

    map.on('error', (e) => {
      console.error('Map error:', e);
      showToast('Map loading error. Please refresh.', 'error');
    });

    map.addControl(new mapboxgl.NavigationControl());
    
    new mapboxgl.Marker({ color: '#FF6B8A' })
      .setLngLat(center)
      .addTo(map);

    map.on('click', (e) => {
      const createModal = document.getElementById('createModal');
      if (createModal.classList.contains('hidden')) {
        return;
      }
      
      selectedLocation = [e.lngLat.lng, e.lngLat.lat];
      const locationDisplay = document.getElementById('selectedLocation');
      locationDisplay.textContent = 
        `Location: ${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`;
      locationDisplay.classList.add('selected');
      
      if (selectionMarker) {
        selectionMarker.remove();
      }
      
      selectionMarker = new mapboxgl.Marker({ 
        color: '#10b981',
        scale: 1.2
      })
        .setLngLat([e.lngLat.lng, e.lngLat.lat])
        .addTo(map);
      
      document.getElementById('map').classList.remove('selection-mode');
      
      showToast('Location selected! You can tap again to change it.', 'success');
    });
  } catch (error) {
    console.error('Error creating map:', error);
    throw new Error('Map creation failed: ' + error.message);
  }
}

async function loadNearbyMoments(searchQuery = null) {
  if (!userLocation) return;

  markers.forEach(marker => marker.remove());
  markers = [];

  try {
    let moments;

    if (searchQuery && searchQuery.trim()) {
      moments = await searchMoments(searchQuery.trim(), userLocation[1], userLocation[0], 10000, 50);
    } else {
      moments = await getNearbyMoments(userLocation[1], userLocation[0], 5000, 50);
    }

    if (!moments || moments.length === 0) {
      if (searchQuery && searchQuery.trim()) {
        showToast(`No moments found for "${searchQuery}"`, 'info');
      }
      return;
    }

    moments.forEach(moment => {
      const el = document.createElement('div');
      el.className = 'marker';
      el.style.cssText = `
        width: 32px;
        height: 32px;
        background: #6366f1;
        border: 3px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      `;

      const marker = new mapboxgl.Marker(el)
        .setLngLat([moment.lng, moment.lat])
        .addTo(map);

      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3>${moment.title}</h3>
            <p>${formatDateTime(moment.startsAt || moment.starts_at)}</p>
            <p>Participants: ${moment.participant_count}/${moment.maxParticipants || moment.max_participants}</p>
            <button 
              class="btn-primary" 
              onclick="window.location.href='moment.html?id=${moment.id}'"
              style="margin-top: 8px;"
            >
              View Details
            </button>
          </div>
        `);

      marker.setPopup(popup);
      markers.push(marker);
    });

    if (searchQuery && searchQuery.trim()) {
      showToast(`Found ${moments.length} moment${moments.length !== 1 ? 's' : ''}`, 'success');
    }
  } catch (error) {
    console.error('Error in loadNearbyMoments:', error);
    showToast('Error loading moments', 'error');
  }

  if (!searchQuery) {
    setTimeout(() => loadNearbyMoments(), 30000);
  }
}

function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearch');

  if (!searchInput || !clearBtn) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value;

    if (query.trim()) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearchQuery = query;
      loadNearbyMoments(query);
    }, 300);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    currentSearchQuery = '';
    clearBtn.classList.add('hidden');
    loadNearbyMoments();
    showToast('Search cleared', 'info');
  });

  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      currentSearchQuery = searchInput.value;
      loadNearbyMoments(searchInput.value);
    }
  });
}

async function loadSOSAlerts() {
  if (!map) return;

  try {
    const alerts = await getSosAlerts();

    if (!alerts || alerts.length === 0) return;

    sosMarkers.forEach(marker => marker.marker.remove());
    sosMarkers = [];

    alerts.forEach(alert => {
      if (!alert.lat || !alert.lng) return;

      const el = document.createElement('div');
      el.className = 'sos-marker';
      el.style.cssText = `
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
        border: 4px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 20px rgba(220, 38, 38, 0.6);
        animation: sosPulse 1.5s ease-in-out infinite;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      `;
      el.textContent = 'SOS';

      const marker = new mapboxgl.Marker(el)
        .setLngLat([alert.lng, alert.lat])
        .addTo(map);

      const popup = new mapboxgl.Popup({ offset: 30 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3 style="color: #dc2626;">EMERGENCY ALERT</h3>
            <p><strong>Moment:</strong> ${alert.momentTitle || 'Unknown'}</p>
            <p><strong>Time:</strong> ${formatDateTime(alert.createdAt)}</p>
            <button 
              class="btn-primary" 
              onclick="window.location.href='moment.html?id=${alert.momentId}'"
              style="margin-top: 8px; background: #dc2626;"
            >
              View Details
            </button>
          </div>
        `);

      marker.setPopup(popup);
      sosMarkers.push({ marker, id: alert.id });
    });

  } catch (error) {
    console.error('Error in loadSOSAlerts:', error);
  }
}

function setupCreateMomentButton() {
  const btn = document.getElementById('createMomentBtn');
  const modal = document.getElementById('createModal');
  const closeBtn = document.getElementById('closeCreateModal');
  const form = document.getElementById('createMomentForm');

  const now = new Date();
  const startsInput = document.getElementById('startsAt');
  const endsInput = document.getElementById('endsAt');
  
  const formatForInput = (date) => {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  
  startsInput.value = formatForInput(now);
  endsInput.value = formatForInput(new Date(now.getTime() + 2 * 60 * 60 * 1000));

  const capacitySlider = document.getElementById('maxParticipants');
  const capacityValue = document.getElementById('capacityValue');
  const capacityBadge = document.getElementById('capacityBadge');

  capacitySlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    capacityValue.textContent = value;
    
    if (value <= 10) {
      capacityBadge.textContent = 'Small';
      capacityBadge.className = 'capacity-badge small';
    } else if (value <= 30) {
      capacityBadge.textContent = 'Medium';
      capacityBadge.className = 'capacity-badge medium';
    } else {
      capacityBadge.textContent = 'Large';
      capacityBadge.className = 'capacity-badge large';
    }
  });

  btn.addEventListener('click', () => {
    selectedLocation = null;
    document.getElementById('selectedLocation').textContent = 'Tap the map above to select location';
    document.getElementById('selectedLocation').classList.remove('selected');
    if (selectionMarker) {
      selectionMarker.remove();
      selectionMarker = null;
    }
    modal.classList.remove('hidden');
    document.getElementById('map').classList.add('selection-mode');
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    document.getElementById('map').classList.remove('selection-mode');
    if (selectionMarker) {
      selectionMarker.remove();
      selectionMarker = null;
    }
  });

  let selectedMomentPhoto = null;
  const momentPhotoInput = document.getElementById('momentPhotoInput');
  const momentPhotoContainer = document.getElementById('momentPhotoContainer');
  const momentPhotoPreview = document.getElementById('momentPhotoPreview');
  const momentPhotoPreviewImg = document.getElementById('momentPhotoPreviewImg');
  const momentPhotoPrompt = document.getElementById('momentPhotoPrompt');

  momentPhotoContainer.addEventListener('click', () => {
    momentPhotoInput.click();
  });

  momentPhotoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validation = validateImage(file);
    if (!validation.valid) {
      showToast(validation.error, 'error');
      momentPhotoInput.value = '';
      return;
    }

    try {
      const previewUrl = await getPreviewUrl(file);
      momentPhotoPreviewImg.src = previewUrl;
      momentPhotoPreview.classList.remove('hidden');
      momentPhotoPrompt.style.display = 'none';
      
      selectedMomentPhoto = file;
      showToast('Photo selected!', 'success');
    } catch (error) {
      console.error('Error loading preview:', error);
      showToast('Error loading photo preview', 'error');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedLocation) {
      showToast('Please tap on the map to select a location', 'error');
      return;
    }

    const title = document.getElementById('momentTitle').value.trim();
    const startsAt = document.getElementById('startsAt').value;
    const endsAt = document.getElementById('endsAt').value;
    const maxParticipants = parseInt(document.getElementById('maxParticipants').value);

    if (!title) {
      showToast('Please enter a title', 'error');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    try {
      const moment = await createMoment({
        title,
        lat: selectedLocation[1],
        lng: selectedLocation[0],
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        maxParticipants,
      });

      if (selectedMomentPhoto) {
        submitBtn.textContent = 'Uploading photo...';
        try {
          await uploadMomentPhoto(moment.id, selectedMomentPhoto, true);
        } catch (photoError) {
          console.error('Photo upload error:', photoError);
        }
      }

      modal.classList.add('hidden');
      document.getElementById('map').classList.remove('selection-mode');
      if (selectionMarker) {
        selectionMarker.remove();
        selectionMarker = null;
      }
      
      form.reset();
      selectedMomentPhoto = null;
      momentPhotoPreview.classList.add('hidden');
      momentPhotoPrompt.style.display = 'flex';

      showToast('Moment created!', 'success');
      await loadNearbyMoments();
      
      window.location.href = `moment.html?id=${moment.id}`;
    } catch (error) {
      console.error('Error creating moment:', error);
      showToast('Error creating moment: ' + error.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Moment';
    }
  });
}

const sosStyle = document.createElement('style');
sosStyle.textContent = `
  @keyframes sosPulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
  }
`;
document.head.appendChild(sosStyle);
