'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { validateVideoFile, validateVideoDuration, formatFileSize, getVideoInfo, createVideoThumbnail, VideoInfo } from '@/utils/videoUtils';
import { transcribeVideoWithGemini, downloadSRT, TranscriptionResult } from '@/lib/gemini';

interface ProcessingStep {
    id: string;
    name: string;
    status: 'pending' | 'processing' | 'completed' | 'error';
    progress?: number;
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

    // --- Settings State ---
    const [selectedFont, setSelectedFont] = useState('Roboto');
    const [addBroll, setAddBroll] = useState(false);

    const fonts = [
        'Roboto', 'Lato', 'DejaVu Sans', 'Open Sans', 'Montserrat',
        'Source Sans Pro', 'PT Sans', 'Oswald', 'Merriweather', 'Playfair Display',
        'Nunito', 'Raleway', 'Poppins', 'Ubuntu', 'Noto Sans', 'Rubik', 'Work Sans',
        'Lobster', 'Pacifico', 'Caveat', 'Indie Flower', 'Zilla Slab', 'Arvo'
    ];

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fontQuery = fonts.map(f => `family=${f.replace(/ /g, '+')}`).join('&');
        const link = document.createElement('link');
        link.href = `https://fonts.googleapis.com/css2?${fontQuery}&display=swap`;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    }, [fonts]);

    const addLog = useCallback((message: string) => {
        setLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${message}`]);
    }, []);

    const updateStep = useCallback((id: string, updates: Partial<ProcessingStep>) => {
        setProcessingSteps(prev =>
            prev.map(step => step.id === id ? { ...step, ...updates } : step)
        );
    }, []);

    const processVideoWithServer = async () => {
        if (!selectedFile || !transcriptionResult) return;

        const formData = new FormData();
        formData.append('video', selectedFile);
        formData.append('srtContent', transcriptionResult.srt_content);
        formData.append('fontName', selectedFont);
        formData.append('addBroll', String(addBroll));

        const steps: ProcessingStep[] = [
            { id: 'upload', name: 'Uploading to server', status: 'pending' },
            { id: 'process', name: 'Processing video', status: 'pending' },
            { id: 'complete', name: 'Processing complete', status: 'pending' },
        ];

        setProcessingSteps(steps);
        setIsLoading(true);
        updateStep('upload', { status: 'processing' });
        addLog('Uploading video to server...');

        try {
            const response = await fetch('/api/process', {
                method: 'POST',
                body: formData,
            });

            updateStep('upload', { status: 'completed' });
            updateStep('process', { status: 'processing' });
            addLog('Video uploaded, starting processing...');

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Processing failed');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setProcessedVideoUrl(url);
            updateStep('process', { status: 'completed' });
            updateStep('complete', { status: 'completed' });
            addLog('Video with captions created successfully!');

        } catch (error) {
            console.error('Processing failed:', error);
            addLog(`Processing failed: ${error}`);
            const currentStep = processingSteps.find(step => step.status === 'processing');
            if (currentStep) {
                updateStep(currentStep.id, { status: 'error' });
            }
        } finally {
            setIsLoading(false);
        }
    };

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

    const LeftColumn = () => (
        <div className="space-y-6">
            {/* File Upload */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    1. Upload Video
                </h2>
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
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
                </div>
            )}

            {/* Actions */}
            {selectedFile && !error && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        2. AI Tools
                    </h2>

                    {!transcriptionResult ? (
                        <button
                            onClick={generateCaptions}
                            disabled={isTranscribing}
                            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                        >
                            {isTranscribing ? 'Generating Captions...' : 'Generate Auto Captions'}
                        </button>
                    ) : (
                        <div className='space-y-4'>
                            {/* Settings */}
                            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                    Settings
                                </h3>
                                <div className="space-y-4">
                                    {/* Font Selection */}
                                    <div>
                                        <label htmlFor="font-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Caption Font
                                        </label>
                                        <select
                                            id="font-select"
                                            value={selectedFont}
                                            onChange={(e) => setSelectedFont(e.target.value)}
                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            style={{ fontFamily: selectedFont }}
                                        >
                                            {fonts.map(font => (
                                                <option key={font} value={font} style={{ fontFamily: font }}>
                                                    {font}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {/* B-Roll Checkbox */}
                                    <div>
                                        <label htmlFor="broll-checkbox" className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                            <input
                                                type="checkbox"
                                                id="broll-checkbox"
                                                checked={addBroll}
                                                onChange={(e) => setAddBroll(e.target.checked)}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span>Add Automatic B-roll (Experimental)</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={processVideoWithServer}
                                disabled={isLoading}
                                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                            >
                                {isLoading ? `Adding Captions...` : `Create Video with Captions`}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Processing Steps */}
            {processingSteps.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
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

    const RightColumn = () => (
        <div className="space-y-6">
            {/* Video Info & Thumbnail */}
            {selectedFile && videoInfo && !error && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Video Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
            )}

            {/* Generated Captions */}
            {transcriptionResult && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
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
                                    </div>
                                    <div className="text-sm text-gray-900 dark:text-white">
                                        {segment.text}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={() => downloadSRT(transcriptionResult.srt_content, `${selectedFile?.name.replace(/\.[^/.]+$/, '')}_captions.srt`)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                        Download SRT File
                    </button>
                </div>
            )}

            {/* Results */}
            {processedVideoUrl && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Processed Video
                    </h3>
                    <video
                        src={processedVideoUrl}
                        controls
                        className="w-full rounded-lg mb-4"
                    />
                    <button
                        onClick={downloadVideo}
                        className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                        Download Video with Captions
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
            <LeftColumn />
            <RightColumn />
        </div>
    );
}