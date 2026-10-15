import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(15 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 15 of ${SHARDS})`, () => lifespanShard(15));
