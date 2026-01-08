// ============================================================================
// Map View - Main page logic
// ============================================================================

import { supabase, mapboxToken, getCurrentUser, checkProfileExists, formatDateTime, showToast } from './config.js';
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
let sosChannel = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check if environment variables are set
  if (!mapboxToken || mapboxToken === 'YOUR_MAPBOX_TOKEN') {
    showErrorScreen('Mapbox token not configured. Please add MAPBOX_TOKEN to Replit Secrets.');
    return;
  }
  
  await initAuth();
});

// ============================================================================
// Auth Flow
// ============================================================================

async function initAuth() {
  const welcomeScreen = document.getElementById('welcomeScreen');
  const loader = document.getElementById('loader');
  
  // Show welcome screen
  welcomeScreen.classList.remove('hidden');
  
  // Set up get started button
  document.getElementById('getStartedBtn').addEventListener('click', () => {
    welcomeScreen.classList.add('hidden');
    loader.classList.remove('hidden');
    checkAuthStatus();
  });
}

async function checkAuthStatus() {
  const loader = document.getElementById('loader');
  
  // Extract tokens from URL hash BEFORE any Supabase calls
  let accessToken = null;
  let refreshToken = null;
  
  if (window.location.hash && window.location.hash.includes('access_token')) {
    console.log('Found auth tokens in URL hash');
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    accessToken = hashParams.get('access_token');
    refreshToken = hashParams.get('refresh_token');
    
    // IMMEDIATELY clear the hash to prevent Supabase from trying to process it
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  
  try {
    // If we have tokens from the URL, set the session manually
    if (accessToken && refreshToken) {
      console.log('Setting session from magic link tokens...');
      
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      
      if (error) {
        console.error('Session set error:', error);
        // Don't throw - try getSession as fallback
      } else if (data.session) {
        currentUser = data.session.user;
        console.log('User logged in via magic link:', currentUser.id);
        
        const hasProfile = await checkProfileExists(currentUser.id);
        if (!hasProfile) {
          showProfileModal();
          loader.classList.add('hidden');
        } else {
          await initApp();
          loader.classList.add('hidden');
        }
        return;
      }
    }
    
    // Normal session check (no magic link callback or token set failed)
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Auth error:', error);
      // If it's the abort error, we can ignore and show auth modal
      if (error.message && error.message.includes('abort')) {
        console.log('Ignoring abort error, showing auth modal');
        showAuthModal();
        loader.classList.add('hidden');
        return;
      }
      throw new Error('Authentication error: ' + error.message);
    }
    
    if (session) {
      currentUser = session.user;
      console.log('User logged in:', currentUser.id);
      
      try {
        const hasProfile = await Promise.race([
          checkProfileExists(currentUser.id),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Profile check timeout')), 10000))
        ]);
        
        if (!hasProfile) {
          showProfileModal();
          loader.classList.add('hidden');
        } else {
          await initApp();
          loader.classList.add('hidden');
        }
      } catch (profileError) {
        console.error('Profile check error:', profileError);
        // If profile check fails, assume no profile and show profile modal
        showProfileModal();
        loader.classList.add('hidden');
      }
    } else {
      showAuthModal();
      loader.classList.add('hidden');
    }
  } catch (error) {
    console.error('Auth error:', error);
    loader.classList.add('hidden');
    showErrorScreen('Failed to initialize: ' + error.message);
  }

  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth state changed:', event);
    
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      const hasProfile = await checkProfileExists(currentUser.id);
      
      if (!hasProfile) {
        showProfileModal();
      } else {
        showToast('Welcome back!', 'success');
        window.location.reload();
      }
    } else if (event === 'SIGNED_OUT') {
      showToast('Signed out', 'info');
      window.location.reload();
    }
  });
}

