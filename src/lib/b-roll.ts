// src/lib/b-roll.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient as createPexelsClient } from 'pexels';
import { CaptionSegment } from './gemini';

// --- API Keys ---
// It's better to use environment variables, but for this sandbox, we'll use constants.
const PINECONE_API_KEY = 'pcsk_3e9H5N_J4zMhc4sVTVam8TuGHsuPTkMHkTk6EH1CydNd65gJ9yZ5FdYrhWSQZbcUsUnFJX';
const PEXELS_API_KEY = 'TUzzSvjEUXBV29vKjuGwBVr4YwmxBnJI6L07LtJScBOexfWXYXmzZj4o';
const GEMINI_API_KEY = 'AIzaSyAl8YONpgGAJSl9S0i8Ool9FeioAdruX7c';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const pexelsClient = createPexelsClient(PEXELS_API_KEY);

/**
 * Analyzes the transcript to extract relevant keywords for B-roll search.
 * @param segments The array of caption segments.
 * @returns A promise that resolves to an array of keywords.
 */
export async function extractKeywordsFromTranscript(
  segments: CaptionSegment[]
): Promise<string[]> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const transcript = segments.map(s => s.text).join(' ');

    const prompt = `
From the following transcript, please extract the top 5-10 most visually descriptive keywords or short phrases that would be suitable for finding B-roll video clips. Focus on nouns, objects, actions, and concepts that can be represented visually.

Return the keywords as a JSON array of strings. For example: ["keyword1", "keyword2", "keyword3"]

Return ONLY the JSON object.

Transcript:
---
${transcript.slice(0, 4000)}
---
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const keywords = JSON.parse(jsonMatch[0]);
      console.log(`Extracted keywords: ${keywords.join(', ')}`);
      return keywords;
    } else {
      console.warn('Could not extract keywords from transcript.');
      return [];
    }
  } catch (error) {
    console.error('Failed to extract keywords from transcript:', error);
    return [];
  }
}

/**
 * Searches for a B-roll video on Pexels using a given keyword.
 * @param keyword The keyword to search for.
 * @returns A promise that resolves to the URL of the best matching video, or null if not found.
 */
export async function findBrollVideo(keyword: string): Promise<string | null> {
    try {
        console.log(`Searching for B-roll video with keyword: ${keyword}`);
        const response = await pexelsClient.videos.search({ query: keyword, per_page: 1 });

        if ('videos' in response && response.videos.length > 0) {
            const video = response.videos[0];
            // Find the best quality video file
            const videoFile = video.video_files.find(f => f.quality === 'hd') || video.video_files[0];
            if (videoFile) {
                console.log(`Found video for "${keyword}": ${videoFile.link}`);
                return videoFile.link;
            }
        }

        console.log(`No video found for keyword: ${keyword}`);
        return null;
    } catch (error) {
        console.error(`Failed to search for video with keyword "${keyword}":`, error);
        return null;
    }
}
