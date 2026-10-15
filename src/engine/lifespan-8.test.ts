import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(8 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 8 of ${SHARDS})`, () => lifespanShard(8));
