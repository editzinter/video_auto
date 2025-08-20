'use client';

import { useState, useRef, useCallback } from 'react';
import { validateVideoFile, validateVideoDuration, formatFileSize, getVideoInfo, createVideoThumbnail, VideoInfo } from '@/utils/videoUtils';
import { transcribeVideoWithGemini, downloadSRT, TranscriptionResult } from '@/lib/gemini';

interface ProcessingStep {
    id: string;
    name: string;
    status: 'pending' | 'processing' | 'completed' | 'error';
}

export default function VideoProcessor() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
    const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [selectedFont, setSelectedFont] = useState('Roboto');
    const [addBroll, setAddBroll] = useState(false);

    const fontOptions = [
        { name: 'Default Sans-serif', value: 'DejaVu Sans' },
        { name: 'Roboto', value: 'Roboto' },
        { name: 'Lato', value: 'Lato' },
        { name: 'Open Sans', value: 'Open Sans' },
        { name: 'Montserrat', value: 'Montserrat' },
        { name: 'Source Sans Pro', value: 'Source Sans Pro' },
        { name: 'PT Sans', value: 'PT Sans' },
        { name: 'Oswald', value: 'Oswald' },
        { name: 'Merriweather', value: 'Merriweather' },
        { name: 'Playfair Display', value: 'Playfair Display' },
        { name: 'Nunito', value: 'Nunito' },
        { name: 'Raleway', value: 'Raleway' },
        { name: 'Poppins', value: 'Poppins' },
        { name: 'Ubuntu', value: 'Ubuntu' },
        { name: 'Noto Sans', value: 'Noto Sans' },
        { name: 'Rubik', value: 'Rubik' },
        { name: 'Work Sans', value: 'Work Sans' },
        { name: 'Lobster', value: 'Lobster' },
        { name: 'Pacifico', value: 'Pacifico' },
        { name: 'Caveat', value: 'Caveat' },
        { name: 'Indie Flower', value: 'Indie Flower' },
        { name: 'Zilla Slab', value: 'Zilla Slab' },
        { name: 'Arvo', value: 'Arvo' },
    ];

    const fileInputRef = useRef<HTMLInputElement>(null);

    const addLog = useCallback((message: string) => {
        setLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${message}`]);
    }, []);

    const updateStep = useCallback((id: string, updates: Partial<ProcessingStep>) => {
        setProcessingSteps(prev =>
            prev.map(step => step.id === id ? { ...step, ...updates } : step)
        );
    }, []);

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Reset state
        setError(null);
        setVideoInfo(null);
        setThumbnailUrl(null);
        setProcessedVideoUrl(null);
        setProcessingSteps([]);
        setTranscriptionResult(null);
        setLogs([]);

        // Validate file
        const validation = validateVideoFile(file);
        if (!validation.valid) {
            setError(validation.error || 'Invalid file');
            return;
        }

        setSelectedFile(file);
        addLog(`Selected file: ${file.name} (${formatFileSize(file.size)})`);

        // Get video info and thumbnail
        try {
            const [info, thumbnail] = await Promise.all([
                getVideoInfo(file),
                createVideoThumbnail(file)
            ]);

            setVideoInfo(info);
            setThumbnailUrl(thumbnail);
            addLog(`Video info: ${info.width}x${info.height}, ${info.duration.toFixed(1)}s`);
        } catch (error) {
            console.error('Failed to get video info:', error);
            addLog('Warning: Could not extract video information');
        }
    };

    const generateCaptions = async () => {
        if (!selectedFile || !videoInfo) return;

        // Validate duration before processing
        const durationValidation = validateVideoDuration(videoInfo.duration);
        if (!durationValidation.valid) {
            setError(durationValidation.error || 'Video duration exceeds limit');
            return;
        }

        setIsTranscribing(true);
        setError(null);
        addLog('Starting caption generation with Gemini 2.5 Flash...');

        try {
            const result = await transcribeVideoWithGemini(selectedFile, (progress) => {
                addLog(`Transcription progress: ${progress}%`);
            });

            setTranscriptionResult(result);
            addLog('Caption generation completed successfully!');
            addLog(`Generated ${result.segments.length} caption segments`);
        } catch (error) {
            console.error('Caption generation failed:', error);
            setError(`Caption generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            addLog(`Caption generation failed: ${error}`);
        } finally {
            setIsTranscribing(false);
        }
    };

    const processVideoWithCaptions = async () => {
        if (!selectedFile || !transcriptionResult) return;

        const steps: ProcessingStep[] = [
            { id: 'upload', name: 'Uploading to server', status: 'pending' },
            { id: 'burn', name: 'Server burning-in captions', status: 'pending' },
            { id: 'download', name: 'Downloading result', status: 'pending' },
            { id: 'complete', name: 'Processing complete', status: 'pending' },
        ];

        setProcessingSteps(steps);
        setIsLoading(true);
        addLog('Starting server-side caption burning...');

        try {
            // Step 1: Uploading
            updateStep('upload', { status: 'processing' });
            const formData = new FormData();
            formData.append('video', selectedFile);
            formData.append('srtContent', transcriptionResult.srt_content);
            formData.append('fontName', selectedFont);
            formData.append('addBroll', String(addBroll));
            addLog('Uploading video and captions to the server...');
            updateStep('upload', { status: 'completed' });

            // Step 2: Processing on server
            updateStep('burn', { status: 'processing' });
            addLog('Server is now burning captions into the video. This may take a moment...');
            const response = await fetch('/api/process', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Server processing failed');
            }
            updateStep('burn', { status: 'completed' });

            // Step 3: Downloading result
            updateStep('download', { status: 'processing' });
            addLog('Downloading processed video from server...');
            const videoBlob = await response.blob();
            const videoUrl = URL.createObjectURL(videoBlob);
            setProcessedVideoUrl(videoUrl);
            updateStep('download', { status: 'completed' });

            // Step 4: Complete
            updateStep('complete', { status: 'completed' });
            addLog('Video with burned-in captions created successfully!');

        } catch (error) {
            console.error('Server processing failed:', error);
            addLog(`Server-side processing failed: ${error}`);
            setError(`Server-side processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            const currentStep = processingSteps.find(step => step.status === 'processing');
            if (currentStep) {
                updateStep(currentStep.id, { status: 'error' });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const downloadVideo = () => {
        if (processedVideoUrl) {
            const a = document.createElement('a');
            a.href = processedVideoUrl;
            a.download = 'processed-video.mp4';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                    Auto Caption Generation
                </h2>

                {/* File Upload */}
                <div className="mb-6">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full p-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                    >
                        <div className="text-center">
                            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                {selectedFile ? selectedFile.name : 'Click to upload a video file'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-500">
                                MP4, WebM, AVI up to 1GB • Max 30 minutes duration
                            </p>
                        </div>
                    </button>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
                    </div>
                )}

                {/* Caption Generation Button */}
                {selectedFile && !error && !transcriptionResult && (
                    <button
                        onClick={generateCaptions}
                        disabled={isTranscribing}
                        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium py-3 px-4 rounded-lg transition-colors mb-4"
                    >
                        {isTranscribing ? 'Generating Captions...' : 'Generate Auto Captions with AI'}
                    </button>
                )}

                {/* Font Selection */}
                {selectedFile && !error && transcriptionResult && (
                    <div className="mb-6">
                        <label htmlFor="font-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Choose a Font Style
                        </label>
                        <select
                            id="font-select"
                            value={selectedFont}
                            onChange={(e) => setSelectedFont(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            {fontOptions.map(font => (
                                <option key={font.value} value={font.value}>
                                    {font.name}
                                </option>
                            ))}
                        </select>
                        <div className="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                            <p className="text-lg text-center text-gray-800 dark:text-gray-200" style={{ fontFamily: selectedFont, fontSize: '16px' }}>
                                The quick brown fox jumps over the lazy dog.
                            </p>
                        </div>
                    </div>
                )}

                {/* B-roll Checkbox */}
                {selectedFile && !error && transcriptionResult && (
                    <div className="mb-6">
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={addBroll}
                                onChange={(e) => setAddBroll(e.target.checked)}
                                className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Automatically Add B-roll (Experimental)
                            </span>
                        </label>
                    </div>
                )}

                {/* Process Video with Captions Button */}
                {selectedFile && !error && transcriptionResult && (
                    <button
                        onClick={processVideoWithCaptions}
                        disabled={isLoading}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                        {isLoading ? 'Adding Captions...' : '🔥 Add Captions to Video'}
                    </button>
                )}
            </div>

            {/* Video Info & Thumbnail */}
            {selectedFile && videoInfo && !error && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Video Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Thumbnail */}
                        {thumbnailUrl && (
                            <div>
                                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Preview
                                </h4>
                                <img
                                    src={thumbnailUrl}
                                    alt="Video thumbnail"
                                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600"
                                />
                            </div>
                        )}

                        {/* Video Details */}
                        <div>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Details
                            </h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">File name:</span>
                                    <span className="text-gray-900 dark:text-white font-medium">{selectedFile.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">File size:</span>
                                    <span className="text-gray-900 dark:text-white">{formatFileSize(selectedFile.size)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Resolution:</span>
                                    <span className="text-gray-900 dark:text-white">{videoInfo.width} × {videoInfo.height}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Duration:</span>
                                    <span className="text-gray-900 dark:text-white">{videoInfo.duration.toFixed(1)}s</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Format:</span>
                                    <span className="text-gray-900 dark:text-white">{videoInfo.format}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Processing Steps */}
            {processingSteps.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Processing Steps
                    </h3>
                    <div className="space-y-3">
                        {processingSteps.map((step) => (
                            <div key={step.id} className="flex items-center space-x-3">
                                <div className={`w-4 h-4 rounded-full flex-shrink-0 ${step.status === 'completed' ? 'bg-green-500' :
                                    step.status === 'processing' ? 'bg-blue-500 animate-pulse' :
                                        step.status === 'error' ? 'bg-red-500' :
                                            'bg-gray-300'
                                    }`} />
                                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                                    {step.name}
                                </span>
                                {step.status === 'completed' && (
                                    <span className="text-sm text-green-600 dark:text-green-400">✓</span>
                                )}
                                {step.status === 'error' && (
                                    <span className="text-sm text-red-600 dark:text-red-400">✗</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Generated Captions */}
            {transcriptionResult && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Generated Captions
                    </h3>
                    <div className="mb-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                            {transcriptionResult.segments.length} caption segments generated
                        </p>
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-60 overflow-y-auto">
                            {transcriptionResult.segments.slice(0, 5).map((segment, index) => (
                                <div key={index} className="mb-3 last:mb-0">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        {segment.start_time} → {segment.end_time}
                                        {segment.speaker && ` • ${segment.speaker}`}
                                    </div>
                                    <div className="text-sm text-gray-900 dark:text-white">
                                        {segment.text}
                                    </div>
                                </div>
                            ))}
                            {transcriptionResult.segments.length > 5 && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-3">
                                    ... and {transcriptionResult.segments.length - 5} more segments
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => downloadSRT(transcriptionResult.srt_content, `${selectedFile?.name.replace(/\.[^/.]+$/, '')}_captions.srt`)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                            Download SRT File
                        </button>
                    </div>
                </div>
            )}

            {/* Results */}
            {processedVideoUrl && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Video with Auto Captions
                    </h3>
                    <video
                        src={processedVideoUrl}
                        controls
                        className="w-full rounded-lg mb-4"
                    />
                    <div className="flex gap-3">
                        <button
                            onClick={downloadVideo}
                            className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                            Download Video with Captions
                        </button>
                        {transcriptionResult && (
                            <button
                                onClick={() => downloadSRT(transcriptionResult.srt_content, `${selectedFile?.name.replace(/\.[^/.]+$/, '')}_captions.srt`)}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                            >
                                Download SRT File
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Logs */}
            {logs.length > 0 && (
                <div className="bg-gray-900 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-white mb-2">Processing Logs</h3>
                    <div className="bg-black rounded p-3 h-40 overflow-y-auto">
                        {logs.map((log, index) => (
                            <div key={index} className="text-green-400 text-xs font-mono">
                                {log}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}