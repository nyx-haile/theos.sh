import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ArtifactMeta {
  kind: 'pretext' | 'image' | 'audio';
  title: string;
  placementHint: { distance: number; angleSeedOffset: number };
}

export interface Artifact {
  id: string;
  meta: ArtifactMeta;
  payloadPath: string;
  payloadContentType: string;
}

export interface LoadedRegistry {
  ids(): string[];
  get(id: string): Artifact | undefined;
  positionFor(id: string, seed: Uint8Array): [number, number];
}

const PAYLOAD_BY_KIND: Record<ArtifactMeta['kind'], { file: string; contentType: string }> = {
  pretext: { file: 'text.md',  contentType: 'text/markdown; charset=utf-8' },
  image:   { file: 'cover.png', contentType: 'image/png' },
  audio:   { file: 'audio.mp3', contentType: 'audio/mpeg' },
};

export async function loadContentRegistry(root: string): Promise<LoadedRegistry> {
  const entries = await readdir(root, { withFileTypes: true });
  const artifacts = new Map<string, Artifact>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const metaRaw = await readFile(join(root, id, 'meta.json'), 'utf-8');
    const meta = JSON.parse(metaRaw) as ArtifactMeta;
    const payload = PAYLOAD_BY_KIND[meta.kind];
    if (!payload) throw new Error(`unknown artifact kind ${meta.kind} in ${id}`);
    artifacts.set(id, {
      id, meta,
      payloadPath: join(root, id, payload.file),
      payloadContentType: payload.contentType,
    });
  }

  return {
    ids: () => [...artifacts.keys()],
    get: (id) => artifacts.get(id),
    positionFor: (id, seed) => {
      const art = artifacts.get(id);
      if (!art) throw new Error(`unknown artifact ${id}`);
      let h = 0;
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed[i]!) >>> 0;
      const angle = ((h >>> 0) / 0xffffffff) * 2 * Math.PI
                  + art.meta.placementHint.angleSeedOffset;
      const d = art.meta.placementHint.distance;
      return [Math.cos(angle) * d, Math.sin(angle) * d];
    },
  };
}
