/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Only "mock" is implemented. Any other value falls back to mock with a visible notice. */
  readonly VITE_INFERENCE_PROVIDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
