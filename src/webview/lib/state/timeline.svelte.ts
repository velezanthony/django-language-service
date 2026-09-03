export interface TimelineState {
  active: boolean;
  // -1 = "current state" (rightmost); 0..maxSteps-1 = a specific snapshot
  currentStep: number;
  maxSteps: number;
  label: string;
  // One pre-rendered op summary chip per migration operation. Each entry is
  // a literal string like '+model Post' / '-field title' / '~op ...' / 'A → B'.
  ops: string[];
}

export const timeline = $state<TimelineState>({
  active: false,
  currentStep: -1,
  maxSteps: 0,
  label: 'Current state',
  ops: [],
});

export interface TimelineActions {
  prev(): void;
  next(): void;
  setStep(step: number): void;
  /** Drop classification, return to "Current state" — panel stays open. */
  reset(): void;
  /** Close the panel entirely (resets + deactivates). */
  close(): void;
}

const noop = (): void => {};

let _actions: TimelineActions = {
  prev: noop,
  next: noop,
  setStep: noop,
  reset: noop,
  close: noop,
};

export const setTimelineActions = (a: TimelineActions): void => {
  _actions = a;
};

export const timelineActions = (): TimelineActions => _actions;
