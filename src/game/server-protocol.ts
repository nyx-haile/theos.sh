export interface SessionRequest {
  seed: string; // hex-encoded 32 bytes
}

export interface SessionResponse {
  sessionId: string;
  serverPubKey: string; // base64
}

export interface VisibilityRequest {
  sessionId: string;
  viewport: {
    centerCol: number;
    centerRow: number;
    radius: number;
  };
}

export interface HintCell {
  dCol: number;
  dRow: number;
  accentHue: number;    // 0..1
  densityBoost: number; // 0..1
}

export interface VisibleArtifact {
  handle: string; // base64 sealed-box
  relativeOffset: { dCol: number; dRow: number };
  hintCell: HintCell;
}

export interface VisibilityResponse {
  visible: VisibleArtifact[];
}
