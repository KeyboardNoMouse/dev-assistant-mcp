import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Simple in-memory cache: key -> { result, timestamp }
const responseCache = new Map<string, { result: string; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(prompt: string): string {
  // Use a short hash of the prompt as cache key
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = (Math.imul(31, hash) + prompt.charCodeAt(i)) | 0;
  }
  return String(hash);
}

export async function askGemini(prompt: string, useCache = true): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY — add it to your .env file. Get one free at aistudio.google.com"
    );
  }

  const key = cacheKey(prompt);

  if (useCache) {
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.result;
    }
  }

  const response = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent",
    {
      contents: [{ parts: [{ text: prompt }] }],
    },
    {
      headers: { "Content-Type": "application/json" },
      params: { key: apiKey },
    }
  );

  const result =
    response.data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";

  responseCache.set(key, { result, ts: Date.now() });
  return result;
}
