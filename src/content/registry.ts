import type { ContentModule } from './types';

export class ContentRegistry {
  private modules: ContentModule[];

  constructor(modules: ContentModule[]) {
    if (modules.length === 0) throw new Error('Registry must have at least one module');
    this.modules = modules;
  }

  get length(): number {
    return this.modules.length;
  }

  resolve(id: number): ContentModule {
    const idx = ((id % this.modules.length) + this.modules.length) % this.modules.length;
    return this.modules[idx]!;
  }
}
