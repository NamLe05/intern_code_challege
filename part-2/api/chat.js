import { callGemini } from "./_gemini.js";
import {
  SYSTEM_INSTRUCTION,
  buildQuizPrompt,
  QUIZ_RESPONSE_SCHEMA,
  FALLBACK_BLEND,
  VALID_TIERS,
} from "./_prompt.js";

export const config = {
  api: { bodyParser: false },
};

const MAX_BODY_BYTES = 4096;
const MAX_FIELD_LENGTH = 200;
const REQUIRED_ANSWER_KEYS = ["vibe", "setting", "pace", "indulgence", "idealTuesday"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    if (err?.message === "TOO_LARGE") {
      return res.status(400).json({ error: "Request body too large" });
    }
    return res.status(400).json({ error: "Failed to read request body" });
  }

  let body;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { mode } = body;
  if (mode === "chat") {
    return res.status(400).json({ error: "chat mode not yet supported" });
  }
  if (mode !== "quiz") {
    return res.status(400).json({ error: "mode must be 'quiz' or 'chat'" });
  }

  const answers = body.quizAnswers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return res.status(400).json({ error: "quizAnswers is required" });
  }

  const missing = REQUIRED_ANSWER_KEYS.filter(
    (k) => typeof answers[k] !== "string" || answers[k].trim().length === 0
  );
  if (missing.length) {
    return res.status(400).json({
      error: `Missing or invalid quizAnswers fields: ${missing.join(", ")}`,
    });
  }

  const oversized = REQUIRED_ANSWER_KEYS.filter((k) => answers[k].length > MAX_FIELD_LENGTH);
  if (oversized.length) {
    return res.status(400).json({
      error: `Fields exceed ${MAX_FIELD_LENGTH} chars: ${oversized.join(", ")}`,
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  try {
    const text = await callGemini({
      systemInstruction: SYSTEM_INSTRUCTION,
      userPrompt: buildQuizPrompt(answers),
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: QUIZ_RESPONSE_SCHEMA,
        temperature: 1.0,
        maxOutputTokens: 400,
      },
    });

    const blend = JSON.parse(text);
    if (!isValidBlend(blend)) {
      throw new Error("Gemini response did not match blend schema");
    }
    return res.status(200).json({ blend });
  } catch (err) {
    console.error("Quiz generation failed:", err?.message ?? err);
    return res.status(502).json({ blend: FALLBACK_BLEND, degraded: true });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function isValidBlend(b) {
  return (
    b &&
    typeof b.name === "string" &&
    typeof b.ratio === "string" &&
    Array.isArray(b.notes) &&
    b.notes.length === 3 &&
    b.notes.every((n) => typeof n === "string") &&
    typeof b.tier === "string" &&
    VALID_TIERS.includes(b.tier) &&
    typeof b.tagline === "string"
  );
}
