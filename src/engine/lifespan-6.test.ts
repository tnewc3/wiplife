import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(6 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 6 of ${SHARDS})`, () => lifespanShard(6));
