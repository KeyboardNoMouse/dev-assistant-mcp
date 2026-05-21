import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

export async function askGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const response = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent",
    {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
      params: {
        key: apiKey,
      },
    }
  );

  return (
    response.data.candidates?.[0]?.content?.parts?.[0]?.text ||
    "No response"
  );
}
