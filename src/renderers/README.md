# Renderers

Each renderer implements `Renderer` from `./types.ts`.

| Kind    | Status        | Notes                                                            |
|---------|---------------|------------------------------------------------------------------|
| ascii   | implemented   | Reads CellState.density for glyph index; HSV → RGB per cell.     |
| webgl2  | planned       | GPU-accelerated ASCII; consumes the same Frame.                  |
| webgpu  | planned       | Same as webgl2 but WebGPU backend.                               |
| vector  | planned       | SVG output; consumes CellState shape/glyphId where available.    |
| pixel   | future        | Consumes a different world description (see forward-compat).     |
