import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(14 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 14 of ${SHARDS})`, () => lifespanShard(14));
