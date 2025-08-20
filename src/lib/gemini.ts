import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = 'AIzaSyAl8YONpgGAJSl9S0i8Ool9FeioAdruX7c';

export const genAI = new GoogleGenerativeAI(API_KEY);

export interface CaptionSegment {
  start_time: string;
  end_time: string;
  text: string;
  speaker?: string;
}

export interface TranscriptionResult {
  segments: CaptionSegment[];
  srt_content: string;
}

export async function transcribeVideoWithGemini(
  videoFile: File,
  onProgress?: (progress: number) => void
): Promise<TranscriptionResult> {
  try {
    onProgress?.(10);
    
    // Convert file to base64 for Gemini API
    const arrayBuffer = await videoFile.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    
    onProgress?.(30);
    
    // Get the Gemini 2.5 Flash model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    onProgress?.(40);
    
    const prompt = `
Please transcribe this video and provide accurate captions with timestamps. 
Return the transcription in JSON format with the following structure:
{
  "segments": [
    {
      "start_time": "00:00:00",
      "end_time": "00:00:05", 
      "text": "The spoken text here",
      "speaker": "Speaker 1"
    }
  ]
}

Requirements:
- Provide accurate timestamps in HH:MM:SS format
- Each caption segment should be no longer than 8 seconds
- Split longer sentences into multiple segments if needed
- Identify different speakers when possible
- Ensure text is clean and properly punctuated
- Return ONLY the JSON object, no additional text
`;

    onProgress?.(50);
    
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: videoFile.type,
          data: base64Data
        }
      },
      prompt
    ]);
    
    onProgress?.(80);
    
    const response = await result.response;
    const text = response.text();
    
    // Parse the JSON response
    let transcriptionData;
    try {
      // Clean the response text to extract JSON from markdown
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        transcriptionData = JSON.parse(jsonMatch[1]);
      } else {
        // Fallback for plain JSON
        const plainJsonMatch = text.match(/\{[\s\S]*\}/);
        if (plainJsonMatch) {
          transcriptionData = JSON.parse(plainJsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      }
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', text);
      throw new Error('Failed to parse transcription response');
    }
    
    onProgress?.(90);
    
    // Generate SRT content
    const srtContent = generateSRT(transcriptionData.segments);
    
    onProgress?.(100);
    
    return {
      segments: transcriptionData.segments,
      srt_content: srtContent
    };
    
  } catch (error) {
    console.error('Gemini transcription error:', error);
    throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function generateSRT(segments: CaptionSegment[]): string {
  return segments.map((segment, index) => {
    const startTime = formatSRTTime(segment.start_time);
    const endTime = formatSRTTime(segment.end_time);
    
    return `${index + 1}
${startTime} --> ${endTime}
${segment.text}

`;
  }).join('');
}

function formatSRTTime(timeStr: string): string {
  // Convert HH:MM:SS to HH:MM:SS,000 format for SRT
  if (timeStr.includes(',')) return timeStr;
  return timeStr + ',000';
}

export function downloadSRT(srtContent: string, filename: string = 'captions.srt') {
  const blob = new Blob([srtContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}