// Keep the received answer intact; only pace its presentation when chunks arrive in bursts.
// 浏览器的 setInterval 必须以 window 为 this 调用，否则 Chromium 报 Illegal invocation
const defaultClock = { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (id) => clearInterval(id) };

export function createTextReveal(onUpdate, clock = defaultClock) {
  let target = '';
  let visible = '';
  let timer = null;
  const stop = () => {
    if (timer !== null) clock.clearInterval(timer);
    timer = null;
  };
  const publish = () => onUpdate(visible, visible.length < target.length);
  const tick = () => {
    const remaining = target.slice(visible.length);
    // Large documents catch up faster, while short answers remain easy to follow.
    const count = Math.max(5, Math.ceil(remaining.length / 50));
    let end = 0;
    let consumed = 0;
    for (const char of remaining) {
      end += char.length;
      if (++consumed >= count) break;
    }
    visible += remaining.slice(0, end);
    if (visible === target) stop();
    publish();
  };
  return {
    update(text, animate = true) {
      target = text || '';
      if (!animate || !target.startsWith(visible)) {
        stop();
        visible = target;
        publish();
        return;
      }
      if (visible !== target && timer === null) {
        tick(); // First characters appear immediately, before the next animation tick.
        if (visible !== target) timer = clock.setInterval(tick, 80);
      }
    },
    dispose: stop,
  };
}
