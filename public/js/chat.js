// ============================================================================
// Chat Page Logic - Real-time Group Chat
// ============================================================================

import { supabase, getCurrentUser, formatTime, showToast } from './config.js';
import { validateImage, compressImage, getPreviewUrl } from './imageUtils.js';

let momentId = null;
let currentUser = null;
let messagesChannel = null;
let flaggedMessageId = null;
let selectedChatImage = null;

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

  // Verify user is a participant
  const { data: participation } = await supabase
    .from('moment_participants')
    .select('id')
    .eq('moment_id', momentId)
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (!participation) {
    showError('You must join the moment to access chat');
    return;
  }

  await loadMoment();
  await loadMessages();
  setupEventListeners();
  subscribeToMessages();

  document.getElementById('loader').classList.add('hidden');
});

// ============================================================================
// Load Data
// ============================================================================

async function loadMoment() {
  const { data: moment, error } = await supabase
    .from('moments')
    .select('title')
    .eq('id', momentId)
    .single();

  if (error || !moment) {
    console.error('Error loading moment:', error);
    return;
  }

  document.getElementById('momentTitle').textContent = moment.title;

  // Get participant count
  const { data: context } = await supabase.rpc('get_moment_context', {
    moment_uuid: momentId,
  });

  document.getElementById('participantCount').textContent = 
    `${context?.participant_count || 0} participants`;
}

