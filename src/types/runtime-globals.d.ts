type FeatureToggleInput = string | readonly string[] | null | undefined;

interface A3HubFeatureFlags {
  only?: FeatureToggleInput;
  disabled?: FeatureToggleInput;
  [key: string]: unknown;
}

interface Window {
  __A3HUB_FEATURE_FLAGS__?: A3HubFeatureFlags;
  __A3HUB_CLOUDINARY_CONFIG__?: Record<string, unknown>;
  __A3HUB_EMAIL_CONFIG__?: Record<string, unknown>;
  __A3HUB_GEMINI_CONFIG__?: Record<string, unknown>;
  __A3HUB_OPENAI_CONFIG__?: Record<string, unknown>;
  __A3HUB_PUSH_CONFIG__?: Record<string, unknown>;
  __A3HUB_WHATSAPP_CONFIG__?: Record<string, unknown>;
  __CLOUDINARY_CONFIG__?: Record<string, unknown>;
  __GEMINI_CONFIG__?: Record<string, unknown>;
  __OPENAI_CONFIG__?: Record<string, unknown>;
}

interface ServiceWorkerGlobalScope {
  __A3HUB_FIREBASE_CONFIG__?: Record<string, unknown>;
}

interface ImportMetaEnv {
  readonly VITE_FEATURES_ONLY?: string;
  readonly VITE_FEATURES_DISABLED?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_FIREBASE_DATABASE_URL?: string;
  readonly VITE_PUSH_VAPID_KEY?: string;
  readonly VITE_PUSH_NOTIFY_ENABLED?: string;
  readonly VITE_PUSH_NOTIFY_ENDPOINT?: string;
  readonly VITE_PUSH_SW_URL?: string;
  readonly VITE_EMAIL_NOTIFY_ENABLED?: string;
  readonly VITE_EMAIL_NOTIFY_ENDPOINT?: string;
  readonly VITE_WHATSAPP_NOTIFY_ENABLED?: string;
  readonly VITE_WHATSAPP_DEFAULT_COUNTRY_CODE?: string;
  readonly VITE_WHATSAPP_NOTIFY_ENDPOINT?: string;
  readonly VITE_WHATSAPP_MODE?: string;
  readonly VITE_WHATSAPP_TEMPLATE_NAME?: string;
  readonly VITE_WHATSAPP_TEMPLATE_LANGUAGE?: string;
  readonly VITE_WHATSAPP_TEXT_FALLBACK_TO_TEMPLATE?: string;
  readonly VITE_AI_PROXY_ENDPOINT?: string;
  readonly VITE_ALLOW_CLIENT_AI_KEY?: string;
}
