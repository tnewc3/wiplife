import { describe } from 'vitest';
import { lifespanShard, SHARDS, TOTAL_LIVES } from './lifespanShard';

describe(`${TOTAL_LIVES.toLocaleString('en-US')} random lives (shard 2 of ${SHARDS})`, () => lifespanShard(2));
