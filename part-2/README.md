# Breezy Intern Challenge

Backend serverless function for the Breezy AI quiz feature. Takes quiz answers, calls Gemini, returns a personalized Air Blend.

## Local dev

1. `npm i -g vercel` (one-time)
2. Create `.env.local` with your Gemini key:
   ```
   GEMINI_API_KEY=your_key_here
   ```
3. `vercel dev` (defaults to http://localhost:3000)
4. Endpoint available at `POST http://localhost:3000/api/chat`

## Deploy

1. `vercel link` (one-time, creates the Vercel project)
2. Add `GEMINI_API_KEY` in Vercel project settings (Production + Preview + Development)
3. `vercel` (preview) or `vercel --prod`

## API

### `POST /api/chat`

**Quiz mode request:**
```json
{
  "mode": "quiz",
  "quizAnswers": {
    "vibe": "deeply unbothered",
    "setting": "mountain",
    "pace": "horizontal",
    "indulgence": "depends who is watching",
    "idealTuesday": "reading three pages of a book and calling it productive"
  }
}
```

**Success (200):**
```json
{
  "blend": {
    "name": "Stratus Velvet 7000",
    "ratio": "78.4% N2 / 21.2% O2 / 0.4% prestige",
    "notes": ["alpine condescension", "wet stone", "a hint of LinkedIn"],
    "tier": "Power Inhaler",
    "tagline": "For the horizontally ambitious."
  }
}
```

**Degraded (502) — Gemini upstream failure, fallback blend returned in-character:**
```json
{
  "blend": { "...": "..." },
  "degraded": true
}
```

**Errors:** `400` invalid body / missing fields, `405` non-POST, `500` server misconfigured.

`chat` mode is reserved but not yet implemented — it returns `400 { "error": "chat mode not yet supported" }`.
