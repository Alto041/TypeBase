# Punctuation Correction Engine

## Overview

The Punctuation Correction Engine adds automatic correction of common punctuation omissions, particularly contractions and apostrophes. This addresses the issue where users type `its` when they mean `it's`, `dont` instead of `don't`, etc.

## Features

### 1. **Contraction Handling**
Automatically corrects common missing apostrophes:

- **Negations**: `dont` → `don't`, `cant` → `can't`, `wont` → `won't`, `shouldnt` → `shouldn't`, etc.
- **"Is" Contractions**: `its` → `it's`, `thats` → `that's`, `whats` → `what's`, `heres` → `here's`, etc.
- **"Am/Are" Contractions**: `im` → `i'm`, `youre` → `you're`, `were` → `we're`, `theyre` → `they're`
- **"Have" Contractions**: `ive` → `i've`, `youve` → `you've`, `weve` → `we've`, `theyve` → `they've`, `hed` → `he'd`, `shed` → `she'd`, etc.
- **"Will" Contractions**: `ill` → `i'll`, `hell` → `he'll`, `shell` → `she'll`, `youll` → `you'll`, `well` → `we'll`, `theyll` → `they'll`
- **Other Common Patterns**: `oclock` → `o'clock`, `aint` → `ain't`, `shouldve` → `should've`, etc.

### 2. **Confidence-Based Auto-Apply**
- High-confidence contractions (>90%) are automatically applied at word boundary
- Lower-confidence patterns (like `its`/`it's` which can be ambiguous) are shown in the suggestion bar but require user tap
- Confidence scores reflect frequency in English text

### 3. **Context-Aware Processing**
- Integrates with existing context correction system
- Runs BEFORE context correction for quick high-confidence fixes
- Provides previous word context for context-dependent corrections

### 4. **Smart Case Handling**
- Preserves original casing: `DONT` → `Don't`, `dont` → `don't`
- Works with mixed case input

## Implementation

### Files Added

1. **`src/keyboard/autocorrect/punctuationCorrections.ts`**
   - Core engine with all contraction mappings
   - Confidence scores for each contraction
   - Auto-apply decision logic
   - Case preservation functions

2. **`src/keyboard/autocorrect/punctuationCorrections.test.ts`**
   - Comprehensive test suite covering:
     - All contraction patterns
     - Case handling
     - Edge cases
     - Confidence threshold behavior

### Files Modified

1. **`src/keyboard/autocorrect/autocorrectEngine.ts`**
   - Added import of punctuation correction functions
   - Integrated into `getAutocorrectCandidate()` (auto-apply path)
   - Integrated into `getSuggestionBarAutocorrect()` (suggestion bar path)
   - Runs early in the correction pipeline for performance

## Integration Points

### In `getAutocorrectCandidate()`
```typescript
// Check high-confidence contractions first
if (isEnglishLikeLang()) {
  const punctFix = getPunctuationCorrection(typed, options?.previousWord);
  if (punctFix && shouldAutoApplyPunctuation(punctFix, typed, 0.90)) {
    return {
      correction: applyCaseToPunctuation(punctFix.correction, typed),
      confidence: punctFix.confidence,
    };
  }
}
```

### In `getSuggestionBarAutocorrect()`
```typescript
// Show all punctuation corrections in suggestion bar
if (isEnglishLikeLang()) {
  const punctFix = getPunctuationCorrection(typed, previousWord);
  if (punctFix && punctFix.correction.toLowerCase() !== typed.toLowerCase()) {
    return {
      keepTyped: offerKeepTyped ? typed : null,
      correction: applyCaseToPunctuation(punctFix.correction, typed),
    };
  }
}
```

## Configuration

### Auto-Apply Threshold
Currently set to **0.90** (90% confidence). Adjust via:
```typescript
shouldAutoApplyPunctuation(punctFix, typed, 0.90) // Change second parameter
```

Higher threshold = more conservative (fewer auto-corrections)
Lower threshold = more aggressive (more auto-corrections)

### Excluded Corrections
Some patterns are intentionally excluded from auto-apply:
- `its` / `it's` - Can be ambiguous (possessive vs. contraction)
  - Shows in suggestion bar, requires user tap
  - Confidence set to 0.45 to avoid auto-apply

