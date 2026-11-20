import { comparePhotos } from "./group";
import type { Photo } from "./types";

/** Slide-show order, kept in the URL hash as order=… (default "catalog"). */
export type SlideOrder = "catalog" | "date" | "name" | "shuffle";

export const ORDERS: { order: SlideOrder; label: string }[] = [
  { order: "catalog", label: "Catalog order" },
  { order: "date", label: "Oldest first" },
  { order: "name", label: "By file name" },
  { order: "shuffle", label: "Shuffle" },
];

export const DEFAULT_SECS = 4;
export const MIN_SECS = 1;
export const MAX_SECS = 600;

export function parseOrder(s: string | undefined): SlideOrder {
  return ORDERS.some((o) => o.order === s) ? (s as SlideOrder) : "catalog";
}

/** Seconds per slide from the hash (secs=…): a number from 1 to 600, else the default. */
export function parseSecs(s: string | undefined): number {
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return DEFAULT_SECS;
  return Math.min(MAX_SECS, Math.max(MIN_SECS, Math.round(n * 10) / 10));
}

/** Oldest first; undated photos last, then by path. */
function byDate(a: Photo, b: Photo): number {
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.date && !b.date) return -1;
  if (!a.date && b.date) return 1;
  return byName(a, b);
}

function byName(a: Photo, b: Photo): number {
  return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * The photos in slide-show order. "catalog": cataloged photos in catalog order, then the
 * rest newest first (as in the grid). "shuffle" uses `random` (0 ≤ x < 1).
 */
export function orderPhotos(photos: Photo[], order: SlideOrder, random: () => number = Math.random): Photo[] {
  const list = [...photos];
  if (order === "catalog") return list.sort(comparePhotos);
  if (order === "date") return list.sort(byDate);
  if (order === "name") return list.sort(byName);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Index i wrapped into 0…n-1 (the show loops). */
export function wrap(i: number, n: number): number {
  return n ? ((i % n) + n) % n : 0;
}

// ---- Transitions ----

/** How one slide replaces the next, kept in the hash as transition=… (default "black"). */
export type Transition = "none" | "dissolve" | "black" | "slide" | "wipe" | "zoom";

export const TRANSITIONS: { transition: Transition; label: string }[] = [
  { transition: "black", label: "Fade through black" },
  { transition: "slide", label: "Slide" },
  { transition: "dissolve", label: "Dissolve" },
  { transition: "wipe", label: "Wipe" },
  { transition: "zoom", label: "Zoom" },
  { transition: "none", label: "No transition" },
];
export const DEFAULT_TRANSITION: Transition = "black";

/** Transition speed, kept in the hash as speed=quick|normal (default "slow"). */
export type Speed = "quick" | "normal" | "slow";
export const DEFAULT_SPEED: Speed = "slow";
export const SPEEDS: { speed: Speed; label: string; ms: number }[] = [
  { speed: "quick", label: "Quick", ms: 400 },
  { speed: "normal", label: "Normal", ms: 800 },
  { speed: "slow", label: "Slow", ms: 1600 },
];

export function parseTransition(s: string | undefined): Transition {
  return TRANSITIONS.some((t) => t.transition === s) ? (s as Transition) : DEFAULT_TRANSITION;
}

export function parseSpeed(s: string | undefined): Speed {
  return SPEEDS.some((x) => x.speed === s) ? (s as Speed) : DEFAULT_SPEED;
}

/** Motion-heavy transitions become a dissolve when the viewer asks for reduced motion. */
export function effectiveTransition(t: Transition, reducedMotion: boolean): Transition {
  return reducedMotion && (t === "slide" || t === "wipe" || t === "zoom") ? "dissolve" : t;
}

/** Transition length in ms: the speed's length, but never more than half the time per slide. */
export function transitionMs(t: Transition, speed: Speed, secs: number): number {
  if (t === "none") return 0;
  const ms = SPEEDS.find((x) => x.speed === speed)!.ms;
  return Math.min(ms, secs * 500);
}

type Frames = Keyframe[];
export interface TransitionFrames {
  /** Keyframes for the photo coming in and the one going out; null = no animation. */
  incoming: Frames | null;
  outgoing: Frames | null;
  /** Fade through black: the old photo goes in the first half, the new one comes in the second. */
  sequential?: boolean;
}

/**
 * Keyframes (Web Animations) for a transition. `dir` is +1 when moving forward and -1 when
 * moving back, so a slide or wipe runs the other way for "previous".
 */
export function transitionFrames(t: Transition, dir: 1 | -1): TransitionFrames {
  switch (t) {
    case "dissolve":
      return { incoming: [{ opacity: 0 }, { opacity: 1 }], outgoing: [{ opacity: 1 }, { opacity: 0 }] };
    case "black":
      return { incoming: [{ opacity: 0 }, { opacity: 1 }], outgoing: [{ opacity: 1 }, { opacity: 0 }], sequential: true };
    case "slide":
      return {
        incoming: [{ transform: `translateX(${dir * 100}%)` }, { transform: "translateX(0)" }],
        outgoing: [{ transform: "translateX(0)" }, { transform: `translateX(${-dir * 100}%)` }],
      };
    case "wipe":
      return {
        incoming: dir > 0
          ? [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }]
          : [{ clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 0)" }],
        outgoing: null, // stays put underneath until covered
      };
    case "zoom":
      return {
        incoming: [{ opacity: 0, transform: "scale(0.92)" }, { opacity: 1, transform: "scale(1)" }],
        outgoing: [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.06)" }],
      };
    default:
      return { incoming: null, outgoing: null };
  }
}

/**
 * Slow pan and zoom ("Ken Burns") for one slide: a gentle zoom in from 100% to 108% with a
 * drift toward one of four corners chosen by `random`.
 */
export function panFrames(random: () => number = Math.random): Frames {
  const dx = random() < 0.5 ? -2 : 2, dy = random() < 0.5 ? -2 : 2;
  return [{ transform: "scale(1) translate(0, 0)" }, { transform: `scale(1.08) translate(${dx}%, ${dy}%)` }];
}
