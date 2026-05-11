#!/usr/bin/env bash
# Curl test suite for POST /api/chat.
# Usage:
#   ./test.sh                      # tests against http://localhost:3000
#   ./test.sh https://your.vercel.app
#
# Requires: curl, jq

set -u

BASE_URL="${1:-http://localhost:3000}"
ENDPOINT="$BASE_URL/api/chat"

hr() { printf '\n\033[1;36m── %s ──\033[0m\n' "$1"; }
note() { printf '\033[2m%s\033[0m\n' "$1"; }

hr "1. Happy path — unbothered mountain person"
curl -sS -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "quiz",
    "quizAnswers": {
      "vibe": "deeply unbothered",
      "setting": "mountain",
      "pace": "horizontal",
      "indulgence": "depends who is watching",
      "idealTuesday": "reading three pages of a book and calling it a productive day"
    }
  }' | jq

hr "2. Schema validation — all required fields present, tier in enum"
note "Expect: { ok: true }"
curl -sS -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "quiz",
    "quizAnswers": {
      "vibe": "main character",
      "setting": "city",
      "pace": "frantic",
      "indulgence": "yes",
      "idealTuesday": "three espressos before a meeting that should have been an email"
    }
  }' \
  | jq '.blend | {
      ok: (
        (.name|type=="string") and
        (.ratio|type=="string") and
        (.notes|type=="array" and length==3) and
        (.tier=="Casual Breather" or .tier=="Power Inhaler" or .tier=="Enterprise Lung") and
        (.tagline|type=="string")
      )
    }'

hr "3. Wrong method (GET) — expect HTTP/1.1 405"
curl -sS -i "$ENDPOINT" | head -n 1

hr "4. Bad JSON body — expect 400"
curl -sS -i -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' \
  -d 'not json' | head -n 1

hr "5. Missing quizAnswers fields — expect 400 listing missing keys"
curl -sS -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"quiz","quizAnswers":{"vibe":"x"}}' | jq

hr "6. Chat mode forward-compat — expect 400, 'chat mode not yet supported'"
curl -sS -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"chat","messages":[]}' | jq

hr "7. Oversized field (300 chars) — expect 400"
BIG=$(printf 'x%.0s' {1..300})
curl -sS -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' \
  -d "{\"mode\":\"quiz\",\"quizAnswers\":{\"vibe\":\"$BIG\",\"setting\":\"a\",\"pace\":\"a\",\"indulgence\":\"a\",\"idealTuesday\":\"a\"}}" | jq

hr "8. Variety check — five runs with identical input, names should differ"
note "Reading: each line should be a different blend name. Tier may repeat."
for i in 1 2 3 4 5; do
  curl -sS -X POST "$ENDPOINT" \
    -H 'Content-Type: application/json' \
    -d '{
      "mode": "quiz",
      "quizAnswers": {
        "vibe": "main character",
        "setting": "city",
        "pace": "frantic",
        "indulgence": "yes",
        "idealTuesday": "three espressos before a meeting that should have been an email"
      }
    }' \
    | jq -r '"  " + (.blend.name // "<no blend>") + "  —  " + (.blend.tier // "<no tier>")'
done

printf '\n\033[1;32mDone.\033[0m\n'
