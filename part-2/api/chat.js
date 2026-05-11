import { callGemini } from "./_gemini.js";
import {
  buildSystemInstruction,
  buildQuizPrompt,
  QUIZ_RESPONSE_SCHEMA,
  FALLBACK_BLEND,
  CHAT_FALLBACK_REPLY,
  isValidBlend,
} from "./_prompt.js";

export const config = {
  api: { bodyParser: false },
};

const MAX_BODY_BYTES = 16 * 1024;
const MAX_FIELD_LENGTH = 200;
const REQUIRED_ANSWER_KEYS = ["vibe", "setting", "pace", "indulgence", "idealTuesday"];

const MAX_CHAT_MESSAGES = 20;
const MAX_CHAT_CONTENT_LENGTH = 500;
const VALID_CHAT_ROLES = new Set(["user", "assistant"]);

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

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const { mode } = body;
  if (mode === "quiz") return handleQuiz(res, body);
  if (mode === "chat") return handleChat(res, body);
  return res.status(400).json({ error: "mode must be 'quiz' or 'chat'" });
}

async function handleQuiz(res, body) {
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

  try {
    const text = await callGemini({
      systemInstruction: buildSystemInstruction(),
      contents: [{ role: "user", parts: [{ text: buildQuizPrompt(answers) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: QUIZ_RESPONSE_SCHEMA,
        temperature: 1.0,
        maxOutputTokens: 400,
        thinkingConfig: { thinkingBudget: 0 },
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

async function handleChat(res, body) {
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== "object" || Array.isArray(m)) {
      return res.status(400).json({ error: `messages[${i}] must be an object` });
    }
    if (!VALID_CHAT_ROLES.has(m.role)) {
      return res.status(400).json({
        error: `messages[${i}].role must be 'user' or 'assistant'`,
      });
    }
    if (typeof m.content !== "string" || m.content.trim().length === 0) {
      return res.status(400).json({
        error: `messages[${i}].content must be a non-empty string`,
      });
    }
    if (m.content.length > MAX_CHAT_CONTENT_LENGTH) {
      return res.status(400).json({
        error: `messages[${i}].content exceeds ${MAX_CHAT_CONTENT_LENGTH} chars`,
      });
    }
  }

  if (messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "last message must be from the user" });
  }

  const trimmed = messages.slice(-MAX_CHAT_MESSAGES);
  const contents = trimmed.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const blendForContext = isValidBlend(body.blend) ? body.blend : null;
  if (body.blend && !blendForContext) {
    console.warn("Chat: ignoring malformed blend payload");
  }

  try {
    const reply = await callGemini({
      systemInstruction: buildSystemInstruction(blendForContext),
      contents,
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 250,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Chat generation failed:", err?.message ?? err);
    return res.status(502).json({ reply: CHAT_FALLBACK_REPLY, degraded: true });
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
