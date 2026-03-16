type FeatureToggleInput = string | readonly string[] | null | undefined;

interface CKCETFeatureFlags {
  only?: FeatureToggleInput;
  disabled?: FeatureToggleInput;
  [key: string]: unknown;
}

interface Window {
  __CKCET_FEATURE_FLAGS__?: CKCETFeatureFlags;
  __CKCET_EMAIL_CONFIG__?: Record<string, unknown>;
  __CKCET_PUSH_CONFIG__?: Record<string, unknown>;
  __CKCET_WHATSAPP_CONFIG__?: Record<string, unknown>;
}

interface ImportMetaEnv {
  readonly VITE_FEATURES_ONLY?: string;
  readonly VITE_FEATURES_DISABLED?: string;
}
