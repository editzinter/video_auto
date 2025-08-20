import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { extractKeywordsFromTranscript, findBrollVideo } from '@/lib/b-roll';

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
    const srtContent = formData.get('srtContent') as string | null;
    const fontName = formData.get('fontName') as string || 'Roboto';

    // Validate font and get file path
    const fontMap: { [key: string]: string } = {
        'Roboto': path.join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf'),
        'Lato': path.join(process.cwd(), 'public', 'fonts', 'Lato-Regular.ttf'),
        'DejaVu Sans': '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        'Open Sans': path.join(process.cwd(), 'public', 'fonts', 'OpenSans-Regular.ttf'),
        'Montserrat': path.join(process.cwd(), 'public', 'fonts', 'Montserrat-Regular.ttf'),
        'Source Sans Pro': path.join(process.cwd(), 'public', 'fonts', 'SourceSansPro-Regular.ttf'),
        'PT Sans': path.join(process.cwd(), 'public', 'fonts', 'PTSans-Regular.ttf'),
        'Oswald': path.join(process.cwd(), 'public', 'fonts', 'Oswald-Regular.ttf'),
        'Merriweather': path.join(process.cwd(), 'public', 'fonts', 'Merriweather-Regular.ttf'),
        'Playfair Display': path.join(process.cwd(), 'public', 'fonts', 'PlayfairDisplay-Regular.ttf'),
        'Nunito': path.join(process.cwd(), 'public', 'fonts', 'Nunito-Regular.ttf'),
        'Raleway': path.join(process.cwd(), 'public', 'fonts', 'Raleway-Regular.ttf'),
        'Poppins': path.join(process.cwd(), 'public', 'fonts', 'Poppins-Regular.ttf'),
        'Ubuntu': path.join(process.cwd(), 'public', 'fonts', 'Ubuntu-Regular.ttf'),
        'Noto Sans': path.join(process.cwd(), 'public', 'fonts', 'NotoSans-Regular.ttf'),
        'Rubik': path.join(process.cwd(), 'public', 'fonts', 'Rubik-Regular.ttf'),
        'Work Sans': path.join(process.cwd(), 'public', 'fonts', 'WorkSans-Regular.ttf'),
        'Lobster': path.join(process.cwd(), 'public', 'fonts', 'Lobster-Regular.ttf'),
        'Pacifico': path.join(process.cwd(), 'public', 'fonts', 'Pacifico-Regular.ttf'),
        'Caveat': path.join(process.cwd(), 'public', 'fonts', 'Caveat-Regular.ttf'),
        'Indie Flower': path.join(process.cwd(), 'public', 'fonts', 'IndieFlower-Regular.ttf'),
        'Zilla Slab': path.join(process.cwd(), 'public', 'fonts', 'ZillaSlab-Regular.ttf'),
        'Arvo': path.join(process.cwd(), 'public', 'fonts', 'Arvo-Regular.ttf'),
    };
    const fontPath = fontMap[fontName] || fontMap['Roboto'];
    
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

    await writeFile(inputPath, buffer);

    if (srtContent) {
      srtPath = path.join(uploadsDir, `${uniquePrefix}.srt`);
      await writeFile(srtPath, srtContent);
    }

    const addBroll = formData.get('addBroll') === 'true';

    if (addBroll && srtContent) {
        console.log('B-roll generation enabled.');
        const segments = parseSrt(srtContent);
        const keywords = await extractKeywordsFromTranscript(segments);

        if (keywords.length > 0) {
            const brollVideoUrl = await findBrollVideo(keywords[0]);
            if (brollVideoUrl) {
                console.log(`Found B-roll video to insert: ${brollVideoUrl}`);
                // TODO: Download this video and add it to the ffmpeg command.
            }
        }
    }

    // Process with FFmpeg
    return new Promise<NextResponse>((resolve) => {
      const command = ffmpeg(inputPath);

      if (srtPath) {
        const style = `force_style='Alignment=2,FontFile=${fontPath},FontSize=16,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,Shadow=1'`;
        command
          .videoFilter(`subtitles=${srtPath}:${style}`)
          .outputOptions([
            '-c:a', 'copy',
            '-c:v', 'libx264',
            '-vsync', 'cfr',
            '-crf', '28',
            '-preset', 'ultrafast',
            '-movflags', '+faststart',
          ]);
      } else {
        // Fallback to original processing if no SRT is provided
        command.outputOptions([
          '-c:v libx264',
          '-crf 28',
          '-preset fast',
          '-c:a aac',
          '-b:a 128k'
        ]);
      }

      command
        .on('start', (commandLine) => {
          console.log('Spawned FFmpeg with command: ' + commandLine);
        })
        .on('progress', (progress) => {
          // This can be used to implement progress tracking if needed
          console.log('Processing: ' + (progress.percent ?? 0).toFixed(2) + '% done');
        })
        .on('end', async () => {
          try {
            // Read the processed file
            const processedVideoBuffer = await readFile(outputPath);

            // Clean up files
            await unlink(inputPath);
            await unlink(outputPath);
            if (srtPath) {
              await unlink(srtPath);
            }
            
            // Return the processed video as a blob
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
          
          // Clean up files on error
          try {
            await unlink(inputPath);
            if (existsSync(outputPath)) await unlink(outputPath);
            if (srtPath && existsSync(srtPath)) await unlink(srtPath);
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

function parseSrt(srtContent: string) {
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