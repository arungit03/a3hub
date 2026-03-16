// Optional runtime config for WhatsApp forwarding.
// Use this when you do not want to set VITE_WHATSAPP_* build vars.
window.__CKCET_WHATSAPP_CONFIG__ = {
  enabled: false,
  endpoint: "/.netlify/functions/whatsapp-send",
  defaultCountryCode: "91",
  mode: "auto",
  templateName: "hello_world",
  templateLanguage: "en_US",
  allowTemplateFallback: true,
};
