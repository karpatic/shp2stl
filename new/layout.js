// Author: Codex app agent · 2026-09-11. Layout only; resizing never builds a model.
export function setupLayout() {
  const views = document.getElementById('views');
  const splitter = document.getElementById('view-splitter');
  let ratio = .5, pointer = null, frame = 0;
  function size() {
    frame = 0;
    const height = views.clientHeight - splitter.offsetHeight;
    if (height <= 0) return;
    // Keep both panes recoverable, including their labels and placement feedback.
    const minimum = Math.min(120, height * .35);
    const low = Math.max(.2, minimum / height), high = 1 - low;
    ratio = Math.max(low, Math.min(high, ratio));
    views.style.gridTemplateRows = `minmax(0,${ratio}fr) 24px minmax(0,${1-ratio}fr)`;
    splitter.setAttribute('aria-valuemin', Math.ceil(low * 100));
    splitter.setAttribute('aria-valuemax', Math.floor(high * 100));
    splitter.setAttribute('aria-valuenow', Math.round(ratio * 100));
    splitter.setAttribute('aria-valuetext', `Map ${Math.round(ratio * 100)}%, 3D ${Math.round((1-ratio) * 100)}%`);
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(size); };
  const move = event => {
    const rect = views.getBoundingClientRect();
    ratio = (event.clientY - rect.top - splitter.offsetHeight / 2) / (rect.height - splitter.offsetHeight);
    schedule();
  };
  splitter.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    pointer = event.pointerId;
    splitter.setPointerCapture(pointer);
    splitter.focus({preventScroll:true});
    event.preventDefault();
  });
  splitter.addEventListener('pointermove', event => { if (event.pointerId === pointer) move(event); });
  const stop = event => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
  };
  for (const type of ['pointerup','pointercancel','lostpointercapture']) splitter.addEventListener(type, stop);
  splitter.addEventListener('keydown', event => {
    const step = event.shiftKey ? .1 : .05;
    if (['ArrowUp','ArrowLeft'].includes(event.key)) ratio -= step;
    else if (['ArrowDown','ArrowRight'].includes(event.key)) ratio += step;
    else if (event.key === 'Home') ratio = 0;
    else if (event.key === 'End') ratio = 1;
    else return;
    event.preventDefault(); schedule();
  });
  new ResizeObserver(schedule).observe(views);
  size();
}
