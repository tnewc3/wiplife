import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(1 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 1 of ${SHARDS})`, () => lifespanShard(1));
