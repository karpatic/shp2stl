// Author: Codex app agent · 2026-09-12. Comparison reveal only; wiping never resizes or builds a model.
export function setupLayout() {
  const views = document.getElementById('views');
  const splitter = document.getElementById('view-splitter');
  let ratio = .5, pointer = null, frame = 0;
  function size() {
    frame = 0;
    ratio = Math.max(0, Math.min(1, ratio));
    // Clip the full-size wrapper; neither renderer is resized or reframed.
    views.style.setProperty('--reveal', `${ratio * 100}%`);
    splitter.setAttribute('aria-valuenow', Math.round(ratio * 100));
    splitter.setAttribute('aria-valuetext', `Map ${Math.round(ratio * 100)}%, 3D ${Math.round((1-ratio) * 100)}%`);
    document.getElementById('map-pane').inert = ratio === 0;
    document.getElementById('model-pane').inert = ratio === 1 && !views.parentElement.classList.contains('drawing-source');
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(size); };
  const move = event => {
    const rect = views.getBoundingClientRect();
    ratio = (event.clientX - rect.left) / rect.width;
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
  new MutationObserver(schedule).observe(views.parentElement, {attributes:true, attributeFilter:['class']});
  size();
}
