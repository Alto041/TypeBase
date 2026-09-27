# Side Dock → Typebase design reference

Snapshots of **Side+ (Side Dock)** premium and onboarding UI live under [`sidedock/`](./sidedock/). Canonical sources are in the Side Dock repo:

**`D:\Side+\side-plus\`**

---

## Onboarding (Side Dock)

| Reference copy | Side Dock source |
|----------------|------------------|
| `sidedock/onboarding/OnboardingScreen.tsx` | `D:\Side+\side-plus\components\OnboardingScreen.tsx` |
| `sidedock/onboarding/OnboardingPremiumPage.tsx` | `D:\Side+\side-plus\components\OnboardingPremiumPage.tsx` |
| `sidedock/onboarding/OnboardingContext.tsx` | `D:\Side+\side-plus\context\OnboardingContext.tsx` |

**Assets (copied under `sidedock/assets/`)**

| Asset | Side Dock source |
|-------|------------------|
| `home/onboarding1.png` … `onboarding3.png` | `D:\Side+\side-plus\assets\home\` |
| `liquid-spot.svg`, `package-variant.svg` | `D:\Side+\side-plus\assets\` |
| `home/flag-checkered.svg`, `google-downasaur.svg`, `format-paint.svg` | `D:\Side+\side-plus\assets\home\` |

**App wiring (Side Dock)**

- Provider: `context/OnboardingContext.tsx` — storage key `@sidedock_onboarding_completed`
- Gate: `app/App.tsx` — `OnboardingProvider`, `hasCompletedOnboarding` → `OnboardingScreen`
- Shared premium step UI: `OnboardingPremiumDrawer` / `OnboardingPremiumHero` from `OnboardingPremiumPage.tsx`

**Design tokens (onboarding)**

- Background `#f2f2f4`, drawer `#111111`, accent `#ffc700`
- Title font **NType82**, body **Inter**
- Last page uses premium drawer + hero (same family as standalone premium)

---

## Premium page (Side Dock)

| Reference copy | Side Dock source |
|----------------|------------------|
| `sidedock/premium/PremiumScreen.tsx` | `D:\Side+\side-plus\components\PremiumScreen.tsx` |
| `sidedock/premium/PremiumGlowBg.tsx` | `D:\Side+\side-plus\components\PremiumGlowBg.tsx` |
| `sidedock/premium/PremiumContext.tsx` | `D:\Side+\side-plus\context\PremiumContext.tsx` |
| `sidedock/premium/PremiumNavContext.tsx` | `D:\Side+\side-plus\context\PremiumNavContext.tsx` |
| `sidedock/onboarding/OnboardingPremiumPage.tsx` | Onboarding variant of premium hero/drawer (see above) |

**Assets**

| Asset | Side Dock source |
|-------|------------------|
| `Animation/yellow.png`, `maroon.png` | `D:\Side+\side-plus\assets\Animation\` — `PremiumGlowBg` loop |
| `tools/*.svg`, `colors.svg`, `coin.svg`, etc. | `D:\Side+\side-plus\assets\tools\`, `assets\` — `PRO_FEATURES` in `PremiumScreen` |
| `home/Artificial.svg` | On-device AI row icon |

**App wiring (Side Dock)**

- `context/PremiumContext.tsx` + `lib/premiumService.ts`
- Billing: `lib/nativeBilling.ts` — `queryProducts` in `PremiumScreen` / onboarding premium page
- Navigation: `context/PremiumNavContext.tsx` — `premiumOpen` → `PremiumScreen` in `app/App.tsx`
- Related (not copied): `components/PremiumGate.tsx`, `lib/usePremium.ts`

**Design tokens (premium)**

- Hero ~44% screen height, glow animation on `PremiumGlowBg`
- Feature grid + one-time purchase CTA; `PRO_FEATURES` in `PremiumScreen.tsx`
- Regular price display constant `REGULAR_PRICE_USD` in screen file

---

## Porting checklist (Typebase)

1. **Paths** — Reference files use Side Dock imports (`../context/…`, `../assets/…`). Re-point to Typebase modules or stubs (`haptics`, `uiSounds`, billing).
2. **Fonts** — Load **NType82** and **Inter** (or Typebase equivalents).
3. **Premium logic** — Replace `premiumService` / `nativeBilling` with Typebase store APIs; port layout first.
4. **Onboarding storage** — Use a Typebase-specific AsyncStorage key (not `@sidedock_onboarding_completed`) if needed.
5. **SVG transformer** — Same `react-native-svg` + bundler SVG setup as Side Dock.

---

## Folder layout (Typebase)

```text
reference-design/
  SIDEDOCK_REFERENCE.md    ← this file
  sidedock/
    onboarding/              ← Side Dock onboarding TSX
    premium/                 ← Side Dock premium TSX + contexts
    assets/                  ← PNG/SVG for those screens
  HomeDockScreen.tsx         ← other reference snippets
```

When Side Dock designs change, refresh files under `sidedock/` from `D:\Side+\side-plus\` paths above.
