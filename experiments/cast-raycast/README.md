# Cast: raycast kerning prototype

Cast is a dependency-free browser experiment for spacing glyphs by directional contact. Each new glyph casts an infinite shadow backwards at a chosen angle. Starting infinitely far to the right, the glyph moves left until that shadow first touches the silhouette immediately before it.

## Run it

```sh
npm run dev
```

Open <http://127.0.0.1:4173>. Choose a system font or upload an OTF, TTF, WOFF, or WOFF2 file. Run the geometry tests with `npm test`.

## Geometry

Glyphs are rasterized on a shared baseline and reduced to an inclusive left edge and exclusive right edge for every occupied scanline. For a previous-glyph edge point `a`, a current-glyph edge point `b`, and unit shadow direction `d`, a candidate ray satisfies:

```text
a = b + (offset, 0) + distance * d
```

The vertical coordinates determine `distance`; the interaction rule chooses an `offset` from the feasible candidates. **First touch** chooses the largest offset—the first contact encountered while moving in from the right. **Robust edge** chooses a high percentile while clamping to the direct-ink collision boundary, making it less sensitive to isolated serifs or dots.

The raycaster and rule selector are separate in [`src/raycast.js`](./src/raycast.js). A custom rule can be a function, or a definition with a stable id that receives neutral candidates plus context and returns one candidate:

```js
const chooseShortestWitness = (candidates) =>
  candidates.reduce((best, candidate) =>
    !best || candidate.distance < best.distance ? candidate : best
  , null);

const houseRule = {
  id: "house-style",
  select: chooseShortestWitness,
};
```

Pass that function as `rule` to `solveRaycastPair`. This boundary leaves room for capped rays, minimum contact counts, feature-weighted edges, or clearance without coupling those policies to font rasterization. Changing the interaction scope from the prior glyph to the union of earlier glyphs belongs in the separate layout/candidate-source layer.

## Prototype boundaries

- An infinite horizontal shadow cannot have a finite first contact, so the UI limits angles to 10–90° from the baseline.
- Empty silhouettes such as spaces fall back to the font's authored advance.
- Layout is intentionally pairwise and left-to-right. It does not yet shape ligatures, RTL scripts, or contextual substitutions.
- Browser canvas rasterization makes local font upload simple, but results can vary slightly by browser and operating system. A production exporter should read font outlines directly at a fixed scale.
