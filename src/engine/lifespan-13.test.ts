import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe.skipIf(13 > SHARDS)(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 13 of ${SHARDS})`, () => lifespanShard(13));
