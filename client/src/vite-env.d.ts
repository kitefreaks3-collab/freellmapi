/// <reference types="vite/client" />

declare global {
  const __SERVER_PORT__: string

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
