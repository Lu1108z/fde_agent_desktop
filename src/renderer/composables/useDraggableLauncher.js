import {ref, computed, watch, onMounted, onBeforeUnmount} from 'vue';

export function useDraggableLauncher(storageKey, activate) {
  const launcherRef = ref(null);
  const position = ref(null);
  const dragging = ref(false);
  const runDirection = ref(1);
  const running = ref(false);
  const runDuration = ref(1100);
  let runTimer;
  const launcherStyle = computed(() => position.value ? {left:`${position.value.x}px`, top:`${position.value.y}px`, right:'auto', bottom:'auto'} : {});
  let gesture = null;
  let ignoreClickUntil = 0;

  function bounds(element) {
    const box = element.getBoundingClientRect();
    const visuals = [box, ...[...element.children].map(child => child.getBoundingClientRect()), ...[...element.querySelectorAll('img')].map(image => image.getBoundingClientRect())];
    const left = Math.max(0, box.left - Math.min(...visuals.map(rect => rect.left)));
    const right = Math.max(0, Math.max(...visuals.map(rect => rect.right)) - box.right);
    const top = Math.max(0, box.top - Math.min(...visuals.map(rect => rect.top)));
    const bottom = Math.max(0, Math.max(...visuals.map(rect => rect.bottom)) - box.bottom);
    const headerBottom = element.closest('.workbench-root')?.getBoundingClientRect().top || 0;
    const minX = 12 + left;
    const minY = headerBottom + 12 + top;
    return {minX, minY, maxX:Math.max(minX, window.innerWidth - 12 - box.width - right), maxY:Math.max(minY, window.innerHeight - 8 - box.height - bottom)};
  }
  function clamp(point, limits) {
    return {x:Math.min(limits.maxX, Math.max(limits.minX, point.x)), y:Math.min(limits.maxY, Math.max(limits.minY, point.y))};
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(position.value)); } catch (_) {}
  }
  function fit() {
    if (launcherRef.value && position.value) position.value = clamp(position.value, bounds(launcherRef.value));
  }
  function startDrag(event) {
    if (!event.isPrimary || event.button !== 0) return;
    const element = event.currentTarget;
    const box = element.getBoundingClientRect();
    gesture = {id:event.pointerId, startX:event.clientX, startY:event.clientY, lastX:event.clientX, lastY:event.clientY, lastTime:performance.now(), x:box.left, y:box.top, limits:bounds(element), element};
    ignoreClickUntil = 0;
    element.setPointerCapture(event.pointerId);
  }
  function moveDrag(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!dragging.value && Math.hypot(dx,dy) < 6) return;
    dragging.value = true;
    const horizontalMove = event.clientX - gesture.lastX;
    if (Math.abs(horizontalMove) > 1) runDirection.value = horizontalMove < 0 ? -1 : 1;
    const now = performance.now();
    const distance = Math.hypot(horizontalMove, event.clientY - gesture.lastY);
    if (distance > 0.5) {
      // 固定步频，拖动速度只改变位移，避免腿部抽动。
      runDuration.value = 1100;
      running.value = true;
      clearTimeout(runTimer);
      runTimer = setTimeout(() => { running.value = false; }, 160);
    }
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    gesture.lastTime = now;
    event.preventDefault();
    position.value = clamp({x:gesture.x+dx, y:gesture.y+dy}, gesture.limits);
  }
  function endDrag(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (dragging.value || event.type === 'pointercancel') ignoreClickUntil = Date.now() + 500;
    if (dragging.value) persist();
    const {element,id} = gesture;
    gesture = null;
    dragging.value = false;
    running.value = false;
    clearTimeout(runTimer);
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
  }
  function clickLauncher(event) {
    if (event.detail !== 0 && Date.now() < ignoreClickUntil) { event.preventDefault(); return; }
    activate();
  }
  function moveWithKeyboard(event) {
    if (!event.shiftKey || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const box = launcherRef.value.getBoundingClientRect();
    const point = position.value || {x:box.left,y:box.top};
    const [dx,dy] = {ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[event.key];
    position.value = clamp({x:point.x+dx,y:point.y+dy}, bounds(launcherRef.value));
    persist();
  }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position.value = {x:saved.x,y:saved.y};
  } catch (_) {}
  watch(launcherRef, fit, {flush:'post'});
  onMounted(() => window.addEventListener('resize', fit));
  onBeforeUnmount(() => { window.removeEventListener('resize', fit); clearTimeout(runTimer); gesture = null; });
  return {launcherRef, launcherStyle, dragging, running, runDuration, runDirection, startDrag, moveDrag, endDrag, clickLauncher, moveWithKeyboard};
}
