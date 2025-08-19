import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';

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

export async function POST(request: NextRequest) {
  try {
    await ensureDirectories();

    const formData = await request.formData();
    const file = formData.get('video') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Save uploaded file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = `${Date.now()}-${file.name}`;
    const inputPath = path.join(uploadsDir, filename);
    const outputPath = path.join(outputDir, `processed-${filename}`);

    await writeFile(inputPath, buffer);

    // Process with FFmpeg
    return new Promise((resolve) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          '-crf 28',
          '-preset fast',
          '-c:a aac',
          '-b:a 128k'
        ])
        .on('start', (commandLine) => {
          console.log('Spawned FFmpeg with command: ' + commandLine);
        })
        .on('progress', (progress) => {
          console.log('Processing: ' + progress.percent + '% done');
        })
        .on('end', async () => {
          try {
            // Clean up input file
            await unlink(inputPath);
            
            // Return success response
            resolve(NextResponse.json({ 
              success: true, 
              message: 'Video processed successfully',
              outputPath: outputPath
            }));
          } catch (error) {
            console.error('Cleanup error:', error);
            resolve(NextResponse.json({ 
              error: 'Processing completed but cleanup failed' 
            }, { status: 500 }));
          }
        })
        .on('error', async (err) => {
          console.error('FFmpeg error:', err);
          
          // Clean up files on error
          try {
            await unlink(inputPath);
          } catch (cleanupError) {
            console.error('Cleanup error:', cleanupError);
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