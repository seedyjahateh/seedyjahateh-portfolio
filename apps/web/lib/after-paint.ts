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
 * WHY THREE MEASURES AND NOT ONE. `name` alone is wall-clock, and CI showed
 * what that hides: 17.6 ms end to end, of which 0.3 ms was this application
 * doing anything. The rest is a browser interval, and a budget compared against
 * it is comparing against the display refresh rate — a handler doing literally
 * no work still cannot come in under one frame, because it must still wait for
 * one. Four rounds of optimisation went into that 0.3 ms before the split
 * existed to show it was never the cost.
 *
 * The interval splits at the frame boundary, which `requestAnimationFrame`
 * hands over as its timestamp:
 *
 *   startedAt ....... enteredAt ......... frameStart ......... painted
 *             |<- work ->|<- idle wait ->|<- style/layout/paint ->|
 *
 * `:wait` is the browser deciding when the next frame is, and no amount of
 * engineering shortens it. `:render` is style, layout and paint for the
 * mutations just made — main-thread time this code is fully responsible for,
 * and the part a careless DOM change makes expensive.
 *
 * So `:main` is work + render: every millisecond of main-thread time spent on
 * this interaction's behalf, and nothing that was spent waiting. Its `duration`
 * is the sum of two disjoint intervals rather than a wall-clock span, which is
 * why it is built from an explicit duration rather than two timestamps.
 *
 * Wrapped throughout. Measurement must never take down the thing it measures.
 */
export function measureAfterPaint(name: string, startedAt: number): void {
  // Called immediately after the synchronous handler returns, so this is where
  // the work ends and the waiting begins.
  const enteredAt = performance.now();

  requestAnimationFrame((frameStart) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      const painted = performance.now();
      // A frame already in flight can report a start before this call. Clamping
      // keeps a negative wait from being subtracted out of the render cost.
      const boundary = Math.max(enteredAt, Math.min(frameStart, painted));
      try {
        performance.measure(name, { start: startedAt, duration: painted - startedAt });
        performance.measure(`${name}:work`, {
          start: startedAt,
          duration: enteredAt - startedAt,
        });
        performance.measure(`${name}:wait`, {
          start: enteredAt,
          duration: boundary - enteredAt,
        });
        performance.measure(`${name}:render`, { start: boundary, duration: painted - boundary });
        performance.measure(`${name}:main`, {
          start: startedAt,
          duration: enteredAt - startedAt + (painted - boundary),
        });
      } catch {
        // No User Timing here; nothing is recorded.
      }
      channel.port1.close();
      channel.port2.close();
    };
    channel.port2.postMessage(null);
  });
}
