import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { PageHeader } from '@/components/page-header'
import type { ApiKey, Model, ModelTestResult, Platform } from '../../../shared/types'
import { Plus, Download, FlaskConical, Loader2 } from 'lucide-react'
import { useI18n } from '@/i18n'
import { LISTED_PLATFORMS, type HealthData } from '@/components/keys/shared'
import { QuotaSignalsSection } from '@/components/keys/quota-signals-section'
import { UnifiedKeySection } from '@/components/keys/unified-key-section'
import { ClientProfilesSection } from '@/components/keys/client-profiles-section'
import { ProxySettingsSection } from '@/components/keys/proxy-settings-section'
import { BackupsSection } from '@/components/keys/backups-section'
import { AnthropicSection } from '@/components/keys/anthropic-section'
import { ProviderList } from '@/components/keys/provider-list'
import { ProviderChecklistSection } from '@/components/keys/provider-checklist-section'
import { AddKeyDialog } from '@/components/keys/add-key-dialog'
import { ExportKeysDialog } from '@/components/keys/export-keys-dialog'
import { AgentCompatibilitySection } from '@/components/keys/agent-compatibility-section'

type KeysTab = 'providers' | 'quotaSignals' | 'apiKey' | 'anthropic' | 'agents'
type BulkTestRow = { platform: string; model: string; status: 'passed' | 'failed' | 'skipped'; latencyMs?: number; error?: string }
const KEYS_TABS: { id: KeysTab; labelKey: string }[] = [
  { id: 'providers', labelKey: 'keys.tabProviders' },
  { id: 'quotaSignals', labelKey: 'keys.tabQuotaSignals' },
  { id: 'apiKey', labelKey: 'keys.tabApiKey' },
  { id: 'anthropic', labelKey: 'keys.tabAnthropic' },
  { id: 'agents', labelKey: 'keys.tabAgents' },
]

