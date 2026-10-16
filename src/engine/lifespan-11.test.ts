import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(11 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 11 of ${SHARDS})`, () => lifespanShard(11));
