export const PLAYBACK_SPEEDS = [1, 4, 16, 64] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
export const DEFAULT_SPEED: PlaybackSpeed = 4;

export interface PlaybackState {
  elapsed: number;
  duration: number;
  isPlaying: boolean;
  speed: PlaybackSpeed;
}

interface Clock {
  now: () => number;
  requestFrame: (cb: () => void) => number;
  cancelFrame: (id: number) => void;
}

const browserClock: Clock = {
  now: () => performance.now(),
  requestFrame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

export const makePlayback = (clock: Clock = browserClock) => {
  let state: PlaybackState = {
    elapsed: 0,
    duration: 0,
    isPlaying: false,
    speed: DEFAULT_SPEED,
  };
  const listeners = new Set<(s: PlaybackState) => void>();
  let frame = 0;
  let last = 0;

  const set = (next: Partial<PlaybackState>) => {
    state = { ...state, ...next };
    for (const fn of listeners) fn(state);
  };

  const stop = () => {
    if (frame) clock.cancelFrame(frame);
    frame = 0;
  };

  const tick = () => {
    const now = clock.now();
    const elapsed = state.elapsed + (now - last) * state.speed;
    last = now;
    if (elapsed >= state.duration) {
      frame = 0;
      set({ elapsed: state.duration, isPlaying: false });
      return;
    }
    frame = clock.requestFrame(tick);
    set({ elapsed });
  };

  const play = () => {
    if (state.isPlaying || state.duration <= 0) return;
    last = clock.now();
    frame = clock.requestFrame(tick);
    set({
      isPlaying: true,
      elapsed: state.elapsed >= state.duration ? 0 : state.elapsed,
    });
  };

  const pause = () => {
    stop();
    if (state.isPlaying) set({ isPlaying: false });
  };

  return {
    get: () => state,
    subscribe: (fn: (s: PlaybackState) => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    play,
    pause,
    toggle: () => (state.isPlaying ? pause() : play()),
    seek: (elapsed: number) =>
      set({ elapsed: Math.min(Math.max(elapsed, 0), state.duration) }),
    setSpeed: (speed: PlaybackSpeed) => set({ speed }),
    reset: (duration: number) => {
      stop();
      set({ elapsed: 0, duration: Math.max(duration, 0), isPlaying: false });
    },
    dispose: () => {
      stop();
      listeners.clear();
    },
  };
};

export type Playback = ReturnType<typeof makePlayback>;
