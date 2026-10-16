import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(12 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 12 of ${SHARDS})`, () => lifespanShard(12));
