import type { Project, Scene } from "./types";

export const TRANSITION_DURATION = 0.5;

export const totalDuration = (p: Pick<Project, "scenes">) => p.scenes.reduce((s, sc) => s + sc.duration, 0);

export function sceneStarts(scenes: Scene[]) {
  const out: number[] = [];
  let acc = 0;
  for (const s of scenes) {
    out.push(acc);
    acc += s.duration;
  }
  return out;
}

export interface FrameState {
  index: number;
  local: number;
  /** When a transition is active: previous scene index, its local time and progress 0..1. */
  transition?: { prevIndex: number; prevLocal: number; progress: number; kind: Scene["transition"] };
}

/** Map a global time to the active scene. Transitions happen during the first part of the incoming scene. */
export function frameState(scenes: Scene[], t: number): FrameState {
  const total = totalDuration({ scenes });
  const tc = Math.min(Math.max(t, 0), Math.max(0, total - 1e-6));
  const starts = sceneStarts(scenes);
  let index = scenes.length - 1;
  for (let i = 0; i < scenes.length; i++) {
    if (tc < starts[i] + scenes[i].duration) {
      index = i;
      break;
    }
  }
  const local = tc - starts[index];
  const sc = scenes[index];
  const td = Math.min(TRANSITION_DURATION, sc.duration / 2);
  if (index > 0 && sc.transition !== "cut" && local < td) {
    const prev = scenes[index - 1];
    return {
      index,
      local,
      transition: { prevIndex: index - 1, prevLocal: prev.duration + local, progress: local / td, kind: sc.transition },
    };
  }
  return { index, local };
}
