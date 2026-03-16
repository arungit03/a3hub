// Runtime config for AI chat.
// Keep apiKey empty in production and use server proxy endpoint only.
window.__A3HUB_GEMINI_CONFIG__ = {
  apiKey: "",
  endpoint: "/.netlify/functions/ai-generate",
};
