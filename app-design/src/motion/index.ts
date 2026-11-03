/*
 * @orangecheck/app-design/motion: the family's motion, on one sleeping loop.
 * Nothing here is reachable from `.` or `./components`; a page that imports
 * none of it carries none of it.
 */
export { ParticlePortrait } from './particle-portrait';
export type { Callout, ParticlePortraitProps } from './particle-portrait';
export { ParticleText } from './particle-text';
export type { ParticleTextProps } from './particle-text';
export { CrowdDissolve } from './crowd-dissolve';
export type { CrowdDissolveProps } from './crowd-dissolve';
export { StorySwap, watchStory } from './story';
export type { StorySwapProps } from './story';
export { MiniCheck } from './mini-check';
export type { MiniCheckProps } from './mini-check';
export { StackCards } from './stack-cards';
export type { StackCardsProps } from './stack-cards';
export { Marquee } from './marquee';
export type { MarqueeProps } from './marquee';
export { DitherImage } from './dither-image';
export type { DitherImageProps } from './dither-image';
export { Wipe } from './wipe';
export type { WipeProps } from './wipe';
export { decodePoints, fetchPoints, portraitPoints, unpackPoints, PORTRAIT_ANCHORS } from './points';
export type { Points } from './points';
export { schedule } from './scheduler';
export type { Scene, Ticket } from './scheduler';
// The scroll story and the count-up the scenes play beside, so a page imports its motion from one place.
export { Reveal, ScrollStory, Ticker } from '../components/motion';