// Show auth modal
function showAuthModal() {
  const modal = document.getElementById('authModal');
  modal.classList.remove('hidden');

  const form = document.getElementById('authForm');
  const message = document.getElementById('authMessage');
  
  // Remove previous listeners to prevent duplicates
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  
  const updatedMessage = document.getElementById('authMessage');

  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    
    if (!email || !email.includes('@')) {
      updatedMessage.textContent = 'Please enter a valid email address';
      updatedMessage.style.color = 'var(--danger)';
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      updatedMessage.textContent = '✅ Check your email for the magic link!';
      updatedMessage.style.color = 'var(--success)';
      newForm.reset();
    } catch (error) {
      updatedMessage.textContent = 'Error: ' + error.message;
      updatedMessage.style.color = 'var(--danger)';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Magic Link';
    }
  });
}

// Show profile setup modal
function showProfileModal() {
  const modal = document.getElementById('profileModal');
  modal.classList.remove('hidden');

  const form = document.getElementById('profileForm');
  
  // Remove previous listeners
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);

  // Photo upload handling
  let selectedPhotoFile = null;
  
  const photoInput = document.getElementById('profilePhotoInput');
  const photoUploadContainer = document.querySelector('.photo-upload-container');
  const photoPreview = document.getElementById('photoPreview');
  const photoPreviewImg = document.getElementById('photoPreviewImg');
  const photoUploadPrompt = document.getElementById('photoUploadPrompt');

  // Click on container to trigger file input
  photoUploadContainer.addEventListener('click', () => {
    photoInput.click();
  });

  // Handle photo selection
  photoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate image
    const validation = validateImage(file);
    if (!validation.valid) {
      showToast(validation.error, 'error');
      photoInput.value = '';
      return;
    }

    try {
      // Show preview
      const previewUrl = await getPreviewUrl(file);
      photoPreviewImg.src = previewUrl;
      photoPreview.classList.remove('hidden');
      photoUploadPrompt.style.display = 'none';
      
      selectedPhotoFile = file;
      showToast('Photo selected! 📸', 'success');
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

    // Validation
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

      // Upload photo if selected
      if (selectedPhotoFile) {
        submitBtn.textContent = 'Uploading photo...';
        
        try {
          // Compress image
          const compressedBlob = await createSquareThumbnail(selectedPhotoFile, 200);
          
          // Upload to Supabase Storage
          const fileName = `${currentUser.id}/profile.jpg`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, compressedBlob, {
              cacheControl: '3600',
              upsert: true
            });

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);

          profilePhotoUrl = publicUrl;
        } catch (photoError) {
          console.error('Photo upload error:', photoError);
          showToast('Photo upload failed, continuing without photo', 'info');
          // Continue without photo
        }
      }

      submitBtn.textContent = 'Saving profile...';

      // Create profile
      const profileData = {
        id: currentUser.id,
        display_name: displayName,
        home_country: homeCountry,
        languages,
        user_type: userType,
      };

      if (profilePhotoUrl) {
        profileData.profile_photo_url = profilePhotoUrl;
        profileData.profile_photo_uploaded_at = new Date().toISOString();
      }

      const { error } = await supabase.from('profiles').insert(profileData);

      if (error) throw error;

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

// ============================================================================
// App Initialization
// ============================================================================

async function initApp() {
  try {
    // Show header and map
    document.getElementById('mainHeader').classList.remove('hidden');
    document.getElementById('map').classList.remove('hidden');
    
    await initMap();
    setupCreateMomentButton();
    setupSearch();
    await loadNearbyMoments();
    await loadSOSAlerts();
    subscribeToSOSAlerts();
  } catch (error) {
    console.error('App initialization error:', error);
    showErrorScreen('Failed to initialize app: ' + error.message);
  }
}

// Show error screen
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

