import { 
  getCurrentUser, 
  getMoment,
  getMomentContext,
  isParticipant as checkParticipant,
  getMessages,
  sendMessage,
  createFlag,
  formatTime, 
  showToast 
} from './config.js';
import { validateImage, compressImage, getPreviewUrl } from './imageUtils.js';

let momentId = null;
let currentUser = null;
let flaggedMessageId = null;
let selectedChatImage = null;
let pollInterval = null;

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

  const isParticipant = await checkParticipant(momentId);
  if (!isParticipant) {
    showError('You must join the moment to access chat');
    return;
  }

  await loadMoment();
  await loadMessages();
  setupEventListeners();
  startPolling();

  document.getElementById('loader').classList.add('hidden');
});

async function loadMoment() {
  try {
    const moment = await getMoment(momentId);

    if (!moment) {
      console.error('Moment not found');
      return;
    }

    document.getElementById('momentTitle').textContent = moment.title;

    const context = await getMomentContext(momentId);
    document.getElementById('participantCount').textContent = 
      `${context?.participant_count || 0} participants`;
  } catch (error) {
    console.error('Error loading moment:', error);
  }
}

async function loadMessages() {
  try {
    const messages = await getMessages(momentId, 100);

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

    scrollToBottom();
  } catch (error) {
    console.error('Error loading messages:', error);
    showToast('Error loading messages', 'error');
  }
}

function appendMessage(message, animate = false) {
  const messagesList = document.getElementById('messagesList');
  
  if (messagesList.querySelector('div[style*="text-align: center"]')) {
    messagesList.innerHTML = '';
  }

  const isOwn = message.userId === currentUser.id || message.user_id === currentUser.id;
  const displayName = message.profiles?.display_name || message.displayName || 'Unknown';
  const initial = displayName.charAt(0).toUpperCase();
  const profilePhotoUrl = message.profiles?.profile_photo_url || message.profilePhotoUrl;

  const messageEl = document.createElement('div');
  messageEl.className = `message ${isOwn ? 'own' : ''}`;
  messageEl.dataset.messageId = message.id;
  if (animate) {
    messageEl.style.animation = 'fadeIn 0.3s ease';
  }

  const isImage = message.content.startsWith('[IMAGE]');
  const imageUrl = isImage ? message.content.replace('[IMAGE]', '') : null;
  
  const createdAt = new Date(message.createdAt || message.created_at);
  const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
  const now = new Date();
  const timeLeft = Math.max(0, Math.floor((expiresAt - now) / 60000));

  const avatarHTML = profilePhotoUrl 
    ? `<div class="message-avatar"><img src="${profilePhotoUrl}" alt="${displayName}" onerror="this.style.display='none'; this.parentElement.textContent='${initial}';"></div>`
    : `<div class="message-avatar">${initial}</div>`;

  let contentHTML;
  if (isImage) {
    if (timeLeft <= 0) {
      contentHTML = `<div class="message-bubble expired-image">Image expired</div>`;
    } else {
      contentHTML = `
        <div class="message-bubble image-message">
          <img src="${imageUrl}" alt="Shared image" style="max-width: 200px; border-radius: 8px; display: block;">
          <div class="ephemeral-timer">Disappears in ${timeLeft} min</div>
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
        <span class="message-time">${formatTime(message.createdAt || message.created_at)}</span>
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

  if (!isOwn) {
    const flagBtn = messageEl.querySelector('.message-flag-btn');
    flagBtn.addEventListener('click', () => {
      flaggedMessageId = message.id;
      document.getElementById('flagModal').classList.remove('hidden');
    });
  }

  if (isImage && timeLeft > 0) {
    setTimeout(() => {
      const bubble = messageEl.querySelector('.message-bubble');
      if (bubble) {
        bubble.innerHTML = 'Image expired';
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

function setupEventListeners() {
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = `moment.html?id=${momentId}`;
  });

  document.getElementById('infoBtn').addEventListener('click', () => {
    window.location.href = `moment.html?id=${momentId}`;
  });

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

  const form = document.getElementById('messageForm');
  const input = document.getElementById('messageInput');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const content = input.value.trim();
    
    if (!content && !selectedChatImage) return;

    input.value = '';
    input.disabled = true;
    uploadBtn.disabled = true;

    try {
      let messageContent = content;

      if (selectedChatImage) {
        showToast('Image sharing coming soon!', 'info');
        selectedChatImage = null;
        chatImageInput.value = '';
        imagePreviewContainer.classList.add('hidden');
      }

      if (messageContent) {
        const message = await sendMessage(momentId, messageContent);
        
        const profile = await getCurrentUser();
        appendMessage({
          ...message,
          userId: currentUser.id,
          profiles: {
            display_name: 'You',
          },
        }, true);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      showToast('Could not send message: ' + error.message, 'error');
      input.value = content;
    }

    input.disabled = false;
    uploadBtn.disabled = false;
    input.focus();
  });

  document.getElementById('closeFlagModal').addEventListener('click', () => {
    document.getElementById('flagModal').classList.add('hidden');
    flaggedMessageId = null;
  });

  document.getElementById('flagForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!flaggedMessageId) return;

    const reason = document.getElementById('flagReason').value;

    try {
      await createFlag('message', flaggedMessageId, reason);
      showToast('Message reported. Thank you.', 'success');
    } catch (error) {
      if (error.message.includes('duplicate')) {
        showToast('You already flagged this message', 'error');
      } else {
        showToast('Error reporting message: ' + error.message, 'error');
      }
    }

    document.getElementById('flagModal').classList.add('hidden');
    flaggedMessageId = null;
  });
}

function startPolling() {
  pollInterval = setInterval(async () => {
    try {
      const messages = await getMessages(momentId, 100);
      const messagesList = document.getElementById('messagesList');
      const existingIds = new Set(
        Array.from(messagesList.querySelectorAll('[data-message-id]'))
          .map(el => el.dataset.messageId)
      );
      
      messages.forEach(message => {
        if (!existingIds.has(message.id)) {
          const isOwn = message.userId === currentUser.id || message.user_id === currentUser.id;
          if (!isOwn) {
            appendMessage(message, true);
          }
        }
      });
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 3000);
}

function showError(message) {
  document.getElementById('loader').classList.add('hidden');
  document.querySelector('.chat-container').classList.add('hidden');
  document.querySelector('.chat-footer').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
  document.getElementById('errorMessage').textContent = message;
}

window.addEventListener('beforeunload', () => {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
});

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
