# AI Video Processor

A modern web application for video processing using FFmpeg in the browser and on the server. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- **Client-side video processing** using FFmpeg.wasm (WebAssembly)
- **Server-side processing** with native FFmpeg for heavy operations
- **Real-time progress tracking** with detailed logs
- **Video compression** and format conversion
- **Thumbnail extraction** from videos
- **Privacy-focused** - client-side processing keeps data local
- **Modern UI** with dark mode support

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Video Processing**: FFmpeg.wasm (client), fluent-ffmpeg (server)
- **File Handling**: Native File API, multer for uploads

## Prerequisites

For server-side processing, you need FFmpeg installed on your system:

### macOS
```bash
brew install ffmpeg
```

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

### Windows
Download from [FFmpeg official website](https://ffmpeg.org/download.html) or use chocolatey:
```bash
choco install ffmpeg
```

## Getting Started

1. **Clone and install dependencies**:
```bash
git clone <your-repo>
cd video-processor
npm install
```

2. **Run the development server**:
```bash
npm run dev
```

3. **Open your browser**:
Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

### Client-side Processing (FFmpeg.wasm)
1. Click "Load FFmpeg" to initialize the WebAssembly module
2. Upload a video file (up to 100MB recommended)
3. Click "Process Video" to start processing
4. Watch real-time progress and logs
5. Download the processed video

### Server-side Processing (API)
The `/api/process` endpoint accepts video uploads for server-side processing:

```javascript
const formData = new FormData();
formData.append('video', videoFile);

const response = await fetch('/api/process', {
  method: 'POST',
  body: formData
});
```

## Configuration

### Security Headers
The app includes required security headers for WebAssembly:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

### File Size Limits
- Client-side: 100MB recommended (2GB WebAssembly limit)
- Server-side: Configurable in API route

## Processing Capabilities

### Current Features
- Video compression (H.264/AAC)
- Thumbnail extraction
- Format conversion
- Video analysis

### Planned Features
- AI-powered video analysis
- Automatic caption generation
- B-roll integration
- Advanced filters and effects

## Development

### Project Structure
```
src/
├── app/
│   ├── api/process/          # Server-side processing API
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Main page
├── components/
│   └── VideoProcessor.tsx   # Main video processing component
```

### Adding New Processing Features

1. **Client-side**: Extend the `VideoProcessor` component
2. **Server-side**: Add new API routes in `app/api/`

## Troubleshooting

### FFmpeg.wasm Issues
- Ensure you're using HTTPS (required for WebAssembly)
- Check browser compatibility (Chrome 94+, Firefox 118+)
- Verify security headers are properly set

### Server-side Issues
- Confirm FFmpeg is installed and in PATH
- Check file permissions for upload/output directories
- Monitor server logs for detailed error messages

## Browser Support

- Chrome 94+
- Firefox 118+
- Edge 94+
- Safari: Limited (no WebCodecs support)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details# video_auto