export default function KeysPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<KeysTab>('providers')
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedPlatform = LISTED_PLATFORMS.find(p => p.value === searchParams.get('add'))?.value
  const [addOpen, setAddOpen] = useState(linkedPlatform !== undefined)
  const [addPlatform, setAddPlatform] = useState<Platform | ''>(linkedPlatform ?? '')
  const [exportOpen, setExportOpen] = useState(false)
  const [bulkTesting, setBulkTesting] = useState(false)
  const [bulkRows, setBulkRows] = useState<BulkTestRow[]>([])
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 })

  useEffect(() => {
    if (searchParams.has('add')) setSearchParams(prev => { prev.delete('add'); return prev }, { replace: true })
  }, [searchParams, setSearchParams])

  const openAddKey = (platform: Platform | '' = '') => {
    setAddPlatform(platform)
    setAddOpen(true)
  }

  const { data: keys = [] } = useQuery<ApiKey[]>({
    queryKey: ['keys'],
    queryFn: () => apiFetch('/api/keys'),
  })
  const { data: healthData } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: () => apiFetch('/api/health'),
    refetchInterval: 30000,
  })
  const checkAll = useMutation({
    mutationFn: () => apiFetch('/api/health/check-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['keys'] })
    },
  })

  async function testAllProviders() {
    if (bulkTesting) return
    setBulkTesting(true)
    setBulkRows([])
    setBulkProgress({ done: 0, total: 0 })
    try {
      const [currentKeys, currentModels] = await Promise.all([
        apiFetch<ApiKey[]>('/api/keys'),
        apiFetch<Model[]>('/api/models'),
      ])
      const platforms = [...new Set(currentKeys.filter(key => key.enabled).map(key => key.platform))]
      const targets = platforms.map(platform => {
        const candidates = currentModels
          .filter(model => model.platform === platform && model.enabled)
          .sort((a, b) => a.intelligenceRank - b.intelligenceRank || a.displayName.localeCompare(b.displayName))
        return { platform, model: candidates[0] }
      })
      setBulkProgress({ done: 0, total: targets.length })
      const rows: BulkTestRow[] = []
      setBulkRows([])
      for (const target of targets) {
        if (!target.model) {
          rows.push({ platform: target.platform, model: '—', status: 'skipped', error: 'No enabled chat model in catalog' })
        } else {
          try {
            const result = await apiFetch<ModelTestResult>(`/api/models/${target.model.id}/test`, { method: 'POST' })
            rows.push({
              platform: target.platform,
              model: target.model.displayName,
              status: result.success ? 'passed' : 'failed',
              latencyMs: result.latencyMs,
              error: result.error,
            })
          } catch (error) {
            rows.push({
              platform: target.platform,
              model: target.model.displayName,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Request failed',
            })
          }
        }
        setBulkRows([...rows])
        setBulkProgress({ done: rows.length, total: targets.length })
      }
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['keys'] })
    } catch (error) {
      setBulkRows([{ platform: 'Test setup', model: '—', status: 'failed', error: error instanceof Error ? error.message : 'Could not load providers and models' }])
    } finally {
      setBulkTesting(false)
    }
  }

  const passedCount = bulkRows.filter(row => row.status === 'passed').length
  const failedCount = bulkRows.filter(row => row.status === 'failed').length
  const skippedCount = bulkRows.filter(row => row.status === 'skipped').length

  return (
    <div>
      <PageHeader
        title={t('keys.pageTitle')}
        description={t('keys.pageDescription')}
        actions={
          <>
            {tab === 'providers' && keys.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => void testAllProviders()} disabled={bulkTesting}>
                {bulkTesting ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
                {bulkTesting ? `Testing ${bulkProgress.done}/${bulkProgress.total}` : 'Test all providers'}
              </Button>
            )}
            {(tab === 'providers' || tab === 'quotaSignals') && keys.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => checkAll.mutate()} disabled={checkAll.isPending || bulkTesting}>
                {checkAll.isPending ? t('keys.checking') : t('keys.checkAll')}
              </Button>
            )}
            {keys.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
                <Download className="size-3.5" />
                {t('keys.export')}
              </Button>
            )}
            {tab === 'providers' && (
              <Button size="sm" onClick={() => openAddKey()}>
                <Plus className="size-3.5" />
                {t('keys.addKey')}
              </Button>
            )}
            <SegmentedControl
              value={tab}
              onValueChange={setTab}
              options={KEYS_TABS.map(tb => ({ value: tb.id, label: t(tb.labelKey) }))}
              ariaLabel={t('keys.pageTitle')}
              className="w-full sm:w-auto"
            />
          </>
        }
      />

      {bulkRows.length > 0 && (
        <section className="mb-6 rounded-xl border p-4" aria-live="polite" data-testid="bulk-provider-test-results">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">Provider generation test</div>
            <div className="text-sm text-muted-foreground">
              {bulkTesting ? `Progress: ${bulkProgress.done}/${bulkProgress.total}` : 'Finished'} · {passedCount} passed · {failedCount} failed · {skippedCount} skipped
            </div>
          </div>
          <ul className="divide-y">
            {bulkRows.map((row, index) => (
              <li key={`${row.platform}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{row.platform}</span>
                  <span className="ml-2 text-muted-foreground">{row.model}</span>
                  {row.error && <div className="max-w-xl truncate text-xs text-muted-foreground" title={row.error}>{row.error}</div>}
                </div>
                <span className={row.status === 'passed' ? 'text-emerald-600' : row.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                  {row.status === 'passed' ? `PASS · ${row.latencyMs ?? 0}ms` : row.status.toUpperCase()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-8">
        {tab === 'apiKey' && (
          <>
            <UnifiedKeySection />
            <ClientProfilesSection />
            <ProxySettingsSection />
            <BackupsSection />
          </>
        )}
        {tab === 'anthropic' && <AnthropicSection />}
        {tab === 'agents' && <AgentCompatibilitySection />}
        {tab === 'quotaSignals' && <QuotaSignalsSection states={healthData?.quotaStates ?? []} />}
        {tab === 'providers' && (
          <>
            <ProviderChecklistSection onAddKey={platform => openAddKey(platform as Platform)} />
            <ProviderList onAddKey={() => openAddKey()} />
          </>
        )}
      </div>

      <AddKeyDialog open={addOpen} onOpenChange={setAddOpen} initialPlatform={addPlatform || undefined} />
      {exportOpen && <ExportKeysDialog open={exportOpen} onOpenChange={setExportOpen} />}
    </div>
  )
}
