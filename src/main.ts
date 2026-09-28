// Точка входа.
import { App } from './app';

const canvas = document.getElementById('game') as HTMLCanvasElement;

// Режим просмотра спрайтов скакунов: ?scene=mounts
import { MOUNTS } from './game/mounts';
import { mountFrames } from './art/horse';
import { Screen } from './engine/screen';
import { treeGallery, townGallery, defenseGallery, peopleGallery } from './debug/gallery';
const qs = new URLSearchParams(location.search);
if (qs.get('scene') === 'mounts') {
  const scr = new Screen(canvas);
  const d = scr.displayContext;
  d.fillStyle = '#6d8a6a';
  d.fillRect(0, 0, canvas.width, canvas.height);
  let y = 10;
  for (const m of Object.values(MOUNTS)) {
    for (const [j, anim] of (['idle', 'walk', 'gallop'] as const).entries()) {
      const f = mountFrames('view:' + m.id, anim, m.look, m.id === 'horse' ? null : null)[1];
      d.imageSmoothingEnabled = false;
      d.drawImage(f.img, 10 + j * 240, y, f.w * 5, f.h * 5);
    }
    y += 130;
  }
  (window as unknown as { __ready: boolean }).__ready = true;
  throw new Error('mount view');
}
if (qs.get('scene') === 'people') {
  canvas.style.display = 'none';
  peopleGallery(Number(qs.get('scale') ?? 5));
  (window as unknown as { __ready: boolean }).__ready = true;
  throw new Error('tree view');
}
if (qs.get('scene') === 'defense') {
  canvas.style.display = 'none';
  defenseGallery(Number(qs.get('scale') ?? 4));
  (window as unknown as { __ready: boolean }).__ready = true;
  throw new Error('tree view');
}
if (qs.get('scene') === 'town') {
  canvas.style.display = 'none';
  townGallery(Number(qs.get('scale') ?? 3));
  (window as unknown as { __ready: boolean }).__ready = true;
  throw new Error('tree view');
}
if (qs.get('scene') === 'trees') {
  canvas.style.display = 'none';
  treeGallery((qs.get('season') ?? 'summer') as 'summer', Number(qs.get('scale') ?? 2));
  (window as unknown as { __ready: boolean }).__ready = true;
  throw new Error('tree view');
}
// Сначала браузер успевает показать заставку «Загрузка…», потом строится
// мир (деревья, облака и замки рисуются кодом — на слабом телефоне это заметно).
function launch(): void {
  const app = new App(canvas);
  app.start();
  (window as unknown as { __app: App }).__app = app;
  (window as unknown as { __ready: boolean }).__ready = true;
  const boot = document.getElementById('boot');
  if (boot) {
    requestAnimationFrame(() => {
      boot.style.opacity = '0';
      setTimeout(() => boot.remove(), 450);
    });
  }
}
requestAnimationFrame(() => setTimeout(launch, 0));
