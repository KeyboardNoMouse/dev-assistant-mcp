import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ── Client setup ─────────────────────────────────────────────────────────────

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "Missing GEMINI_API_KEY — add it to your .env file. Get one free at aistudio.google.com"
    );
  }
  return new GoogleGenerativeAI(key);
}

// ── Response cache ────────────────────────────────────────────────────────────

interface CacheEntry {
  result: string;
  ts: number;
}

const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 200;

/** SHA-256 based cache key — avoids the 32-bit polynomial collision risk. */
function cacheKey(model: string, prompt: string): string {
  return crypto.createHash("sha256").update(`${model}:${prompt}`).digest("hex").slice(0, 32);
}

function pruneCache(): void {
  if (responseCache.size <= MAX_CACHE_SIZE) return;
  const now = Date.now();
  // Evict expired first
  for (const [k, v] of responseCache) {
    if (now - v.ts > CACHE_TTL_MS) responseCache.delete(k);
  }
  // If still over, evict oldest
  if (responseCache.size > MAX_CACHE_SIZE) {
    const sorted = Array.from(responseCache.entries()).sort((a, b) => a[1].ts - b[1].ts);
    sorted.slice(0, sorted.length - MAX_CACHE_SIZE).forEach(([k]) => responseCache.delete(k));
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export type GeminiModel = "gemini-2.0-flash-lite" | "gemini-2.0-flash" | "gemini-1.5-pro";

/**
 * Send a prompt to Gemini.
 *
 * @param prompt  The prompt string.
 * @param useCache  Cache identical prompts for 5 minutes. Default: true.
 * @param model  Which Gemini model to use. Default: gemini-2.0-flash-lite (free tier).
 */
export async function askGemini(
  prompt: string,
  useCache = true,
  model: GeminiModel = "gemini-2.0-flash-lite"
): Promise<string> {
  const key = cacheKey(model, prompt);

  if (useCache) {
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.result;
    }
  }

  const client = getClient();
  const genModel = client.getGenerativeModel({ model });
  const response = await genModel.generateContent(prompt);
  const result = response.response.text();

  responseCache.set(key, { result, ts: Date.now() });
  pruneCache();
  return result;
}

/** Multi-turn conversation helper for the orchestration planner. */
export async function askGeminiChat(
  messages: Array<{ role: "user" | "model"; text: string }>,
  model: GeminiModel = "gemini-2.0-flash-lite"
): Promise<string> {
  const client = getClient();
  const genModel = client.getGenerativeModel({ model });

  const chat = genModel.startChat({
    history: messages.slice(0, -1).map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
  });

  const lastMessage = messages[messages.length - 1];
  const response = await chat.sendMessage(lastMessage.text);
  return response.response.text();
}
