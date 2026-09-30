import {
  getAutocorrectIntensityProfile,
  getMinAutoConfidence,
  getMinSuggestionBarConfidence,
  getContextConfidenceMin,
  LEGACY_AI_PREFLIGHT_SKIP_MIN,
  LEGACY_MIN_AUTO_CONFIDENCE,
  LEGACY_MIN_CONTEXT_CONFIDENCE,
  LEGACY_MIN_CONTEXT_CONFIDENCE_BOUNDARY,
  LEGACY_MIN_SUGGESTION_BAR_CONFIDENCE,
  LEGACY_PROPER_NOUN_AUTO_APPLY_MIN,
  LEGACY_PUNCTUATION_AUTO_APPLY,
} from './autocorrectIntensityProfile';
import {getAutocorrectSettings} from './autocorrectStore';

jest.mock('./autocorrectStore', () => ({
  getAutocorrectSettings: jest.fn(),
}));

const mockedGetSettings = getAutocorrectSettings as jest.MockedFunction<
  typeof getAutocorrectSettings
>;

function mockIntensity(intensity: 'low' | 'medium' | 'high'): void {
  mockedGetSettings.mockReturnValue({
    enabled: true,
    autoApplyOnSpace: true,
    aiAutoCorrectEnabled: false,
    contextCorrectionEnabled: true,
    intensity,
  });
}

describe('autocorrectIntensityProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIntensity('medium');
  });

  it('medium profile matches legacy constants', () => {
    const profile = getAutocorrectIntensityProfile();
    expect(profile.minAutoConfidence).toBe(LEGACY_MIN_AUTO_CONFIDENCE);
    expect(profile.minSuggestionBarConfidence).toBe(
      LEGACY_MIN_SUGGESTION_BAR_CONFIDENCE,
    );
    expect(profile.minContextConfidence).toBe(LEGACY_MIN_CONTEXT_CONFIDENCE);
    expect(profile.minContextConfidenceBoundary).toBe(
      LEGACY_MIN_CONTEXT_CONFIDENCE_BOUNDARY,
    );
    expect(profile.punctuationAutoApplyThreshold).toBe(
      LEGACY_PUNCTUATION_AUTO_APPLY,
    );
    expect(profile.properNounAutoApplyMinConfidence).toBe(
      LEGACY_PROPER_NOUN_AUTO_APPLY_MIN,
    );
    expect(profile.aiPreflightSkipMinConfidence).toBe(
      LEGACY_AI_PREFLIGHT_SKIP_MIN,
    );
  });

  it('orders low above medium above high for core thresholds', () => {
    mockIntensity('low');
    const lowAuto = getMinAutoConfidence();
    const lowBar = getMinSuggestionBarConfidence();
    const lowCtx = getContextConfidenceMin(false);
    const lowBoundary = getContextConfidenceMin(true);

    mockIntensity('medium');
    const medAuto = getMinAutoConfidence();
    const medBar = getMinSuggestionBarConfidence();
    const medCtx = getContextConfidenceMin(false);
    const medBoundary = getContextConfidenceMin(true);

    mockIntensity('high');
    const highAuto = getMinAutoConfidence();
    const highBar = getMinSuggestionBarConfidence();
    const highCtx = getContextConfidenceMin(false);
    const highBoundary = getContextConfidenceMin(true);

    expect(lowAuto).toBeGreaterThan(medAuto);
    expect(medAuto).toBeGreaterThan(highAuto);
    expect(lowBar).toBeGreaterThan(medBar);
    expect(medBar).toBeGreaterThan(highBar);
    expect(lowCtx).toBeGreaterThan(medCtx);
    expect(medCtx).toBeGreaterThan(highCtx);
    expect(lowBoundary).toBeGreaterThan(medBoundary);
    expect(medBoundary).toBeGreaterThan(highBoundary);
  });
});
