import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink, mkdir, readFile } from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { extractKeywordsFromTranscript, findBrollVideo } from '@/lib/b-roll';
import axios from 'axios';
import { Writable } from 'stream';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
const outputDir = path.join(process.cwd(), 'output');

async function ensureDirectories() {
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true });
  }
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const writer = createWriteStream(destination);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

export async function POST(request: NextRequest) {
  try {
    await ensureDirectories();

    const formData = await request.formData();
    const file = formData.get('video') as File;
    const srtContent = formData.get('srtContent') as string | null;
    const fontName = formData.get('fontName') as string || 'Roboto';
    const addBroll = formData.get('addBroll') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Save uploaded file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const uniquePrefix = `${Date.now()}`;
    const filename = `${uniquePrefix}-${file.name}`;
    const inputPath = path.join(uploadsDir, filename);
    const outputPath = path.join(outputDir, `processed-${filename}`);
    let srtPath: string | null = null;
    let brollPath: string | null = null;

    await writeFile(inputPath, buffer);

    if (srtContent) {
      srtPath = path.join(uploadsDir, `${uniquePrefix}.srt`);
      await writeFile(srtPath, srtContent);
    }

    if (addBroll && srtContent) {
        console.log('B-roll generation enabled.');
        const segments = parseSrt(srtContent);
        const keywords = await extractKeywordsFromTranscript(segments);

        if (keywords.length > 0) {
            const brollVideoUrl = await findBrollVideo(keywords[0]);
            if (brollVideoUrl) {
                console.log(`Found B-roll video to insert: ${brollVideoUrl}`);
                brollPath = path.join(uploadsDir, `${uniquePrefix}-broll.mp4`);
                try {
                  await downloadFile(brollVideoUrl, brollPath);
                  console.log(`B-roll video downloaded to ${brollPath}`);
                } catch (error) {
                  console.error('Failed to download b-roll video:', error);
                  brollPath = null; // a bit defensive
                }
            }
        }
    }

    // Process with FFmpeg
    return new Promise<NextResponse>((resolve) => {
      const command = ffmpeg(inputPath);

      if (brollPath) {
        command.input(brollPath);
      }

      const complexFilter: string[] = [];
      let videoStream = '[0:v]';
      if (brollPath) {
        // A simple example: overlay B-roll for 5 seconds in the middle of the video
        // This is a complex topic. A real implementation would need to parse video durations.
        // For now, we'll assume the main video is longer than 10s.
        complexFilter.push('[1:v]scale=1280:720,setsar=1[broll_scaled]');
        complexFilter.push(`${videoStream}[broll_scaled]overlay=0:0:enable='between(t,5,10)'[video_out]`);
        videoStream = '[video_out]';
      }

      if (srtPath) {
        const fontsDir = path.join(process.cwd(), 'public', 'fonts');
        const escapedFontsDir = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:');
        const style = `force_style='FontName=${fontName},FontSize=16,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,Shadow=1'`;
        complexFilter.push(`${videoStream}subtitles=${srtPath}:fontsdir=${escapedFontsDir}:${style}[video_final]`);
        videoStream = '[video_final]';
      }

      if (complexFilter.length > 0) {
        command.complexFilter(complexFilter, videoStream.replace(/\[|\]/g, ''));
      }

      command.outputOptions([
        '-c:a', 'copy',
        '-c:v', 'libx264',
        '-vsync', 'cfr',
        '-crf', '28',
        '-preset', 'ultrafast',
        '-movflags', '+faststart',
      ]);

      command
        .on('start', (commandLine) => {
          console.log('Spawned FFmpeg with command: ' + commandLine);
        })
        .on('progress', (progress) => {
          console.log('Processing: ' + (progress.percent ?? 0).toFixed(2) + '% done');
        })
        .on('end', async () => {
          try {
            const processedVideoBuffer = await readFile(outputPath);
            await unlink(inputPath);
            await unlink(outputPath);
            if (srtPath) await unlink(srtPath);
            if (brollPath) await unlink(brollPath);
            
            const uint8Array = new Uint8Array(processedVideoBuffer);
            resolve(new NextResponse(new Blob([uint8Array]), {
              status: 200,
              headers: {
                'Content-Type': 'video/mp4',
                'Content-Disposition': `attachment; filename="processed-${file.name}"`,
              },
            }));

          } catch (error) {
            console.error('File handling error after processing:', error);
            resolve(NextResponse.json({ 
              error: 'Processing completed but failed to read/clean up files'
            }, { status: 500 }));
          }
        })
        .on('error', async (err) => {
          console.error('FFmpeg error:', err);
          try {
            await unlink(inputPath);
            if (existsSync(outputPath)) await unlink(outputPath);
            if (srtPath && existsSync(srtPath)) await unlink(srtPath);
            if (brollPath && existsSync(brollPath)) await unlink(brollPath);
          } catch (cleanupError) {
            console.error('Cleanup error after FFmpeg failure:', cleanupError);
          }
          
          resolve(NextResponse.json({ 
            error: 'Video processing failed: ' + err.message 
          }, { status: 500 }));
        })
        .save(outputPath);
    });

  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ 
      error: 'Server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Video processing API endpoint',
    methods: ['POST'],
    description: 'Upload a video file to process it with FFmpeg'
  });
}

function parseSrt(srtContent: string): { text: string }[] {
    const pattern = /(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n([\s\S]*?(?=\n\n|\n*$))/g;
    const segments = [];
    let match;
    while ((match = pattern.exec(srtContent)) !== null) {
        segments.push({
            id: match[1],
            start_time: match[2],
            end_time: match[3],
            text: match[4].replace(/\n/g, ' '),
        });
    }
    return segments;
}
