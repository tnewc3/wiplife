import { describe } from 'vitest';
import { lifespanShard } from './lifespanShard';

describe('10,000 random lives (shard 3 of 4)', () => lifespanShard(3));
