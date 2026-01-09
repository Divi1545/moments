// ============================================================================
// Map View - Main page logic
// ============================================================================

import { supabase, mapboxToken, getCurrentUser, checkProfileExists, formatDateTime, showToast } from './config.js';
import { validateImage, compressImage, createSquareThumbnail, getPreviewUrl } from './imageUtils.js';

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
let isSelectingLocation = false;
let tempFormData = {};

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

// Register auth state change listener ONCE at module level
let authListenerRegistered = false;

async function checkAuthStatus() {
  const loader = document.getElementById('loader');
  
  // Register listener only once
  if (!authListenerRegistered) {
    authListenerRegistered = true;
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);
      
      if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        const hasProfile = await checkProfileExists(currentUser.id);
        
        if (!hasProfile) {
          showProfileModal();
        } else {
          showToast('Welcome back!', 'success');
          await initApp();
          loader.classList.add('hidden');
        }
      } else if (event === 'SIGNED_OUT') {
        showToast('Signed out', 'info');
        window.location.reload();
      }
    });
  }
  
  try {
    // Let Supabase handle auth automatically - just check current session
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Auth error:', error);
      // Show auth modal on any error
      showAuthModal();
      loader.classList.add('hidden');
      return;
    }
    
    if (session) {
      currentUser = session.user;
      console.log('User logged in:', currentUser.id);
      
      const hasProfile = await checkProfileExists(currentUser.id);
      
      if (!hasProfile) {
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

// Show auth modal with OTP flow
let authPendingEmail = '';

function showAuthModal() {
  const modal = document.getElementById('authModal');
  modal.classList.remove('hidden');

  const emailStep = document.getElementById('emailStep');
  const otpStep = document.getElementById('otpStep');
  const emailInput = document.getElementById('email');
  const otpInput = document.getElementById('otpCode');
  const message = document.getElementById('authMessage');
  
  // Reset state when modal opens
  authPendingEmail = '';
  emailInput.value = '';
  otpInput.value = '';
  
  // Get fresh button references
  let sendBtn = document.getElementById('sendCodeBtn');
  let verifyBtn = document.getElementById('verifyCodeBtn');
  let resendBtn = document.getElementById('resendCodeBtn');
  
  // Clone buttons to remove old handlers
  const newSendBtn = sendBtn.cloneNode(true);
  const newVerifyBtn = verifyBtn.cloneNode(true);
  const newResendBtn = resendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
  verifyBtn.parentNode.replaceChild(newVerifyBtn, verifyBtn);
  resendBtn.parentNode.replaceChild(newResendBtn, resendBtn);

  // Reset form handler
  const form = document.getElementById('authForm');
  form.onsubmit = null;

  // Reset to email step
  emailStep.classList.remove('hidden');
  otpStep.classList.add('hidden');
  message.textContent = '';

  // Send OTP code
  async function sendOtpCode() {
    const email = emailInput.value.trim();
    const btn = document.getElementById('sendCodeBtn');
    
    if (!email || !email.includes('@')) {
      message.textContent = 'Please enter a valid email address';
      message.style.color = 'var(--danger)';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true
        }
      });

      if (error) throw error;

      authPendingEmail = email;
      emailStep.classList.add('hidden');
      otpStep.classList.remove('hidden');
      message.textContent = '✅ Check your email for your 8-digit code!';
      message.style.color = 'var(--success)';
      otpInput.value = '';
      otpInput.focus();
    } catch (error) {
      if (error.message?.includes('rate') || error.message?.includes('limit')) {
        message.textContent = 'Please wait a moment before requesting another code.';
      } else {
        message.textContent = 'Error: ' + error.message;
      }
      message.style.color = 'var(--danger)';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Code';
    }
  }

  // Verify OTP code
  async function verifyOtpCode() {
    const otpCode = otpInput.value.trim();
    const btn = document.getElementById('verifyCodeBtn');
    
    if (!otpCode || otpCode.length !== 8 || !/^\d{8}$/.test(otpCode)) {
      message.textContent = 'Please enter a valid 8-digit code';
      message.style.color = 'var(--danger)';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Verifying...';

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: authPendingEmail,
        token: otpCode,
        type: 'email'
      });

      if (error) throw error;

      message.textContent = '✅ Success! Signing you in...';
      message.style.color = 'var(--success)';
      
      // The onAuthStateChange listener registered in checkAuthStatus() will handle the rest
      modal.classList.add('hidden');
    } catch (error) {
      message.textContent = 'Invalid or expired code. Please try again.';
      message.style.color = 'var(--danger)';
      otpInput.value = '';
      otpInput.focus();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Verify Code';
    }
  }

  // Resend OTP code
  async function resendOtpCode() {
    const btn = document.getElementById('resendCodeBtn');
    
    if (!authPendingEmail) {
      otpStep.classList.add('hidden');
      emailStep.classList.remove('hidden');
      message.textContent = '';
      emailInput.focus();
      return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Sending...';
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authPendingEmail,
        options: {
          shouldCreateUser: true
        }
      });

      if (error) throw error;

      message.textContent = '✅ New code sent! Check your email.';
      message.style.color = 'var(--success)';
      otpInput.value = '';
      otpInput.focus();
    } catch (error) {
      if (error.message?.includes('rate') || error.message?.includes('limit')) {
        message.textContent = 'Please wait a moment before requesting another code.';
      } else {
        message.textContent = 'Error: ' + error.message;
      }
      message.style.color = 'var(--danger)';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Resend Code';
    }
  }

  // Event listeners
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!otpStep.classList.contains('hidden')) {
      verifyOtpCode();
    } else {
      sendOtpCode();
    }
  };

  newVerifyBtn.onclick = verifyOtpCode;
  newResendBtn.onclick = resendOtpCode;
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
    setupMyMomentsButton();
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
      // Only allow location selection when in selection mode
      if (!isSelectingLocation) {
        return;
      }
      
      selectedLocation = [e.lngLat.lng, e.lngLat.lat];
      
      // Remove previous selection marker
      if (selectionMarker) {
        selectionMarker.remove();
      }
      
      // Add new selection marker
      selectionMarker = new mapboxgl.Marker({ 
        color: '#10b981',
        scale: 1.2
      })
        .setLngLat([e.lngLat.lng, e.lngLat.lat])
        .addTo(map);
      
      // Exit selection mode
      isSelectingLocation = false;
      map.getCanvas().style.cursor = '';
      document.getElementById('map').classList.remove('selection-mode');
      
      // Reopen the create modal
      const modal = document.getElementById('createModal');
      modal.classList.remove('hidden');
      
      // Restore saved form data
      if (tempFormData.title) document.getElementById('momentTitle').value = tempFormData.title;
      if (tempFormData.startsAt) document.getElementById('startsAt').value = tempFormData.startsAt;
      if (tempFormData.endsAt) document.getElementById('endsAt').value = tempFormData.endsAt;
      if (tempFormData.maxParticipants) document.getElementById('maxParticipants').value = tempFormData.maxParticipants;
      
      // Update location display
      const locationDisplay = document.getElementById('selectedLocation');
      locationDisplay.textContent = `📍 ${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`;
      locationDisplay.classList.add('selected');
      
      showToast('Location selected!', 'success');
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

    // Query moments directly to get creator_id for highlighting
    let query = supabase
      .from('moments')
      .select('id, title, lat, lng, starts_at, ends_at, max_participants, creator_id')
      .eq('status', 'active')
      .gt('ends_at', new Date().toISOString());

    // Apply search filter
    if (searchQuery && searchQuery.trim()) {
      query = query.ilike('title', `%${searchQuery.trim()}%`);
    }

    const result = await query.order('starts_at', { ascending: true }).limit(50);
    moments = result.data;
    error = result.error;

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

    // Get participant counts for all moments
    const momentIds = moments.map(m => m.id);
    const { data: participantCounts } = await supabase
      .from('moment_participants')
      .select('moment_id')
      .in('moment_id', momentIds);

    const countMap = {};
    participantCounts?.forEach(p => {
      countMap[p.moment_id] = (countMap[p.moment_id] || 0) + 1;
    });

    // Add markers for each moment
    moments.forEach(moment => {
      const participantCount = countMap[moment.id] || 0;
      const isUserMoment = moment.creator_id === currentUser?.id;

      const el = document.createElement('div');
      el.className = 'marker';
      el.style.cssText = `
        width: 32px;
        height: 32px;
        background: ${isUserMoment ? '#fbbf24' : '#6366f1'};
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
            ${isUserMoment ? '<p style="color: #fbbf24; font-weight: bold;">⭐ Your Moment</p>' : ''}
            <p>${formatDateTime(moment.starts_at)}</p>
            <p>👥 ${participantCount}/${moment.max_participants}</p>
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

  createBtn.addEventListener('click', () => {
    if (!map) {
      showToast('Map is not ready. Please wait a moment.', 'error');
      return;
    }
    
    modal.classList.remove('hidden');
    
    // Update location display based on whether location is already selected
    const locationDisplay = document.getElementById('selectedLocation');
    if (selectedLocation) {
      locationDisplay.textContent = `📍 ${selectedLocation[1].toFixed(5)}, ${selectedLocation[0].toFixed(5)}`;
      locationDisplay.classList.add('selected');
    } else {
      locationDisplay.textContent = 'No location selected yet';
      locationDisplay.classList.remove('selected');
    }
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    
    // Disable selection mode
    isSelectingLocation = false;
    map.getCanvas().style.cursor = '';
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
    
    // Reset temp form data
    tempFormData = {};
    
    if (selectionMarker) {
      selectionMarker.remove();
      selectionMarker = null;
    }
  });

  // Select Location button handler
  document.getElementById('selectLocationBtn').addEventListener('click', () => {
    // Save current form data
    tempFormData = {
      title: document.getElementById('momentTitle').value,
      startsAt: document.getElementById('startsAt').value,
      endsAt: document.getElementById('endsAt').value,
      maxParticipants: document.getElementById('maxParticipants').value
    };
    
    // Hide modal
    modal.classList.add('hidden');
    
    // Enable location selection mode
    isSelectingLocation = true;
    map.getCanvas().style.cursor = 'crosshair';
    document.getElementById('map').classList.add('selection-mode');
    
    showToast('Tap the map to select a location', 'info');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedLocation) {
      showToast('Please select a location on the map', 'error');
      return;
    }

    // Verify user is still authenticated
    if (!currentUser) {
      const user = await getCurrentUser();
      if (!user) {
        showToast('Please log in again to create a moment', 'error');
        return;
      }
      currentUser = user;
    }

    const title = document.getElementById('momentTitle').value.trim();
    const startsAt = new Date(document.getElementById('startsAt').value).toISOString();
    const endsAt = new Date(document.getElementById('endsAt').value).toISOString();
    const maxParticipants = parseInt(document.getElementById('maxParticipants').value);

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating moment...';

    try {
      console.log('Creating moment with:', { title, startsAt, endsAt, maxParticipants, selectedLocation });
      
      // Create moment first
      const { data, error } = await supabase.from('moments').insert({
        title,
        creator_id: currentUser.id,
        location: `POINT(${selectedLocation[0]} ${selectedLocation[1]})`,
        lat: selectedLocation[1],
        lng: selectedLocation[0],
        starts_at: startsAt,
        ends_at: endsAt,
        max_participants: maxParticipants,
      }).select().single();

      if (error) throw error;

      const momentId = data.id;

      // Auto-join creator as participant
      await supabase.from('moment_participants').insert({
        moment_id: momentId,
        user_id: currentUser.id
      });

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

// ============================================================================
// My Moments Feature
// ============================================================================

function setupMyMomentsButton() {
  const myMomentsBtn = document.getElementById('myMomentsBtn');
  const modal = document.getElementById('myMomentsModal');
  const closeBtn = document.getElementById('closeMyMomentsModal');

  if (!myMomentsBtn || !modal || !closeBtn) return;

  myMomentsBtn.addEventListener('click', async () => {
    await loadMyMoments();
    modal.classList.remove('hidden');
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
}

async function loadMyMoments() {
  if (!currentUser) return;

  try {
    // Load moments user is hosting (creator)
    const { data: hosting, error: hostingError } = await supabase
      .from('moments')
      .select('id, title, starts_at, ends_at, status, lat, lng')
      .eq('creator_id', currentUser.id)
      .eq('status', 'active')
      .order('starts_at', { ascending: true });

    if (hostingError) throw hostingError;

    // Load moments user has joined
    const { data: joined, error: joinedError } = await supabase
      .from('moment_participants')
      .select(`
        moment_id,
        moments (
          id,
          title,
          starts_at,
          ends_at,
          status,
          creator_id,
          lat,
          lng
        )
      `)
      .eq('user_id', currentUser.id);

    if (joinedError) throw joinedError;

    // Display hosting moments
    const hostingContainer = document.getElementById('hostingMoments');
    hostingContainer.innerHTML = '';

    if (!hosting || hosting.length === 0) {
      hostingContainer.innerHTML = '<p class="empty-state">You haven\'t created any moments yet</p>';
    } else {
      hosting.forEach(moment => {
        const momentEl = createMomentListItem(moment);
        hostingContainer.appendChild(momentEl);
      });
    }

    // Display joined moments (excluding ones user created)
    const joinedContainer = document.getElementById('joinedMoments');
    joinedContainer.innerHTML = '';

    const joinedMoments = joined
      ?.map(j => j.moments)
      .filter(m => m && m.status === 'active' && m.creator_id !== currentUser.id);

    if (!joinedMoments || joinedMoments.length === 0) {
      joinedContainer.innerHTML = '<p class="empty-state">You haven\'t joined any moments yet</p>';
    } else {
      joinedMoments.forEach(moment => {
        const momentEl = createMomentListItem(moment);
        joinedContainer.appendChild(momentEl);
      });
    }

  } catch (error) {
    console.error('Error loading my moments:', error);
    showToast('Error loading your moments', 'error');
  }
}

function createMomentListItem(moment) {
  const div = document.createElement('div');
  div.className = 'moment-list-item';
  
  const startsAt = new Date(moment.starts_at);
  const endsAt = new Date(moment.ends_at);
  const now = new Date();
  
  const isHappening = now >= startsAt && now <= endsAt;
  const statusBadge = isHappening ? '<span class="status-badge live">🔴 Live</span>' : '<span class="status-badge upcoming">📅 Upcoming</span>';
  
  div.innerHTML = `
    <div class="moment-list-item-content">
      <h4>${moment.title}</h4>
      <p class="moment-time">${formatDateTime(moment.starts_at)}</p>
      ${statusBadge}
    </div>
    <button class="btn-primary btn-small">View</button>
  `;
  
  div.querySelector('button').addEventListener('click', () => {
    window.location.href = `moment.html?id=${moment.id}`;
  });
  
  return div;
}

