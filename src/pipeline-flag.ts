export type Pipeline = 'legacy' | 'surface';

export const PIPELINE_LS_KEY = 'theos:pipeline';
export const PIPELINE_URL_PARAM = 'pipeline';

type StorageLike = { getItem(k: string): string | null };

/** Select which game pipeline to boot at /.
 *  Precedence: URL ?pipeline=... > localStorage theos:pipeline > 'legacy'.
 *  Unknown values fall through to 'legacy'. */
export function pickPipeline(href: string, storage?: StorageLike): Pipeline {
  const url = new URL(href);
  const fromUrl = url.searchParams.get(PIPELINE_URL_PARAM);
  if (fromUrl) return fromUrl === 'surface' ? 'surface' : 'legacy';
  const fromStore = storage?.getItem(PIPELINE_LS_KEY);
  if (fromStore === 'surface') return 'surface';
  return 'legacy';
}
