import type { Descriptor, GeodesicCoords } from '../../manifold/types';

export class ASCIIRenderer {
  private grid: string[][];
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ' ')
    );
  }

  render(coords: GeodesicCoords, descriptor: Descriptor): void {
    const [x, y] = coords;
    const gridX = Math.floor((x + 25) % this.width);
    const gridY = Math.floor((y + 12) % this.height);

    if (gridX >= 0 && gridX < this.width && gridY >= 0 && gridY < this.height) {
      // Curvature maps to character density
      const curvature = Math.abs(descriptor.curvature_tensor[0]?.[0] ?? 1);
      const char = curvature > 1.05 ? '#' : curvature > 1.02 ? '+' : '*';
      this.grid[gridY]![gridX] = char;
    }
  }

  setCell(col: number, row: number, char: string): void {
    if (row >= 0 && row < this.height && col >= 0 && col < this.width) {
      this.grid[row]![col] = char;
    }
  }

  getCell(col: number, row: number): string {
    if (row >= 0 && row < this.height && col >= 0 && col < this.width) {
      return this.grid[row]![col]!;
    }
    return ' ';
  }

  toString(): string {
    return this.grid.map(row => row.join('')).join('\n');
  }
}
