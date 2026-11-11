/** Art pixels the view is tall, roughly. */
const VIEW_H = 330;

/**
 * How many screen pixels one art pixel covers on this screen. The city and the headline both use
 * it, so they share one pixel grid. Narrow screens get smaller art pixels (a phone still sees a few blocks).
 */
export function artPixel(): number {
  return Math.max(2, Math.round(Math.min(window.innerHeight / VIEW_H, window.innerWidth / 260)));
}
