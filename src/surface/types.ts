export type Vec3 = readonly [number, number, number];
export type UV = readonly [number, number];

/** Symmetric 2x2 metric: [g_uu, g_uv, g_vv]. */
export type Metric2 = readonly [number, number, number];

/** Christoffel symbols Γ^k_{ij}, symmetric in (i,j).
 * Order: Γ^u_uu, Γ^u_uv, Γ^u_vv, Γ^v_uu, Γ^v_uv, Γ^v_vv. */
export type Christoffel2 = readonly [number, number, number, number, number, number];

export interface Chart {
  id: number;
  // For A1 single-chart torus: domain is [0,1)² with opposite edges glued.
}

export interface Atlas {
  charts: Chart[];
  wrapPosition(chart: number, u: number, v: number): { chart: number; u: number; v: number };
}

export interface ManifoldBackend {
  heightAt(u: number, v: number): number;
  embed(u: number, v: number): Vec3;
  normalAt(u: number, v: number): Vec3;
  metricAt(u: number, v: number): Metric2;
  christoffelAt(u: number, v: number): Christoffel2;
  atlas: Atlas;
}