async function loadMessages() {
  const { data: messages, error } = await supabase
    .from('moment_messages')
    .select(`
      id,
      content,
      created_at,
      user_id,
      profiles:user_id (
        display_name,
        profile_photo_url
      )
    `)
    .eq('moment_id', momentId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('Error loading messages:', error);
    showToast('Error loading messages', 'error');
    return;
  }

  const messagesList = document.getElementById('messagesList');
  messagesList.innerHTML = '';

  if (messages.length === 0) {
    messagesList.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--gray-600);">
        <p>No messages yet. Start the conversation!</p>
      </div>
    `;
    return;
  }

  messages.forEach(message => {
    appendMessage(message);
  });

  // Scroll to bottom
  scrollToBottom();
}

// ============================================================================
// Message Display
// ============================================================================

function appendMessage(message, animate = false) {
  const messagesList = document.getElementById('messagesList');
  
  // Remove empty state if exists
  if (messagesList.querySelector('div[style*="text-align: center"]')) {
    messagesList.innerHTML = '';
  }

  const isOwn = message.user_id === currentUser.id;
  const displayName = message.profiles?.display_name || 'Unknown';
  const initial = displayName.charAt(0).toUpperCase();
  const profilePhotoUrl = message.profiles?.profile_photo_url;

  const messageEl = document.createElement('div');
  messageEl.className = `message ${isOwn ? 'own' : ''}`;
  if (animate) {
    messageEl.style.animation = 'fadeIn 0.3s ease';
  }

  // Check if message is an image
  const isImage = message.content.startsWith('[IMAGE]');
  const imageUrl = isImage ? message.content.replace('[IMAGE]', '') : null;
  
  // Calculate time until disappears (5 minutes from creation)
  const createdAt = new Date(message.created_at);
  const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
  const now = new Date();
  const timeLeft = Math.max(0, Math.floor((expiresAt - now) / 60000)); // minutes

  // Create avatar HTML - show photo if available, otherwise show initial
  const avatarHTML = profilePhotoUrl 
    ? `<div class="message-avatar"><img src="${profilePhotoUrl}" alt="${displayName}" onerror="this.style.display='none'; this.parentElement.textContent='${initial}';"></div>`
    : `<div class="message-avatar">${initial}</div>`;

  // Create content HTML
  let contentHTML;
  if (isImage) {
    // Check if image expired
    if (timeLeft <= 0) {
      contentHTML = `<div class="message-bubble expired-image">🚫 Image expired</div>`;
    } else {
      contentHTML = `
        <div class="message-bubble image-message">
          <img src="${imageUrl}" alt="Shared image" style="max-width: 200px; border-radius: 8px; display: block;">
          <div class="ephemeral-timer">⏱️ Disappears in ${timeLeft} min</div>
        </div>
      `;
    }
  } else {
    contentHTML = `<div class="message-bubble">${escapeHtml(message.content)}</div>`;
  }

  messageEl.innerHTML = `
    ${avatarHTML}
    <div class="message-content">
      <div class="message-header">
        <span class="message-sender">${displayName}</span>
        <span class="message-time">${formatTime(message.created_at)}</span>
      </div>
      ${contentHTML}
      ${!isOwn ? `
        <div class="message-actions">
          <button class="message-flag-btn" data-message-id="${message.id}">Report</button>
        </div>
      ` : ''}
    </div>
  `;

  messagesList.appendChild(messageEl);

  // Add flag listener
  if (!isOwn) {
    const flagBtn = messageEl.querySelector('.message-flag-btn');
    flagBtn.addEventListener('click', () => {
      flaggedMessageId = message.id;
      document.getElementById('flagModal').classList.remove('hidden');
    });
  }

  // Auto-hide expired images
  if (isImage && timeLeft > 0) {
    setTimeout(() => {
      const bubble = messageEl.querySelector('.message-bubble');
      if (bubble) {
        bubble.innerHTML = '🚫 Image expired';
        bubble.classList.add('expired-image');
      }
    }, timeLeft * 60 * 1000);
  }

  scrollToBottom();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  const messagesList = document.getElementById('messagesList');
  messagesList.scrollTop = messagesList.scrollHeight;
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  // Back button
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = `moment.html?id=${momentId}`;
  });

  // Info button
  document.getElementById('infoBtn').addEventListener('click', () => {
    window.location.href = `moment.html?id=${momentId}`;
  });

  // Image upload button
  const uploadBtn = document.getElementById('uploadImageBtn');
  const chatImageInput = document.getElementById('chatImageInput');
  const imagePreviewContainer = document.getElementById('imagePreviewContainer');
  const imagePreview = document.getElementById('imagePreview');
  const removeImageBtn = document.getElementById('removeImageBtn');

  uploadBtn.addEventListener('click', () => {
    chatImageInput.click();
  });

  chatImageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validation = validateImage(file);
    if (!validation.valid) {
      showToast(validation.error, 'error');
      chatImageInput.value = '';
      return;
    }

    try {
      const previewUrl = await getPreviewUrl(file);
      imagePreview.src = previewUrl;
      imagePreviewContainer.classList.remove('hidden');
      selectedChatImage = file;
      showToast('Image selected! Click Send to share.', 'success');
    } catch (error) {
      console.error('Error loading image:', error);
      showToast('Error loading image', 'error');
    }
  });

  removeImageBtn.addEventListener('click', () => {
    chatImageInput.value = '';
    selectedChatImage = null;
    imagePreviewContainer.classList.add('hidden');
  });

  // Message form
  const form = document.getElementById('messageForm');
  const input = document.getElementById('messageInput');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const content = input.value.trim();
    
    // Must have either text or image
    if (!content && !selectedChatImage) return;

    // Disable inputs
    input.value = '';
    input.disabled = true;
    uploadBtn.disabled = true;

    try {
      let photoUrl = null;

      // Upload image if selected
      if (selectedChatImage) {
        showToast('Uploading image...', 'info');
        
        // Compress image
        const compressedBlob = await compressImage(selectedChatImage, 800, 0.8);
        
        // Upload to storage
        const fileName = `${momentId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('moment-photos')
          .upload(fileName, compressedBlob, {
            contentType: 'image/jpeg',
            cacheControl: '300' // 5 minutes cache
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw new Error('Failed to upload image');
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('moment-photos')
          .getPublicUrl(fileName);
        
        photoUrl = publicUrl;

        // Save to moment_photos table
        await supabase
          .from('moment_photos')
          .insert({
            moment_id: momentId,
            uploader_id: currentUser.id,
            photo_url: fileName,
            is_preview: false
          });
      }

      // Send message (either text or image URL)
      const messageContent = photoUrl ? `[IMAGE]${photoUrl}` : content;
      
      const { error } = await supabase
        .from('moment_messages')
        .insert({
          moment_id: momentId,
          user_id: currentUser.id,
          content: messageContent,
        });

      if (error) throw error;

      // Clear image selection
      if (selectedChatImage) {
        chatImageInput.value = '';
        selectedChatImage = null;
        imagePreviewContainer.classList.add('hidden');
      }

    } catch (error) {
      console.error('Error sending message:', error);
      showToast('Could not send message: ' + error.message, 'error');
      input.value = content; // Restore message
    }

    input.disabled = false;
    uploadBtn.disabled = false;
    input.focus();
  });

  // Flag modal
  document.getElementById('closeFlagModal').addEventListener('click', () => {
    document.getElementById('flagModal').classList.add('hidden');
    flaggedMessageId = null;
  });

  document.getElementById('flagForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!flaggedMessageId) return;

    const reason = document.getElementById('flagReason').value;

    const { error } = await supabase
      .from('flags')
      .insert({
        reporter_id: currentUser.id,
        target_type: 'message',
        target_id: flaggedMessageId,
        reason,
      });

    if (error) {
      if (error.code === '23505') {
        showToast('You already flagged this message', 'error');
      } else {
        showToast('Error reporting message: ' + error.message, 'error');
      }
    } else {
      showToast('Message reported. Thank you.', 'success');
    }

    document.getElementById('flagModal').classList.add('hidden');
    flaggedMessageId = null;
  });
}

// ============================================================================
// Real-time Subscriptions
// ============================================================================

function subscribeToMessages() {
  messagesChannel = supabase
    .channel(`chat-${momentId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'moment_messages',
        filter: `moment_id=eq.${momentId}`,
      },
      async (payload) => {
        // Fetch the full message with profile data
        const { data: message } = await supabase
          .from('moment_messages')
          .select(`
            id,
            content,
            created_at,
            user_id,
            profiles:user_id (
              display_name,
              profile_photo_url
            )
          `)
          .eq('id', payload.new.id)
          .single();

        if (message && message.user_id !== currentUser.id) {
          appendMessage(message, true);
        }
      }
    )
    .subscribe();
}

// ============================================================================
// Error Handling
// ============================================================================

function showError(message) {
  document.getElementById('loader').classList.add('hidden');
  document.querySelector('.chat-container').classList.add('hidden');
  document.querySelector('.chat-footer').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
  document.getElementById('errorMessage').textContent = message;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (messagesChannel) {
    supabase.removeChannel(messagesChannel);
  }
});

// Add fade-in animation
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
document.head.appendChild(style);

