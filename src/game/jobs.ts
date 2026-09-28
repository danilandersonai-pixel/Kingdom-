// Доска заказов для строителей: стройка, ремонт, рубка, детали лодки,
// обслуживание катапульт и баллист. На заказ идут до двух ближайших свободных.

import type { Structure } from './structures/structure';

export type JobKind = 'build' | 'repair' | 'chop' | 'boat' | 'operate' | 'push';

export interface Job {
  id: number;
  kind: JobKind;
  target: Structure;
  maxWorkers: number;
  workers: Set<number>;
  created: number;
}

let nextJob = 1;

export class JobBoard {
  jobs: Job[] = [];

  add(kind: JobKind, target: Structure, maxWorkers = 2, created = 0): Job {
    const existing = this.jobs.find((j) => j.target === target && j.kind === kind);
    if (existing) return existing;
    const j: Job = { id: nextJob++, kind, target, maxWorkers, workers: new Set(), created };
    this.jobs.push(j);
    return j;
  }

  remove(job: Job): void {
    this.jobs = this.jobs.filter((j) => j !== job);
  }

  removeFor(target: Structure, kind?: JobKind): void {
    this.jobs = this.jobs.filter((j) => j.target !== target || (kind !== undefined && j.kind !== kind));
  }

  /** Найти заказ для строителя: сначала старые (FIFO), среди них ближайшие.
   * Обслуживание катапульт и баллист ночью важнее стройки, днём — в последнюю очередь. */
  claim(workerId: number, x: number, allowFar: (j: Job) => boolean, night = false): Job | null {
    let best: Job | null = null;
    let bestScore = Infinity;
    for (const j of this.jobs) {
      if (j.target.dead) continue;
      if (j.workers.size >= j.maxWorkers) continue;
      if (!allowFar(j)) continue;
      // Ремонт — приоритетнее, остальное по порядку заказа.
      const prio = j.kind === 'repair' ? 0 : j.kind === 'operate' ? (night ? 1 : 3) : 2;
      const score = prio * 100000 + j.created * 10 + Math.abs(j.target.x - x) * 0.05;
      if (score < bestScore) {
        bestScore = score;
        best = j;
      }
    }
    if (best) best.workers.add(workerId);
    return best;
  }

  release(workerId: number): void {
    for (const j of this.jobs) j.workers.delete(workerId);
  }

  cleanup(): void {
    this.jobs = this.jobs.filter((j) => !j.target.dead);
  }
}