// Initialize Mapbox
async function initMap() {
  try {
    mapboxgl.accessToken = mapboxToken;

    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          userLocation = [position.coords.longitude, position.coords.latitude];
          createMap(userLocation);
        },
        (error) => {
          console.warn('Geolocation error:', error);
          showToast('Location access denied. Using default location.', 'info');
          // Default to San Francisco
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
      console.log('✅ Map loaded successfully');
    });

    map.on('error', (e) => {
      console.error('Map error:', e);
      showToast('Map loading error. Please refresh.', 'error');
    });

    map.addControl(new mapboxgl.NavigationControl());
    
    // Add user location marker with pink color
    new mapboxgl.Marker({ color: '#FF6B8A' })
      .setLngLat(center)
      .addTo(map);

    // Click to select location (for creating moments)
    map.on('click', (e) => {
      // Only allow location selection when create modal is VISIBLE (not hidden)
      const createModal = document.getElementById('createModal');
      if (createModal.classList.contains('hidden')) {
        return;
      }
      
      selectedLocation = [e.lngLat.lng, e.lngLat.lat];
      const locationDisplay = document.getElementById('selectedLocation');
      locationDisplay.textContent = 
        `📍 ${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`;
      locationDisplay.classList.add('selected');
      
      // Remove previous selection marker
      if (selectionMarker) {
        selectionMarker.remove();
      }
      
      // Add new selection marker with animation
      selectionMarker = new mapboxgl.Marker({ 
        color: '#10b981',
        scale: 1.2
      })
        .setLngLat([e.lngLat.lng, e.lngLat.lat])
        .addTo(map);
      
      // Remove the selection mode indicator
      document.getElementById('map').classList.remove('selection-mode');
      
      showToast('📍 Location selected! You can tap again to change it.', 'success');
    });
  } catch (error) {
    console.error('Error creating map:', error);
    throw new Error('Map creation failed: ' + error.message);
  }
}

// ============================================================================
// Load and Display Moments
// ============================================================================

async function loadNearbyMoments(searchQuery = null) {
  if (!userLocation) return;

  // Clear existing markers
  markers.forEach(marker => marker.remove());
  markers = [];

  try {
    let moments, error;

    // Use search if query provided, otherwise use nearby
    if (searchQuery && searchQuery.trim()) {
      const result = await supabase.rpc('search_moments', {
        search_query: searchQuery.trim(),
        user_lat: userLocation[1],
        user_lng: userLocation[0],
        radius_meters: 10000, // 10km for search
        limit_count: 50,
      });
      moments = result.data;
      error = result.error;
    } else {
      const result = await supabase.rpc('get_nearby_moments', {
        user_lat: userLocation[1],
        user_lng: userLocation[0],
        radius_meters: 5000,
        limit_count: 50,
      });
      moments = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Error loading moments:', error);
      showToast('Error loading moments', 'error');
      return;
    }

    // Show message if no results
    if (!moments || moments.length === 0) {
      if (searchQuery && searchQuery.trim()) {
        showToast(`No moments found for "${searchQuery}"`, 'info');
      }
      return;
    }

    // Add markers for each moment
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

      // Create popup
      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3>${moment.title}</h3>
            <p>${formatDateTime(moment.starts_at)}</p>
            <p>👥 ${moment.participant_count}/${moment.max_participants}</p>
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

    // Show count if searching
    if (searchQuery && searchQuery.trim()) {
      showToast(`Found ${moments.length} moment${moments.length !== 1 ? 's' : ''}`, 'success');
    }
  } catch (error) {
    console.error('Error in loadNearbyMoments:', error);
    showToast('Error loading moments', 'error');
  }

  // Auto-refresh every 30 seconds (only if not searching)
  if (!searchQuery) {
    setTimeout(() => loadNearbyMoments(), 30000);
  }
}

// ============================================================================
// Search Setup
// ============================================================================

function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearch');

  if (!searchInput || !clearBtn) return;

  // Handle search input with debounce
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value;

    // Show/hide clear button
    if (query.trim()) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }

    // Debounce search (300ms)
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearchQuery = query;
      loadNearbyMoments(query);
    }, 300);
  });

  // Handle clear button
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    currentSearchQuery = '';
    clearBtn.classList.add('hidden');
    loadNearbyMoments(); // Reload default nearby moments
    showToast('Search cleared', 'info');
  });

  // Handle enter key
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      currentSearchQuery = searchInput.value;
      loadNearbyMoments(searchInput.value);
    }
  });
}

// ============================================================================
// SOS Alert Display
// ============================================================================

