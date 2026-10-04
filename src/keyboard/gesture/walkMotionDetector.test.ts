import {
  ingestWalkMotionSample,
  isWalkingActive,
  noteWalkModeTypingActivity,
  resetWalkMotionDetector,
  setWalkModeFeatureEnabled,
} from './walkMotionDetector';

describe('walkMotionDetector', () => {
  beforeEach(() => {
    resetWalkMotionDetector();
    setWalkModeFeatureEnabled(true);
  });

  it('does not activate without rhythmic peaks', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 40; i += 1) {
      ingestWalkMotionSample({timestampMs: t0 + i * 100, magnitude: 9.8});
    }
    expect(isWalkingActive()).toBe(false);
  });

  it('does not activate for irregular desk fidget bumps', () => {
    let t = 1_500_000;
    const bumps = [180, 90, 420, 70, 310, 140, 500];
    for (const gap of bumps) {
      ingestWalkMotionSample({timestampMs: t, magnitude: 0.1});
      ingestWalkMotionSample({timestampMs: t + 45, magnitude: 0.22});
      ingestWalkMotionSample({timestampMs: t + 90, magnitude: 0.11});
      t += gap;
    }
    expect(isWalkingActive()).toBe(false);
  });

  it('does not activate for weak rhythmic bumps', () => {
    let t = 1_800_000;
    const stepMs = 620;
    for (let step = 0; step < 8; step += 1) {
      ingestWalkMotionSample({timestampMs: t, magnitude: 0.12});
      ingestWalkMotionSample({timestampMs: t + 45, magnitude: 0.19});
      ingestWalkMotionSample({timestampMs: t + 90, magnitude: 0.13});
      t += stepMs;
    }
    expect(isWalkingActive()).toBe(false);
  });

  it('does not activate while typing keeps resetting peaks', () => {
    let t = 3_500_000;
    const stepMs = 620;
    for (let step = 0; step < 8; step += 1) {
      noteWalkModeTypingActivity(t);
      ingestWalkMotionSample({timestampMs: t, magnitude: 0.12});
      ingestWalkMotionSample({timestampMs: t + 45, magnitude: 0.28});
      ingestWalkMotionSample({timestampMs: t + 90, magnitude: 0.13});
      t += stepMs;
    }
    expect(isWalkingActive()).toBe(false);
  });

  it('activates after sustained regular step-like rhythm', () => {
    let t = 2_000_000;
    const stepMs = 620;
    for (let step = 0; step < 8; step += 1) {
      ingestWalkMotionSample({timestampMs: t, magnitude: 0.12});
      ingestWalkMotionSample({timestampMs: t + 45, magnitude: 0.28});
      ingestWalkMotionSample({timestampMs: t + 90, magnitude: 0.13});
      t += stepMs;
    }
    expect(isWalkingActive()).toBe(true);
  });

  it('activates at a slow walk cadence with clear peaks', () => {
    let t = 3_000_000;
    const stepMs = 980;
    let baseline = 0.12;
    for (let step = 0; step < 8; step += 1) {
      ingestWalkMotionSample({timestampMs: t, magnitude: baseline});
      ingestWalkMotionSample({timestampMs: t + 45, magnitude: baseline + 0.16});
      ingestWalkMotionSample({timestampMs: t + 90, magnitude: baseline + 0.05});
      ingestWalkMotionSample({timestampMs: t + 135, magnitude: baseline});
      t += stepMs;
      baseline += 0.004;
    }
    expect(isWalkingActive()).toBe(true);
  });
});
