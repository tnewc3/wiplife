import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(10 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 10 of ${SHARDS})`, () => lifespanShard(10));
