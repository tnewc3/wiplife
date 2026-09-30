import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 4 of ${SHARDS})`, () => lifespanShard(4));
