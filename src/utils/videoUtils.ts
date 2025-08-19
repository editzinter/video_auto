// Utility functions for video processing

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  size: number;
  format: string;
}

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export const validateVideoFile = (file: File): { valid: boolean; error?: string } => {
  const maxSize = 1024 * 1024 * 1024; // 1GB for auto-captioning
  const allowedTypes = [
    'video/mp4',
    'video/webm',
    'video/avi',
    'video/mov',
    'video/quicktime',
    'video/x-msvideo',
    'video/mpeg',
    'video/mpg',
    'video/x-flv',
    'video/wmv',
    'video/3gpp'
  ];
  
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Unsupported file type. Please use MP4, WebM, AVI, MOV, or other supported video formats.'
    };
  }
  
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${formatFileSize(maxSize)} for auto-captioning.`
    };
  }
  
  return { valid: true };
};

export const validateVideoDuration = (duration: number): { valid: boolean; error?: string } => {
  const maxDurationMinutes = 30;
  const maxDurationSeconds = maxDurationMinutes * 60;
  
  if (duration > maxDurationSeconds) {
    return {
      valid: false,
      error: `Video too long. Maximum duration is ${maxDurationMinutes} minutes for auto-captioning.`
    };
  }
  
  return { valid: true };
};

export const createVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      video.currentTime = Math.min(1, video.duration / 2); // Seek to middle or 1 second
    });
    
    video.addEventListener('seeked', () => {
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(thumbnailUrl);
      } else {
        reject(new Error('Could not get canvas context'));
      }
    });
    
    video.addEventListener('error', () => {
      reject(new Error('Could not load video for thumbnail'));
    });
    
    video.src = URL.createObjectURL(file);
  });
};

export const getVideoInfo = (file: File): Promise<VideoInfo> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    
    video.addEventListener('loadedmetadata', () => {
      const info: VideoInfo = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        fps: 30, // Default, would need more complex detection for actual FPS
        size: file.size,
        format: file.type
      };
      resolve(info);
    });
    
    video.addEventListener('error', () => {
      reject(new Error('Could not load video metadata'));
    });
    
    video.src = URL.createObjectURL(file);
  });
};