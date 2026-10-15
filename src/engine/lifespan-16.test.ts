import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(16 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 16 of ${SHARDS})`, () => lifespanShard(16));
