import {KEY_HIT_SLOP, PREDICTIVE_HITBOX_EXPANSION} from '../theme';
import type {KeyBounds} from './types';
import {
  getNextLetterDistribution,
  type NextLetterDistribution,
} from './prefixPredictionEngine';

export type AsymmetricKeySlop = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type PredictiveHitboxState = {
  enabled: boolean;
  neutralMode: boolean;
  topLetter: string | null;
  topExpansionKeyId: string | null;
  expansions: ReadonlyMap<string, AsymmetricKeySlop>;
  probabilities: ReadonlyMap<string, number>;
  keyLetters: ReadonlyMap<string, string>;
};

const DEFAULT_STATE: PredictiveHitboxState = {
  enabled: true,
  neutralMode: true,
  topLetter: null,
  topExpansionKeyId: null,
  expansions: new Map(),
  probabilities: new Map(),
  keyLetters: new Map(),
};

let activeState: PredictiveHitboxState = DEFAULT_STATE;
let lastComputeKey = '';

function keyLetter(layout: KeyBounds): string | null {
  const value = layout.keyDef.value ?? layout.letter ?? '';
  if (value.length !== 1) {
    return null;
  }
  const lower = value.toLowerCase();
  return /[a-z]/.test(lower) ? lower : null;
}

function baseSlop(): AsymmetricKeySlop {
  return {
    left: KEY_HIT_SLOP.horizontal,
    right: KEY_HIT_SLOP.horizontal,
    top: KEY_HIT_SLOP.vertical,
    bottom: KEY_HIT_SLOP.vertical,
  };
}

function computeAsymmetricSlop(
  layout: KeyBounds,
  probability: number,
  margin: number,
  layouts: readonly KeyBounds[],
  probabilities: ReadonlyMap<string, number>,
): AsymmetricKeySlop {
  const base = baseSlop();
  const shouldExpand =
    probability > 0 &&
    (margin >= PREDICTIVE_HITBOX_EXPANSION.minProbabilityMargin ||
      probability >= PREDICTIVE_HITBOX_EXPANSION.minTopProbability);
  if (!shouldExpand) {
    return base;
  }

  const marginBoost =
    margin >= PREDICTIVE_HITBOX_EXPANSION.minProbabilityMargin
      ? 1
      : 0.55 + probability * 0.9;
  const strength =
    Math.min(1, (probability / Math.max(probability + margin, 0.001)) * marginBoost) *
    PREDICTIVE_HITBOX_EXPANSION.maxExtraRatio;
  const extraH = base.left * strength;
  const extraTop = base.top * strength * PREDICTIVE_HITBOX_EXPANSION.verticalTopBias;
  const extraBottom = base.bottom * strength * PREDICTIVE_HITBOX_EXPANSION.verticalBottomBias;

  let expandLeft = extraH * 0.5;
  let expandRight = extraH * 0.5;

  const letter = keyLetter(layout);
  if (letter) {
    let leftNeighborProb = 0;
    let rightNeighborProb = 0;
    for (const other of layouts) {
      const otherLetter = keyLetter(other);
      if (!otherLetter || otherLetter === letter) {
        continue;
      }
      const prob = probabilities.get(otherLetter) ?? 0;
      if (other.centerX < layout.centerX) {
        leftNeighborProb = Math.max(leftNeighborProb, prob);
      } else if (other.centerX > layout.centerX) {
        rightNeighborProb = Math.max(rightNeighborProb, prob);
      }
    }
    const horizontalTotal = leftNeighborProb + rightNeighborProb + 0.001;
    expandLeft = extraH * (1 - leftNeighborProb / horizontalTotal);
    expandRight = extraH * (1 - rightNeighborProb / horizontalTotal);
  }

  return {
    left: base.left + expandLeft,
    right: base.right + expandRight,
    top: base.top + extraTop,
    bottom: base.bottom + extraBottom,
  };
}

