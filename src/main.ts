// Точка входа.
import { App } from './app';

const canvas = document.getElementById('game') as HTMLCanvasElement;

// Режим просмотра спрайтов скакунов: ?scene=mounts
import { MOUNTS } from './game/mounts';
import { mountFrames } from './art/horse';
import { Screen } from './engine/screen';
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
const app = new App(canvas);
app.start();
(window as unknown as { __ready: boolean; __app: App }).__ready = true;
(window as unknown as { __app: App }).__app = app;
