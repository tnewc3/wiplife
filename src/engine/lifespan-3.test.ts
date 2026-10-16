import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(3 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 3 of ${SHARDS})`, () => lifespanShard(3));
