import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(5 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 5 of ${SHARDS})`, () => lifespanShard(5));
