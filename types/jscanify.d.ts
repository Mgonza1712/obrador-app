declare module 'jscanify' {
  export default class jscanify {
    findPaperContour(img: unknown): unknown | null;
    highlightPaper(image: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement, options?: { color?: string; thickness?: number }): HTMLCanvasElement;
    extractPaper(image: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement, resultWidth: number, resultHeight: number, cornerPoints?: unknown): HTMLCanvasElement | null;
    getCornerPoints(contour: unknown): {
      topLeftCorner: { x: number; y: number } | undefined;
      topRightCorner: { x: number; y: number } | undefined;
      bottomLeftCorner: { x: number; y: number } | undefined;
      bottomRightCorner: { x: number; y: number } | undefined;
    };
  }
}

declare module 'jscanify/client' {
  export { default } from 'jscanify';
}
