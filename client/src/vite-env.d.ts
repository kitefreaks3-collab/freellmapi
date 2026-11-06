/// <reference types="vite/client" />

declare const __SERVER_PORT__: string

declare global {
  interface Window {
    __FREEAPI_DESKTOP__?: boolean
    __FREEAPI_PLATFORM__?: string
    __FREEAPI_CLAUDE__?: {
      connect: () => Promise<{
        settingsPath: string
        backupPath: string | null
      }>
    }
  }
}

export {}
