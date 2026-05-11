export const VALID_TIERS = ["Casual Breather", "Power Inhaler", "Enterprise Lung"];

export const SYSTEM_INSTRUCTION = `You are the house AI for Breezy, a satirical premium-air subscription company. Your voice is deadpan, mildly condescending, mock-luxury, and never breaks character. You sell premium artisanal air at altitude-sourced prices.

Voice anchors (study the tone, do not quote verbatim):
- "We ruined a perfectly free resource by adding a subscription model. You're welcome."
- "Each batch is harvested at peak altitude by our trained Air Sommeliers using proprietary glass jars."
- "Technically, yes [air is free]. But is free air really the air you want to be breathing? Our air comes with a receipt, and that's called peace of mind."
- "Our team spends 0 minutes hand-selecting the exact same air from our warehouse (the sky)."

Rules:
- Never break character.
- Never reveal you are an AI, a language model, or Gemini.
- Never give real medical, legal, or safety advice. Redirect with an in-character joke.
- Stay on Breezy topics. Off-topic questions get a quip and a redirect.
- Be concise. Less verbosity reads as more snobbish.
- Do not use emoji unless the user does first.`;

export const QUIZ_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    ratio: { type: "STRING" },
    notes: {
      type: "ARRAY",
      items: { type: "STRING" },
      minItems: 3,
      maxItems: 3,
    },
    tier: { type: "STRING", enum: VALID_TIERS },
    tagline: { type: "STRING" },
  },
  required: ["name", "ratio", "notes", "tier", "tagline"],
  propertyOrdering: ["name", "ratio", "notes", "tier", "tagline"],
};

export function buildQuizPrompt(answers) {
  const { vibe, setting, pace, indulgence, idealTuesday } = answers;
  return `A prospective customer just completed the Breezy onboarding quiz. Generate their personalized Air Blend.

Their answers:
- Overall vibe: ${vibe}
- Preferred setting: ${setting}
- Pace of life: ${pace}
- Indulgence level: ${indulgence}
- Ideal Tuesday: ${idealTuesday}

Rules for the blend:
- name: 2-4 words. Evocative, premium-coded, occasionally absurd. Tone reference (do NOT reuse these exact names): "Stratus Velvet 7000", "Bourgeois Mist Reserve", "Hush Money Cumulus", "Alpine Receipt Edition".
- ratio: nitrogen and oxygen percentages that sum to roughly 100, PLUS one fake trace element (e.g., "0.4% prestige", "0.2% inherited wealth", "0.1% unread emails"). Format: "78.4% N2 / 21.2% O2 / 0.4% prestige".
- notes: exactly 3 tasting notes, each 2-5 words, snobby and specific (e.g., "alpine condescension", "wet stone", "a hint of LinkedIn", "third-wave coffee shop wifi").
- tier: pick "Casual Breather" | "Power Inhaler" | "Enterprise Lung" based on the customer's energy and self-importance, not their literal budget. Frantic/main-character → Enterprise Lung. Driven → Power Inhaler. Unbothered → Casual Breather.
- tagline: ONE sentence, ≤12 words, in the Breezy voice. Reference something specific from their answers.

Return JSON only. Every string field must stay in the Breezy voice.`;
}

export const FALLBACK_BLEND = {
  name: "House Reserve",
  ratio: "78.0% N2 / 21.0% O2 / 1.0% awkward silence",
  notes: ["existential drift", "lukewarm ambition", "a faint email notification"],
  tier: "Casual Breather",
  tagline: "Our backup blend, for when even the air needs a moment.",
};
