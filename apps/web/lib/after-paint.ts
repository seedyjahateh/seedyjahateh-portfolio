/**
 * Close a User Timing measure just after the browser paints.
 *
 * Authority: PRD 5.2.3 (`SEARCH-PAINT`, main-thread work "through painted
 * results"), 9.1 (`FILTER-TO-PAINT`).
 *
 * WHY NOT A DOUBLE requestAnimationFrame. That is the common trick, and it
 * systematically overstates. A rAF callback runs BEFORE the paint of its frame,
 * so a nested one runs at the START of the following frame — up to a full
 * 16.7 ms frame interval after the pixels appeared, most of it spent idle. It
 * measured `SEARCH-PAINT` at 31.8 ms against a 16 ms budget on CI, and roughly
 * one frame of that was the technique rather than the work.
 *
 * A message task instead: posting through a MessageChannel from inside the rAF
 * callback schedules a task that runs after the frame's rendering steps, which
 * is as close to "painted" as the platform exposes without a dedicated API.
 *
 * WHY A TIMESTAMP RATHER THAN A START MARK. Marks are global and addressed by
 * name, so two interactions in flight at once share one. Opening and closing
 * the palette six times in a row raced exactly that way: a pending measure
 * cleared the mark a later one still needed, and CI recorded no opens at all.
 * A timestamp belongs to its own call and cannot be clobbered.
 *
 * Wrapped throughout. Measurement must never take down the thing it measures.
 */
export function measureAfterPaint(name: string, startedAt: number): void {
  requestAnimationFrame(() => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      try {
        performance.measure(name, { start: startedAt, duration: performance.now() - startedAt });
      } catch {
        // No User Timing here; nothing is recorded.
      }
      channel.port1.close();
      channel.port2.close();
    };
    channel.port2.postMessage(null);
  });
}
