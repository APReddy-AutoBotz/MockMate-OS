declare module 'pdf-parse/worker' {
  export class CanvasFactory {
    create(width: number, height: number): { canvas: unknown; context: unknown };
    reset(canvasAndContext: { canvas: unknown; context: unknown }, width: number, height: number): void;
    destroy(canvasAndContext: { canvas: unknown; context: unknown }): void;
  }
}
