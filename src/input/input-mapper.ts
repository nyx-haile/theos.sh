import type { Seed, ManifoldOp, ViewportOp, ObjectOp, ForceOp, InputEvent } from '../manifold/types';
import { Xoshiro256 } from '../manifold/prng';

type OpClass = 'ViewportOp' | 'ObjectOp' | 'ForceOp';

interface KeyBinding {
  op_class: OpClass;
  viewport_kind?: ViewportOp['kind'];
  object_criteria?: ObjectOp['selection_criteria'];
}

const MOVE_KEYS = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const NUMBER_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const MOUSE_EVENTS = ['click', 'scroll', 'drag'] as const;
const VIEWPORT_KINDS: ViewportOp['kind'][] = ['translate', 'rotate', 'wormhole_jump'];
const OBJECT_CRITERIA: ObjectOp['selection_criteria'][] = ['nearest', 'random_visible', 'furthest'];
const OP_CLASSES: OpClass[] = ['ViewportOp', 'ObjectOp', 'ForceOp'];

export class InputMapper {
  private keyMap: Map<string, KeyBinding>;
  private mouseMap: Map<string, KeyBinding>;

  constructor(seed: Seed) {
    // Derive a sub-seed with a domain tag so it doesn't alias the manifold PRNG stream
    const subSeed = new Uint8Array(seed);
    const b0 = subSeed[0] ?? 0;
    subSeed[0] = b0 ^ 0xAB;
    const prng = new Xoshiro256(subSeed);

    this.keyMap = new Map();
    this.mouseMap = new Map();

    for (const key of MOVE_KEYS) {
      const idx = Math.floor(prng.nextFloat() * VIEWPORT_KINDS.length);
      const kind = (VIEWPORT_KINDS[idx] ?? 'translate');
      this.keyMap.set(key, { op_class: 'ViewportOp', viewport_kind: kind });
    }

    for (const key of NUMBER_KEYS) {
      const idx = Math.floor(prng.nextFloat() * OBJECT_CRITERIA.length);
      const criteria = (OBJECT_CRITERIA[idx] ?? 'nearest');
      this.keyMap.set(key, { op_class: 'ObjectOp', object_criteria: criteria });
    }

    for (const event of MOUSE_EVENTS) {
      const idx = Math.floor(prng.nextFloat() * OP_CLASSES.length);
      const opClass = (OP_CLASSES[idx] ?? 'ForceOp');
      this.mouseMap.set(event, { op_class: opClass });
    }
  }

  resolve(event: InputEvent): ManifoldOp | null {
    const binding = event.type === 'keydown' && event.key !== undefined
      ? this.keyMap.get(event.key)
      : this.mouseMap.get(event.type);

    if (!binding) return null;
    return this.toOp(binding);
  }

  private toOp(binding: KeyBinding): ManifoldOp {
    if (binding.op_class === 'ViewportOp') {
      return { type: 'ViewportOp', kind: binding.viewport_kind ?? 'translate', magnitude: 1.0 };
    }
    if (binding.op_class === 'ObjectOp') {
      return { type: 'ObjectOp', selection_criteria: binding.object_criteria ?? 'nearest' };
    }
    return { type: 'ForceOp', field_delta: { direction: [0, 0, 1], magnitude: 0.1 } };
  }
}
