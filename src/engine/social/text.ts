/**
 * Values social events and history lines can use in their text (Batch 8):
 * {platform} (the platform the event is about, "TikTok"), {handle} (the
 * account's handle, without the @), {followerWords} (how many followers it
 * has, in words), {niche} (what it is about) and {postNoun} (what a post is
 * there: "video", "episode"). The account is the one the social step named for
 * the event, else your biggest. The content build checks that an event using
 * one requires an account (tools/content/social.ts). Reads only.
 */
import { SOCIAL_TEXT_VALUES, type ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { focusAccount, followerWords, platformOf } from './query';

export { SOCIAL_TEXT_VALUES };

export function socialTextValues(state: LifeState, content: ContentBundle): Record<string, string> {
  const a = focusAccount(state);
  const platform = a ? platformOf(content, a.platform) : undefined;
  return {
    platform: platform?.name ?? '',
    handle: a?.handle ?? '',
    followerWords: a ? followerWords(a.followers, content) : '',
    niche: a ? (content.niches[a.niche]?.noun ?? '') : '',
    postNoun: platform?.noun ?? '',
  };
}
