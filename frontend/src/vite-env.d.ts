/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface MailQuayRuntimeConfig {
  apiBaseUrl?: string;
}

interface Window {
  __MAILQUAY_CONFIG__?: MailQuayRuntimeConfig;
}
