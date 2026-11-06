import { describe, expect, it } from 'vitest'
import type { ApiKey, Model } from '@freellmapi/shared/types'
import { selectBulkTestTargets } from './test-models'

const key = (overrides: Partial<Pick<ApiKey, 'id' | 'platform' | 'enabled' | 'label' | 'groupLabel'>>): Pick<ApiKey, 'id' | 'platform' | 'enabled' | 'label' | 'groupLabel'> => ({
  id: 1,
  platform: 'groq',
  enabled: true,
  label: 'Key',
  groupLabel: null,
  ...overrides,
})

const model = (overrides: Partial<Model>): Model => ({
  id: 1,
  platform: 'groq',
  modelId: 'model-1',
  displayName: 'Model 1',
  intelligenceRank: 1,
  speedRank: 1,
  sizeLabel: '',
  rpmLimit: null,
  rpdLimit: null,
  tpmLimit: null,
  tpdLimit: null,
  monthlyTokenBudget: '',
  contextWindow: null,
  enabled: true,
  supportsVision: false,
  supportsTools: false,
  ...overrides,
})

describe('selectBulkTestTargets', () => {
  it('selects one best enabled model per regular provider, not per key', () => {
    const targets = selectBulkTestTargets(
      [key({ id: 1 }), key({ id: 2 })],
      [
        model({ id: 1, intelligenceRank: 5 }),
        model({ id: 2, intelligenceRank: 2, displayName: 'Better' }),
        model({ id: 3, enabled: false, intelligenceRank: 1 }),
      ],
    )

    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ platform: 'groq', model: { id: 2 } })
  })

  it('tests each enabled custom key against only its own model', () => {
    const targets = selectBulkTestTargets(
      [
        key({ id: 10, platform: 'custom', label: 'Endpoint A' }),
        key({ id: 11, platform: 'custom', label: 'Endpoint B' }),
        key({ id: 12, platform: 'custom', label: 'Disabled', enabled: false }),
      ],
      [
        model({ id: 20, platform: 'custom', keyId: 10 }),
        model({ id: 21, platform: 'custom', keyId: 11 }),
        model({ id: 22, platform: 'custom', keyId: 12 }),
      ],
    )

    expect(targets).toHaveLength(2)
    expect(targets.map(target => [target.platform, target.model?.id])).toEqual([
      ['Endpoint A', 20],
      ['Endpoint B', 21],
    ])
  })

  it('keeps configured providers visible when no enabled model exists', () => {
    const targets = selectBulkTestTargets(
      [key({ id: 1 })],
      [model({ id: 2, enabled: false })],
    )

    expect(targets).toEqual([{ platform: 'groq', model: undefined }])
  })
})
