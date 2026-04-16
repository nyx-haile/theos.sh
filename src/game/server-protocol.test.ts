import { describe, it, expectTypeOf } from 'vitest';
import type {
  SessionRequest, SessionResponse,
  VisibilityRequest, VisibilityResponse, VisibleArtifact,
} from './server-protocol';

describe('server-protocol', () => {
  it('has session request with hex seed', () => {
    const req: SessionRequest = { seed: 'deadbeef' };
    expectTypeOf(req.seed).toBeString();
  });

  it('has session response with sessionId and serverPubKey', () => {
    const res: SessionResponse = { sessionId: 'abc', serverPubKey: 'def' };
    expectTypeOf(res.sessionId).toBeString();
    expectTypeOf(res.serverPubKey).toBeString();
  });

  it('has VisibleArtifact with handle, relativeOffset, hintCell', () => {
    const v: VisibleArtifact = {
      handle: 'x',
      relativeOffset: { dCol: 1, dRow: 2 },
      hintCell: { dCol: 0, dRow: 0, accentHue: 0.5, densityBoost: 0.3 },
    };
    expectTypeOf(v.handle).toBeString();
  });

  it('has VisibilityRequest with viewport', () => {
    const req: VisibilityRequest = {
      sessionId: 'x',
      viewport: { centerCol: 0, centerRow: 0, radius: 10 },
    };
    expectTypeOf(req.viewport.radius).toBeNumber();
  });

  it('has VisibilityResponse with visible array', () => {
    const res: VisibilityResponse = { visible: [] };
    expectTypeOf(res.visible).toBeArray();
  });
});
