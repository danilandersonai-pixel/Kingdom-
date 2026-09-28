// Точка входа.
import { App } from './app';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const app = new App(canvas);
app.start();
(window as unknown as { __ready: boolean; __app: App }).__ready = true;
(window as unknown as { __app: App }).__app = app;
