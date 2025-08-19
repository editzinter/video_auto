'use client';

import VideoProcessor from '@/components/VideoProcessor';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            AI Auto Caption Generator
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Upload your videos and automatically generate accurate captions using Google's Gemini 2.5 Flash AI model.
            Support for videos up to 30 minutes and 1GB in size. Download SRT files or videos with burned-in captions.
          </p>
        </header>
        
        <VideoProcessor />
      </div>
    </div>
  );
}