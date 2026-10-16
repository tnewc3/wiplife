/**
 * A simulated player's run in a worker thread (tools/simulate.ts starts one for the careless player so it runs beside
 * the careful player's lives and their heirs instead of after them: the same lives and the same report, in less wall-clock
 * time). The report is plain data, so it comes back by structured clone.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { setAutoFreeze } from 'immer';
import compiled from '../../src/content/compiled/content.json';
import type { ContentBundle, CountryId } from '../../src/content/schemas';
import { withCountryTargets } from './countries';
import { runSimulation, type SimulatedPlayer } from './run';

interface Job {
  player: SimulatedPlayer;
  lives: number;
  seedPrefix: string;
  country?: CountryId;
}

const job = workerData as Job;
// The same as the main thread's policy (see tools/simulate.ts): immutability is checked in the engine's unit tests.
setAutoFreeze(false);
const bundle = compiled as ContentBundle;
const content = job.country ? withCountryTargets(bundle, job.country) : bundle;
const report = runSimulation(content, { lives: job.lives, seedPrefix: job.seedPrefix, player: job.player, ...(job.country ? { country: job.country } : {}) });
parentPort!.postMessage(report);
