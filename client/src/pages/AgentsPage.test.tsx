// @vitest-environment jsdom
//
// Render the real Agents page with the desktop preload bridge to exercise the
// Windows-only Claude Code connection control and its success/error states.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import AgentsPage from './AgentsPage'

type ClaudeBridge = {
  connect: () => Promise<{ settingsPath: string; backupPath: string | null }>
}

type FreeApiWindow = Window & {
  __FREEAPI_DESKTOP__?: boolean
  __FREEAPI_PLATFORM__?: string
  __FREEAPI_CLAUDE__?: ClaudeBridge
}

let root: Root
let container: HTMLDivElement
let connect: ReturnType<typeof vi.fn>

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function flush() {
  for (let i = 0; i < 8; i++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <I18nProvider initialLocale="en">
          <AgentsPage />
        </I18nProvider>
      </QueryClientProvider>,
    )
  })
}

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  // vite.config.ts normally replaces this compile-time constant; standalone
  // Vitest runs do not load that config, so provide the same value globally.
  vi.stubGlobal('__SERVER_PORT__', '31415')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  connect = vi.fn(async () => ({
    settingsPath: 'C:/Users/runner/.claude/settings.json',
    backupPath: 'C:/Users/runner/.claude/settings.json.backup-test',
  }))
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/settings/api-key')) return json({ apiKey: 'local-test-api-key' })
    if (url.includes('/api/analytics/by-client')) return json([])
    return new Response(JSON.stringify({ error: { message: `Unexpected request: ${url}` } }), { status: 404 })
  }))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  const w = window as FreeApiWindow
  delete w.__FREEAPI_DESKTOP__
  delete w.__FREEAPI_PLATFORM__
  delete w.__FREEAPI_CLAUDE__
})

describe('AgentsPage Claude Code connection UI', () => {
  it('shows the Windows desktop button and invokes the preload bridge', async () => {
    const w = window as FreeApiWindow
    w.__FREEAPI_DESKTOP__ = true
    w.__FREEAPI_PLATFORM__ = 'win32'
    w.__FREEAPI_CLAUDE__ = { connect }

    mount()
    await flush()

    const button = [...container.querySelectorAll('button')]
      .find(element => element.textContent?.includes('Connect Claude Code'))
    expect(button).toBeDefined()
    expect((button as HTMLButtonElement).disabled).toBe(false)
    // Manual setup remains available even when the native Windows button is shown.
    expect(container.textContent).toContain('npx freellmapi setup-claude')

    await act(async () => {
      ;(button as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    expect(connect).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Settings saved.')
    expect(container.textContent).toContain('Restart Claude Code')
    expect(container.textContent).toContain('settings.json.backup-test')
  })

  it('shows a readable error when the native connection fails', async () => {
    const w = window as FreeApiWindow
    w.__FREEAPI_DESKTOP__ = true
    w.__FREEAPI_PLATFORM__ = 'win32'
    w.__FREEAPI_CLAUDE__ = {
      connect: vi.fn(async () => { throw new Error('Claude settings file is not writable.') }),
    }

    mount()
    await flush()
    const button = [...container.querySelectorAll('button')]
      .find(element => element.textContent?.includes('Connect Claude Code'))
    expect(button).toBeDefined()

    await act(async () => {
      ;(button as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    expect(container.textContent).toContain('Claude settings file is not writable.')
  })

  it('keeps the browser/non-Windows quickstart and hides the native button', async () => {
    const w = window as FreeApiWindow
    w.__FREEAPI_DESKTOP__ = true
    w.__FREEAPI_PLATFORM__ = 'linux'
    w.__FREEAPI_CLAUDE__ = { connect }

    mount()
    await flush()

    expect([...container.querySelectorAll('button')].some(element => element.textContent?.includes('Connect Claude Code'))).toBe(false)
    expect(container.textContent).toContain('Connect Claude Code')
    expect(container.textContent).toContain('npx freellmapi setup-claude')
    expect(connect).not.toHaveBeenCalled()
  })
})
