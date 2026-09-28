// Игровой цикл с фиксированным шагом логики (60 раз в секунду)
// и отрисовкой на каждом кадре браузера.

export const STEP = 1 / 60;

export class Loop {
  timeScale = 1;
  private acc = 0;
  private last = -1;
  private running = false;
  /** Кадров в секунду (для отладочного оверлея). */
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -1;
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    if (this.last < 0) this.last = now;
    const real = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;

    this.fpsAcc += real;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    this.acc += real * this.timeScale;
    const maxSteps = Math.ceil(8 * Math.max(1, this.timeScale));
    let n = 0;
    while (this.acc >= STEP && n < maxSteps) {
      this.update(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n >= maxSteps) this.acc = 0;
    this.render(this.acc / STEP, real);
    requestAnimationFrame(this.frame);
  };
}
