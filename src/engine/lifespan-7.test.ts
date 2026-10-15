import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(7 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 7 of ${SHARDS})`, () => lifespanShard(7));