export function updatePredictiveHitboxes(
  wordPrefix: string,
  layouts: readonly KeyBounds[],
  options?: {
    enabled?: boolean;
    lang?: string;
  },
): PredictiveHitboxState {
  const enabled = options?.enabled ?? true;
  const computeKey = `${enabled ? 1 : 0}|${options?.lang ?? ''}|${wordPrefix}|${layouts.map(l => l.id).join(',')}`;
  if (computeKey === lastComputeKey) {
    return activeState;
  }
  lastComputeKey = computeKey;

  if (!enabled || layouts.length === 0) {
    activeState = {
      ...DEFAULT_STATE,
      enabled: false,
      expansions: new Map(layouts.map(layout => [layout.id, baseSlop()])),
      keyLetters: new Map(
        layouts
          .map(layout => {
            const letter = keyLetter(layout);
            return letter ? ([layout.id, letter] as const) : null;
          })
          .filter((entry): entry is readonly [string, string] => entry != null),
      ),
    };
    return activeState;
  }

  const distribution = getNextLetterDistribution(wordPrefix, options?.lang);
  if (distribution.neutralMode || distribution.probabilities.size === 0) {
    activeState = {
      enabled: true,
      neutralMode: true,
      topLetter: null,
      topExpansionKeyId: null,
      probabilities: new Map(),
      expansions: new Map(layouts.map(layout => [layout.id, baseSlop()])),
      keyLetters: new Map(
        layouts
          .map(layout => {
            const letter = keyLetter(layout);
            return letter ? ([layout.id, letter] as const) : null;
          })
          .filter((entry): entry is readonly [string, string] => entry != null),
      ),
    };
    return activeState;
  }

  const sorted = [...distribution.probabilities.entries()].sort((a, b) => b[1] - a[1]);
  const topProb = sorted[0]?.[1] ?? 0;
  const runnerUpProb = sorted[1]?.[1] ?? 0;
  const margin = topProb - runnerUpProb;

  const keyLetters = new Map<string, string>();
  const expansions = new Map<string, AsymmetricKeySlop>();
  let topExpansionKeyId: string | null = null;
  let topExpansion = -1;

  for (const layout of layouts) {
    const letter = keyLetter(layout);
    if (letter) {
      keyLetters.set(layout.id, letter);
    }
    const probability = letter ? (distribution.probabilities.get(letter) ?? 0) : 0;
    const slop = computeAsymmetricSlop(
      layout,
      probability,
      margin,
      layouts,
      distribution.probabilities,
    );
    expansions.set(layout.id, slop);
    const expansionScore = slop.left + slop.right + slop.top + slop.bottom;
    if (expansionScore > topExpansion) {
      topExpansion = expansionScore;
      topExpansionKeyId = layout.id;
    }
  }

  activeState = {
    enabled: true,
    neutralMode: false,
    topLetter: distribution.topLetter,
    topExpansionKeyId,
    probabilities: distribution.probabilities,
    expansions,
    keyLetters,
  };
  return activeState;
}

export function getPredictiveHitboxState(): PredictiveHitboxState {
  return activeState;
}

export function getPredictiveKeySlop(keyId: string): AsymmetricKeySlop {
  return activeState.expansions.get(keyId) ?? baseSlop();
}

export function getLetterHitPriority(letter: string | null): number {
  if (!letter || activeState.neutralMode) {
    return 0;
  }
  return activeState.probabilities.get(letter.toLowerCase()) ?? 0;
}

export function expandedKeyBounds(
  layout: KeyBounds,
  fallbackSlop?: {horizontal: number; vertical: number},
): {left: number; right: number; top: number; bottom: number} {
  const slop = activeState.expansions.get(layout.id);
  if (slop) {
    return {
      left: layout.x - slop.left,
      right: layout.x + layout.width + slop.right,
      top: layout.y - slop.top,
      bottom: layout.y + layout.height + slop.bottom,
    };
  }
  const horizontal = fallbackSlop?.horizontal ?? KEY_HIT_SLOP.horizontal;
  const vertical = fallbackSlop?.vertical ?? KEY_HIT_SLOP.vertical;
  return {
    left: layout.x - horizontal,
    right: layout.x + layout.width + horizontal,
    top: layout.y - vertical,
    bottom: layout.y + layout.height + vertical,
  };
}

export function serializeKeyExpansionsForNative(): Array<{
  keyId: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  probability: number;
}> {
  const out: Array<{
    keyId: string;
    left: number;
    right: number;
    top: number;
    bottom: number;
    probability: number;
  }> = [];
  for (const [keyId, slop] of activeState.expansions) {
    const letter = activeState.keyLetters.get(keyId) ?? '';
    out.push({
      keyId,
      left: slop.left,
      right: slop.right,
      top: slop.top,
      bottom: slop.bottom,
      probability: activeState.probabilities.get(letter) ?? 0,
    });
  }
  return out;
}

export function resetPredictiveHitboxesForTests(): void {
  activeState = DEFAULT_STATE;
  lastComputeKey = '';
}

export type {NextLetterDistribution};
