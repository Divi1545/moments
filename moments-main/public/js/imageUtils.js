// ============================================================================
// Image Utilities - Compression & Validation
// ============================================================================

/**
 * Validates an image file
 * @param {File} file - The file to validate
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateImage(file) {
  // Check if file exists
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  // Check file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: 'Invalid file type. Please use JPG, PNG, or WebP' 
    };
  }

  // Check file size (max 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: 'File too large. Maximum size is 5MB' 
    };
  }

  return { valid: true, error: null };
}

/**
 * Compresses and resizes an image
 * @param {File} file - The image file to compress
 * @param {number} maxWidth - Maximum width (default: 400px for avatars)
 * @param {number} quality - JPEG quality 0-1 (default: 0.85)
 * @returns {Promise<Blob>} - Compressed image as blob
 */
export async function compressImage(file, maxWidth = 400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    // Create image element
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target.result;
    };

    img.onload = () => {
      // Calculate new dimensions (maintain aspect ratio)
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      // Draw and compress
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Creates a square thumbnail (for avatars)
 * @param {File} file - The image file
 * @param {number} size - Square size (default: 200px)
 * @returns {Promise<Blob>} - Square thumbnail as blob
 */
export async function createSquareThumbnail(file, size = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target.result;
    };

    img.onload = () => {
      // Create square canvas
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext('2d');

      // Calculate crop dimensions (center crop)
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;

      // Draw cropped and resized image
      ctx.drawImage(
        img,
        sx, sy, minDim, minDim,  // Source
        0, 0, size, size          // Destination
      );

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create thumbnail'));
          }
        },
        'image/jpeg',
        0.9
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    reader.onerror = () => reject(new Error('Failed to read file'));

    reader.readAsDataURL(file);
  });
}

/**
 * Gets a preview data URL for displaying image before upload
 * @param {File} file - The image file
 * @returns {Promise<string>} - Data URL
 */
export function getPreviewUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    
    reader.readAsDataURL(file);
  });
}

/**
 * Formats file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted size (e.g., "1.5 MB")
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

