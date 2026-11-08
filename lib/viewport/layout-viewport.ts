/**
 * Size of the layout viewport in CSS pixels. `visualViewport` follows the
 * on-screen keyboard and browser chrome, but it also shrinks while the visitor
 * pinch-zooms; multiplying by its scale undoes the zoom part, so zooming in
 * enlarges the page instead of shrinking the fitted stage. At scale 1 this is
 * exactly `visualViewport.width/height`.
 */
export function layoutViewportSize(): { width: number; height: number } {
  const viewport = window.visualViewport;
  if (!viewport) return { width: window.innerWidth, height: window.innerHeight };
  const scale = viewport.scale > 0 ? viewport.scale : 1;
  return { width: viewport.width * scale, height: viewport.height * scale };
}
