// Starts worker.ts in a worker thread: teaches this thread to read TypeScript first (tsx), as the main thread's `tsx` command did.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