async function loadSOSAlerts() {
  if (!map) return;

  try {
    // Get active SOS alerts
    const { data: alerts, error } = await supabase
      .from('sos_alerts')
      .select(`
        id,
        lat,
        lng,
        created_at,
        moment_id,
        moments (title)
      `)
      .is('resolved_at', null);

    if (error) {
      console.error('Error loading SOS alerts:', error);
      return;
    }

    if (!alerts || alerts.length === 0) return;

    // Clear existing SOS markers
    sosMarkers.forEach(marker => marker.remove());
    sosMarkers = [];

    // Add SOS markers
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
      el.textContent = '🆘';

      const marker = new mapboxgl.Marker(el)
        .setLngLat([alert.lng, alert.lat])
        .addTo(map);

      // Create popup
      const popup = new mapboxgl.Popup({ offset: 30 })
        .setHTML(`
          <div style="min-width: 200px;">
            <h3 style="color: #dc2626;">🆘 EMERGENCY ALERT</h3>
            <p><strong>Moment:</strong> ${alert.moments?.title || 'Unknown'}</p>
            <p><strong>Time:</strong> ${formatDateTime(alert.created_at)}</p>
            <button 
              class="btn-primary" 
              onclick="window.location.href='moment.html?id=${alert.moment_id}'"
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

function subscribeToSOSAlerts() {
  // Subscribe to new SOS alerts
  sosChannel = supabase
    .channel('sos-alerts')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'sos_alerts'
      },
      async (payload) => {
        console.log('New SOS alert:', payload);
        await loadSOSAlerts();
        showToast('🆘 NEW EMERGENCY ALERT!', 'error');
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'sos_alerts'
      },
      async (payload) => {
        // If resolved, remove marker
        if (payload.new.resolved_at) {
          const markerIndex = sosMarkers.findIndex(m => m.id === payload.new.id);
          if (markerIndex >= 0) {
            sosMarkers[markerIndex].marker.remove();
            sosMarkers.splice(markerIndex, 1);
          }
        }
      }
    )
    .subscribe();
}

// ============================================================================
// Create Moment
// ============================================================================

function setupCreateMomentButton() {
  const createBtn = document.getElementById('createMomentBtn');
  const modal = document.getElementById('createModal');
  const closeBtn = document.getElementById('closeCreateModal');
  const form = document.getElementById('createMomentForm');

  // Set default times
  const now = new Date();
  const nowStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  const later = new Date(now.getTime() + 2 * 60 * 60000);
  const laterStr = new Date(later.getTime() - later.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  document.getElementById('startsAt').value = nowStr;
  document.getElementById('endsAt').value = laterStr;

  // Moment photo upload handling
  let selectedMomentPhoto = null;
  
  const momentPhotoInput = document.getElementById('momentPhotoInput');
  const momentPhotoContainer = document.getElementById('momentPhotoContainer');
  const momentPhotoPreview = document.getElementById('momentPhotoPreview');
  const momentPhotoPreviewImg = document.getElementById('momentPhotoPreviewImg');
  const momentPhotoPrompt = document.getElementById('momentPhotoPrompt');

  // Click to upload photo
  momentPhotoContainer.addEventListener('click', () => {
    momentPhotoInput.click();
  });

  // Handle photo selection
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
      showToast('Preview photo selected! 📸', 'success');
    } catch (error) {
      console.error('Error loading preview:', error);
      showToast('Error loading photo preview', 'error');
    }
  });

  // Capacity slider handling
  const capacitySlider = document.getElementById('maxParticipants');
  const capacityValue = document.getElementById('capacityValue');
  const capacityBadge = document.getElementById('capacityBadge');

  capacitySlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    capacityValue.textContent = value;
    
    // Update badge
    if (value <= 10) {
      capacityBadge.textContent = '🟢 Small';
      capacityBadge.className = 'capacity-badge small';
    } else if (value <= 30) {
      capacityBadge.textContent = '🟡 Medium';
      capacityBadge.className = 'capacity-badge medium';
    } else {
      capacityBadge.textContent = '🔴 Large';
      capacityBadge.className = 'capacity-badge large';
    }
  });

  createBtn.addEventListener('click', async () => {
    if (!map) {
      showToast('Map is not ready. Please wait a moment.', 'error');
      return;
    }
    
    // Check if user already has an active hosted moment
    const { data: checkResult, error } = await supabase.rpc('check_user_active_hosted_moment', {
      user_uuid: currentUser.id
    });
    
    if (error) {
      console.error('Error checking active moment:', error);
      showToast('Error checking your moments', 'error');
      return;
    }
    
    if (checkResult && checkResult.length > 0 && checkResult[0].has_active_moment) {
      showToast(`You already have an active moment: "${checkResult[0].moment_title}". End it first!`, 'error');
      return;
    }
    
    modal.classList.remove('hidden');
    
    // Enable selection mode on the map
    document.getElementById('map').classList.add('selection-mode');
    
    // Reset location display
    const locationDisplay = document.getElementById('selectedLocation');
    if (!selectedLocation) {
      locationDisplay.textContent = '👆 Tap the map above to select location';
      locationDisplay.classList.remove('selected');
    }
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    
    // Disable selection mode
    document.getElementById('map').classList.remove('selection-mode');
    
    // Reset location
    selectedLocation = null;
    const locationDisplay = document.getElementById('selectedLocation');
    locationDisplay.textContent = 'No location selected';
    locationDisplay.classList.remove('selected');
    
    // Reset photo
    selectedMomentPhoto = null;
    momentPhotoInput.value = '';
    momentPhotoPreview.classList.add('hidden');
    momentPhotoPrompt.style.display = 'flex';
    
    if (selectionMarker) {
      selectionMarker.remove();
      selectionMarker = null;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedLocation) {
      showToast('Please select a location on the map', 'error');
      return;
    }

    const title = document.getElementById('momentTitle').value.trim();
    const startsAt = new Date(document.getElementById('startsAt').value).toISOString();
    const endsAt = new Date(document.getElementById('endsAt').value).toISOString();
    const maxParticipants = parseInt(document.getElementById('maxParticipants').value);

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating moment...';

    try {
      // Create moment first
      const { data, error } = await supabase.from('moments').insert({
        title,
        location: `POINT(${selectedLocation[0]} ${selectedLocation[1]})`,
        lat: selectedLocation[1],
        lng: selectedLocation[0],
        starts_at: startsAt,
        ends_at: endsAt,
        max_participants: maxParticipants,
      }).select().single();

      if (error) throw error;

      const momentId = data.id;

      // Upload preview photo if selected
      if (selectedMomentPhoto) {
        submitBtn.textContent = 'Uploading photo...';
        
        try {
          // Compress image
          const compressedBlob = await compressImage(selectedMomentPhoto, 800, 0.85);
          
          // Upload to Supabase Storage
          const fileName = `${momentId}/preview.jpg`;
          const { error: uploadError } = await supabase.storage
            .from('moment-photos')
            .upload(fileName, compressedBlob, {
              cacheControl: '3600',
              upsert: true
            });

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('moment-photos')
            .getPublicUrl(fileName);

          // Save photo reference in database
          await supabase.from('moment_photos').insert({
            moment_id: momentId,
            uploader_id: currentUser.id,
            photo_url: publicUrl,
            is_preview: true
          });

        } catch (photoError) {
          console.error('Photo upload error:', photoError);
          showToast('Photo upload failed, moment created without photo', 'info');
        }
      }

      showToast('Moment created!', 'success');
      modal.classList.add('hidden');
      form.reset();
      selectedLocation = null;
      selectedMomentPhoto = null;
      
      // Reload moments
      await loadNearbyMoments();

      // Redirect to moment page
      setTimeout(() => {
        window.location.href = `moment.html?id=${data.id}`;
      }, 1000);

    } catch (error) {
      console.error('Error creating moment:', error);
      showToast('Error creating moment: ' + error.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Moment';
    }
  });
}

