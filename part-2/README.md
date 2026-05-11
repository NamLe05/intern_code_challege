# Breezy AI-Powered Chatbot + Air Blend Quiz

## What I built and why

A floating chat widget in the bottom-right of the Breezy site. Users can chat with the assistant in the site's voice or take a 5-question quiz that generates a personalized Air Blend (name, nitrogen-oxygen ratio, tasting notes, recommended pricing tier). Once a user has a blend, the chatbot knows about it and can reference it in conversation.

I picked this feature because it fit Breezy's product direction the best. The site sells premium artisanal air and its marketing promises specific things like DNA-Matched Blends and a quiz that curates a personalized Air Blend, but neither is actually built on the page. The chatbot + quiz makes those features real.

## How it works

Vanilla JS widget injected into the existing HTML, no framework or build step. State lives in a single object. localStorage persists the saved blend and last 20 chat messages.

The backend is a single Vercel serverless function at `/api/chat`. It handles both quiz and chat modes via a `mode` field on the request. Quiz mode uses Gemini's structured output schema for guaranteed parseable JSON. Chat mode uses plain text with conversation history capped at 6 turns. Both modes share the same system prompt so the voice stays consistent.

The Gemini API key lives in Vercel environment variables and never touches the client. When the user has a saved blend, it gets injected into the system prompt for chat mode, wrapped in `<customer_profile>` tags so Gemini treats it as data, not instructions.

## Setup

Live URL is on Vercel. To run locally:

1. `npm i -g vercel`
2. From inside `Part-2/`: create `.env.local` with `GEMINI_API_KEY=...` (key from aistudio.google.com)
3. `vercel dev`
4. Open `http://localhost:3000`

`test.sh` runs the curl-based test suite against the local server.

## What I'd improve with more time

- Real rate limiting via Upstash Redis. In-memory doesn't survive Vercel cold starts, and the GCP budget cap is the current backstop.
- Streaming chat responses so replies feel faster.
- Tighter integration with the pricing section. Right now "See Plans" scrolls; I'd highlight the matching tier card directly.
- More variety in blend names. Gemini converges on similar outputs with identical inputs. Higher temperature or themed rotation would help.

## Security trade-offs

I skipped rate limiting and an origin/referer guard on purpose. In-memory rate limiting doesn't work on Vercel because cold starts wipe state, and Upstash Redis is overhead disproportionate to a single-URL demo. The Google Cloud budget cap is the real backstop. An origin guard would be theater since anyone bypasses it with curl.

What I did add: 16KB body cap, 20-message conversation cap, 500-char per-message cap, blend field length caps, newline sanitization on blend strings before they're interpolated into the system prompt (prevents prompt injection), and two anti-jailbreak clauses in the system prompt.
