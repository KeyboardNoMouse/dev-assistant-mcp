import fs from "fs-extra";
import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Resolve correct .env path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// dist/tools/analyzeCode.js -> ../../.env
dotenv.config({
    path: path.resolve(__dirname, "../../.env"),
});

export const analyzeCodeTool = {
    definition: {
        name: "analyze_code",
        description:
            "Analyze source code using Gemini AI",

        inputSchema: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description:
                        "Path to source code file",
                },
            },
            required: ["path"],
        },
    },

    handler: async ({ path }: any) => {
        try {
            const GEMINI_API_KEY =
                process.env.GEMINI_API_KEY;

            if (!GEMINI_API_KEY) {
                throw new Error(
                    "Missing GEMINI_API_KEY in .env"
                );
            }

            const code = await fs.readFile(
                path,
                "utf-8"
            );

            const prompt = `
Analyze this source code.

Explain:
1. What it does
2. Potential bugs
3. Improvements
4. Code quality
5. Security concerns

CODE:
${code}
`;

            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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
                        "Content-Type":
                            "application/json",
                    },
                    params: {
                        key: GEMINI_API_KEY,
                    },
                }
            );

            const text =
                response.data.candidates?.[0]
                    ?.content?.parts?.[0]?.text ||
                "No response from Gemini";

            return {
                content: [
                    {
                        type: "text",
                        text,
                    },
                ],
            };
        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text",
                        text:
                            error?.response?.data
                                ? JSON.stringify(
                                    error.response.data,
                                    null,
                                    2
                                )
                                : error.message,
                    },
                ],
            };
        }
    },
};