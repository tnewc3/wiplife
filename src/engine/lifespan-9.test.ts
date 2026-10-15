import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(9 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 9 of ${SHARDS})`, () => lifespanShard(9));
