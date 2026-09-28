// Игровая логика местами берёт случайность из fxRng, а он засеян от часов.
// В тестах посев фиксирован: каждый тест видит одну и ту же последовательность,
// и результат не зависит от момента запуска. TEST_SEED — для перебора посевов.
import { beforeEach } from 'vitest';
import { fxRng } from '../src/engine/rng';

declare const process: { env: Record<string, string | undefined> };

const seed = Number(process.env.TEST_SEED ?? 20260928) >>> 0;
beforeEach(() => {
  fxRng.state = seed;
});
