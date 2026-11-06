import type { ApiKey, Model } from '@freellmapi/shared/types'

// Pure helpers behind the Keys page's "Test models" dialog, kept out of the
// component file so fast refresh sees only components there.

/** Client-side guard matching the server's per-model throttle window, so a
 *  double click reads as "wait" instead of a 429 toast. */
export const MODEL_TEST_MIN_INTERVAL_MS = 5_000

/** Wall clock behind the throttle; a function so components stay pure under
 *  the react-hooks/purity rule and tests can stub it. */
export const nowMs = (): number => Date.now()

/** The models the dialog should list, smartest first. Exported for tests. */
export function selectTestableModels(models: readonly Model[], platform: string, keyId?: number | null): Model[] {
  return models
    .filter(m => m.platform === platform && (keyId == null || m.keyId === keyId))
    .sort((a, b) => a.intelligenceRank - b.intelligenceRank || a.displayName.localeCompare(b.displayName))
}

/** One representative enabled chat model for each configured provider.
 *  Custom endpoints are isolated by key, so each enabled custom key gets its
 *  own target instead of accidentally testing another endpoint's model.
 */
export function selectBulkTestTargets(
  keys: readonly Pick<ApiKey, 'id' | 'platform' | 'enabled' | 'label' | 'groupLabel'>[],
  models: readonly Model[],
): Array<{ platform: string; model: Model | undefined }> {
  const enabledKeys = keys.filter(key => key.enabled)
  const platforms = [...new Set(enabledKeys.filter(key => key.platform !== 'custom').map(key => key.platform))]
  const sortModels = (candidates: Model[]) =>
    candidates.sort((a, b) => a.intelligenceRank - b.intelligenceRank || a.displayName.localeCompare(b.displayName))

  return [
    ...platforms.map(platform => ({
      platform,
      model: sortModels(models.filter(model => model.platform === platform && model.enabled))[0],
    })),
    ...enabledKeys.filter(key => key.platform === 'custom').map(key => ({
      platform: key.groupLabel || key.label || 'Custom',
      model: sortModels(models.filter(model => model.platform === 'custom' && model.keyId === key.id && model.enabled))[0],
    })),
  ]
}
