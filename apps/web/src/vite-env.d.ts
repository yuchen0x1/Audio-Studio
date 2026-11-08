/// <reference types="vite/client" />

/** Vite define 注入的构建期常量 */
declare const __APP_TARGET__: 'web' | 'desktop';
declare const __APP_VERSION__: string;

interface Window {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
}
