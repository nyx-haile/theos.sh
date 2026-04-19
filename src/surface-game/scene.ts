export type Scene = 'title' | 'dissolve' | 'walk';

export interface DissolveInfo { startedAt: number; duration: number }

export interface SceneMachine {
  state(): Scene;
  dissolve(): DissolveInfo | null;
  startDissolve(now: number, duration: number): void;
  tick(now: number): Scene;
}

export function createSceneMachine(): SceneMachine {
  let scene: Scene = 'title';
  let info: DissolveInfo | null = null;
  return {
    state() { return scene; },
    dissolve() { return info; },
    startDissolve(now, duration) {
      if (scene !== 'title') return;
      scene = 'dissolve';
      info = { startedAt: now, duration: Math.max(1, duration) };
    },
    tick(now) {
      if (scene === 'dissolve' && info !== null && now >= info.startedAt + info.duration) {
        scene = 'walk';
      }
      return scene;
    },
  };
}