Add more to `EXCLUDED_CORRECTIONS` Set as needed.

## Contraction Map

The complete mapping is in `CONTRACTION_MAP` (70+ entries):

```typescript
const CONTRACTION_MAP = new Map<string, string>([
  ['its', "it's"],
  ['whats', "what's"],
  ['thats', "that's"],
  ['heres', "here's"],
  // ... and many more
]);
```

### Coverage
- **30+ negations** (`don't`, `can't`, `won't`, etc.)
- **20+ positive contractions** (`i'm`, `you're`, `we're`, etc.)
- **15+ "have" contractions** (`i've`, `you've`, `should've`, etc.)
- **10+ other patterns** (`o'clock`, `ain't`, etc.)

## Confidence Scores

Each contraction has a frequency-based confidence score:

```typescript
const CONTRACTION_CONFIDENCE = new Map<string, number>([
  ["it's", 0.98],    // Very common
  ["don't", 0.97],   // Very common
  ["that's", 0.96],  // Very common
  // ... down to
  ["o'clock", 0.85], // Less frequent
  ["ain't", 0.60],   // Rare/slang
]);
```

Higher scores = more frequent in English = auto-apply with higher confidence

## Performance

- **Lookup**: O(1) hash map lookup
- **Execution**: <1ms per word
- **Memory**: ~2KB for contraction maps
- **No async calls**: All synchronous, runs on main thread

## Testing

Run tests with:
```bash
npm test -- punctuationCorrections.test.ts
```

Or to test interactively:
```typescript
import { getPunctuationCorrection } from './punctuationCorrections';

const result = getPunctuationCorrection('dont');
console.log(result);
// Output: { correction: "don't", confidence: 0.97, pattern: 'contraction' }
```

## Future Enhancements

1. **Language Support**
   - French contractions: `ca` → `ça`, `cest` → `c'est`
   - Spanish contractions: similar patterns
   - Italian: `non` related patterns

2. **More Patterns**
   - Quote placement: `he said"hello"` → `he said "hello"`
   - Dash vs hyphen normalization
   - Multiple apostrophes: `dont` vs `don''t`

3. **Context Intelligence**
   - Better disambiguation for ambiguous contractions
   - Avoid correction after explicitly selected words
   - Learn user preferences over time

4. **Machine Learning Integration**
   - Train model on user typing patterns
   - Adjust confidence scores per user
   - Predict next contraction based on context

## Examples

### Auto-Applied (≥90% confidence)
```
Input:  "I dont know"
Output: "I don't know"  (auto-applied)

Input:  "Thats cool"
Output: "That's cool"   (auto-applied)

Input:  "Im coming"
Output: "I'm coming"    (auto-applied)
```

### Suggestion Bar (shown but requires tap)
```
Input:  "its"
Typed:  "its" → suggests "it's" (confidence: 0.45)
Action: User taps suggestion or continues

Input:  "oclock"
Typed:  "oclock" → suggests "o'clock" (confidence: 0.85)
Action: Auto-apply or user can tap to confirm
```

## Debugging

Enable debug logging to see which corrections are applied:

```typescript
// In KeyboardApp.tsx or relevant component
console.log('Punctuation Correction Applied:', {
  typed,
  correction: result.correction,
  confidence: result.confidence,
  autoApplied: true,
});
```

Or check the Developer Eye overlay for applied corrections.

## Common Issues & Solutions

### Issue: "its" is being corrected incorrectly
**Solution**: This is intentionally context-dependent. The engine shows it in the suggestion bar but doesn't auto-apply. User must tap to confirm.

### Issue: Contractions not appearing in Android build
**Solution**: Ensure `isEnglishLikeLang()` returns true for your language. Check `getActiveLanguage()` setting.

### Issue: Performance impact
**Solution**: Punctuation corrections are O(1) operations. If you see issues, check if autocorrect settings are disabled.

## References

- Emoji/special characters: Similar logic in `dictionaryFixes.ts`
- Context correction: See `contextCorrectionEngine.ts`
- Suggestion bar: See `SuggestionBar.tsx`
- Settings: `autocorrectStore.ts`
