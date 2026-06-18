# Gemma 3 1B — On-Device AI Integration
**Developer Notes · TypeBase (React Native + Expo)**

---

## Overview

TypeBase runs **Gemma 3 1B Instruct** (`google/gemma-3-1b-it`) on-device for Translate, Rewrite, and voice cleanup when the user selects **On-device (Gemma 3)** in settings. All inference runs locally on Android — no network required after the model is downloaded.

| | |
|---|---|
| **Model** | `google/gemma-3-1b-it` |
| **Type** | Instruction-tuned (use `-it`, NOT base) |
| **Deployed file** | `gemma3-1B-it-int4.task` (~550 MB, int4) |
| **License** | Gemma License (free for commercial use) |
| **Runtime** | MediaPipe LLM Inference API (Android) |
| **RN Integration** | Native Module (`GemmaModule.kt`) bridged to JS |

> Do NOT use the base (non-instruct) Gemma weights. Instruct models follow prompts; base models only complete text.

### Gemma 2 → Gemma 3 upgrade (what changed)

| | Gemma 2 (Side+) | Gemma 3 (TypeBase) |
|---|---|---|
| Model | `google/gemma-2-2b-it` | `google/gemma-3-1b-it` |
| Size (int4) | ~600 MB | ~550 MB |
| Params | 2B | 1B |
| MediaPipe | `tasks-genai:0.10.14` | `tasks-genai:0.10.27` |
| Inference API | `LlmInference.generateResponse()` | `LlmInferenceSession` per request |
| Generation | `temperature: 0.7`, `topK: 40` | `temperature: 0`, `topK: 1`, `topP: 1` (deterministic) |
| Model download | JS (`react-native-fs`) | Native Kotlin (`HttpURLConnection`) |
| Prompt tags | `<start_of_turn>` / `<end_of_turn>` | Same — still required |

---

## Architecture

Expo/React Native cannot run MediaPipe directly from JS. The stack:

```
AI Settings UI (AiConfigPanel)
        ↓
Settings stores (aiProviderStore, apiKeysStore)
        ↓
Feature services (translate / rewrite / voice cleanup)
        ↓
src/keyboard/ai/onDeviceTextAi.ts
        ↓
src/keyboard/ai/gemmaModelManager.ts  (download + load lifecycle)
        ↓
src/keyboard/ai/gemmaBridge.ts        (RN NativeModules wrapper)
        ↓
GemmaModule.kt                        (Kotlin native module)
        ↓
MediaPipe LLM Inference API
        ↓
gemma3-1b-it-int4.task (app filesDir)
```

### File map (`src/keyboard/ai/`)

| File | Role |
|---|---|
| `gemmaBridge.ts` | Thin RN bridge — download, load, unload, `askGemma()` |
| `gemmaModelManager.ts` | `ensureGemmaModelDownloaded()`, `ensureGemmaModelLoaded()` with deduped load promise |
| `onDeviceTextAi.ts` | `generateOnDeviceText()` — loads model then runs inference; `extractJsonPayload()` for JSON parsing |
| `gemmaPrompts.ts` | `wrapGemmaPrompt()` + feature-specific prompts (translate, rewrite, voice) |
| `generationConfig.ts` | Cloud Gemini settings only — on-device generation is configured in Kotlin |
| `aiDebugService.ts` | Debug runner that respects the selected AI provider |
| `AiConfigPanel.tsx` | UI panel for AI provider selection, API key input, and model download |

Provider selection lives in `src/keyboard/settings/aiProviderStore.ts` (`'gemini' | 'on_device'`).
API keys are managed in `src/keyboard/settings/apiKeysStore.ts` (`geminiApiKey`, `speechmaticsApiKey`).

---

## Step 1 — Get the Model File

Download a MediaPipe-compatible `.task` bundle. TypeBase hosts a pre-quantized int4 build:

```
https://pub-8e31d16ca4f04d94b8e3e5f258fcbc2b.r2.dev/gemma3-1B-it-int4.task
```

Alternative sources:

- [litert-community/Gemma3-1B-IT on Hugging Face](https://huggingface.co/litert-community/Gemma3-1B-IT) — pre-built `.task` variants for MediaPipe / LiteRT
- [Google AI Edge LLM Inference guide](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference) — Gemma 3 1B configuration notes
- [HF → MediaPipe conversion guide](https://ai.google.dev/gemma/docs/conversions/hf-to-mediapipe-task) — if you need a custom fine-tune

> Do not use raw HuggingFace `.safetensors` directly — MediaPipe requires a `.task` bundle (model + tokenizer + metadata).

> For production, host the model on your CDN and download on first launch. Do not bundle it inside the APK.

---

## Step 2 — Add MediaPipe to Android

**`android/app/build.gradle`**
```gradle
dependencies {
    implementation("com.google.mediapipe:tasks-genai:0.10.27")
}
```

**`android/build.gradle`**
```gradle
ext {
    minSdkVersion = 24   // MediaPipe GenAI requires API 24+
}
```

---

## Step 3 — Kotlin Native Module

TypeBase registers `GemmaModule` inside `KeyboardModulePackage.kt` (alongside keyboard/voice modules):

```kotlin
// android/app/src/main/java/com/typebase/KeyboardModulePackage.kt
listOf(
    KeyboardModule(reactContext),
    VoiceRecorderModule(reactContext),
    // ...
    GemmaModule(reactContext),
)
```

### Key design choices in `GemmaModule.kt`

1. **Native download** — model is fetched in Kotlin, saved to `context.filesDir/gemma3-1b-it-int4.task`, with progress events emitted to JS.
2. **Background executor** — load, download, and inference run off the UI thread; promises resolve on the main thread.
3. **`LlmInferenceSession` per request** — Gemma 3 path uses a session with per-request generation config instead of calling `generateResponse()` directly on `LlmInference`.
4. **Deterministic decoding** — `temperature: 0`, `topK: 1`, `topP: 1` for consistent keyboard output.
5. **Validation** — rejects downloads smaller than 100 MB (`MIN_MODEL_BYTES`).

### Native module API

| Method | Description |
|---|---|
| `isModelDownloaded()` | `true` if valid `.task` exists in `filesDir` |
| `getModelPath()` | Absolute path to the model file |
| `downloadModel()` | Downloads from CDN; resolves with path |
| `cancelModelDownload()` | Cancels in-progress download |
| `loadModel()` | Loads model into `LlmInference` (3–30 s first time) |
| `isModelLoaded()` | `true` if instance is in memory |
| `unloadModel()` | Closes and clears the instance |
| `generateResponse(prompt)` | Runs inference via `LlmInferenceSession` |

### Download progress event

Kotlin emits `gemmaDownloadProgress` (0.0–1.0) via `DeviceEventEmitter`. JS subscribes in `gemmaModelManager.ts`:

```typescript
DeviceEventEmitter.addListener(GEMMA_DOWNLOAD_PROGRESS_EVENT, onProgress);
```

### Inference snippet (Gemma 3 pattern)

```kotlin
val options = LlmInference.LlmInferenceOptions.builder()
    .setModelPath(file.absolutePath)
    .setMaxTokens(1024)
    .setMaxTopK(MODEL_TOP_K)   // note: setMaxTopK, not setTopK
    .build()

val inference = LlmInference.createFromOptions(context, options)

// Per request:
val sessionOptions = LlmInferenceSession.LlmInferenceSessionOptions.builder()
    .setTemperature(0f)
    .setTopK(1)
    .setTopP(1f)
    .build()

LlmInferenceSession.createFromOptions(inference, sessionOptions).use { session ->
    session.addQueryChunk(prompt)
    val result = session.generateResponse()
}
```

---

## Step 4 — JS Bridge (`gemmaBridge.ts`)

```typescript
import {NativeModules, Platform} from 'react-native';

const GemmaModule =
  Platform.OS === 'android' ? NativeModules.GemmaModule : undefined;

export const GEMMA_MODEL_URL =
  'https://pub-8e31d16ca4f04d94b8e3e5f258fcbc2b.r2.dev/gemma3-1B-it-int4.task';

export const GEMMA_DOWNLOAD_PROGRESS_EVENT = 'gemmaDownloadProgress';

// Download (native — no react-native-fs needed)
export const downloadGemmaModel = () => GemmaModule.downloadModel();

// Load once, reuse instance
export const loadGemmaModel = () => GemmaModule.loadModel();

// Inference
export const askGemma = (prompt: string) => GemmaModule.generateResponse(prompt);
```

`gemmaModelManager.ts` wraps this with:

- `ensureGemmaModelDownloaded(onProgress?)` — skips if already present
- `ensureGemmaModelLoaded()` — dedupes concurrent load calls via a shared promise
- `isOnDeviceAiSupported()` — `Platform.OS === 'android'`

---

## Step 5 — Model Download in AI Settings

Users download the model from **Plugins → AI Settings → On-Device AI (Gemma) → Download model**.

The AI config panel (`src/keyboard/ai/AiConfigPanel.tsx`) provides:
- **AI Provider selector** — choose between Cloud AI (Gemini) and On-Device AI (Gemma)
- **Gemini API Key input** — for cloud AI authentication
- **Speechmatics API Key input** — for speech-to-text functionality
- **Model download progress** — shows download status for the on-device model

```typescript
// AiConfigPanel.tsx (simplified)
await ensureGemmaModelDownloaded(progress => {
  setDownloadProgress(progress);
});
```

The model is **not** auto-downloaded on provider switch — the user must explicitly tap Download. Inference auto-loads the model on first use via `ensureGemmaModelLoaded()`.

---

## Step 6 — Prompts (`gemmaPrompts.ts`)

Gemma 3 instruct models still require the turn-delimiter format:

```typescript
export function wrapGemmaPrompt(instruction: string): string {
  return `<start_of_turn>user
${instruction.trim()}
<end_of_turn>
<start_of_turn>model
`;
}
```

Without `<start_of_turn>` / `<end_of_turn>`, output quality degrades significantly.

### Feature prompts

| Feature | Builder | Output format |
|---|---|---|
| Translate | `buildGemmaTranslatePrompt(text, targetLanguage)` | JSON (`detectedLanguage`, `detectedLanguageCode`, `translation`) |
| Rewrite | `buildGemmaRewritePrompt(text, toneInstruction)` | Plain rewritten text |
| Voice cleanup | `buildGemmaVoiceCleanupPrompt(transcript)` | Plain polished text |

On-device parsers are more lenient than cloud Gemini:

- **Translate** — `extractJsonPayload()` strips markdown fences and finds `{...}` in the response
- **Rewrite / voice** — `parseOnDeviceRewriteResult()` / `parseOnDeviceCleanupResult()` accept plain text (and optional surrounding quotes) instead of requiring JSON

Cloud Gemini uses richer JSON-schema prompts in the respective `gemini*Service.ts` files; on-device uses simpler plain-text prompts because the 1B model follows them more reliably.

---

## Step 7 — Usage in Feature Services

Each feature checks `getAiProvider()` and branches:

```typescript
import {ensureAiProviderLoaded, getAiProvider} from '../settings/aiProviderStore';
import {buildGemmaTranslatePrompt} from '../ai/gemmaPrompts';
import {extractJsonPayload, generateOnDeviceText} from '../ai/onDeviceTextAi';

await ensureAiProviderLoaded();
if (getAiProvider() === 'on_device') {
  const raw = await generateOnDeviceText(
    buildGemmaTranslatePrompt(input, targetLanguage),
  );
  return parseTranslateResult(extractJsonPayload(raw));
}
// else: cloud Gemini fetch(...)
```

Same pattern in:

- `src/keyboard/translate/geminiTranslateService.ts`
- `src/keyboard/rewrite/geminiRewriteService.ts`
- `src/keyboard/voice/geminiVoiceCleanupService.ts`

`generateOnDeviceText()` always calls `ensureGemmaModelLoaded()` before `askGemma()`, so feature code does not manage load state.

---

## Performance Notes

| | |
|---|---|
| **Model size** | ~550 MB download |
| **First load time** | 3–30 sec (device-dependent; show a status message) |
| **Inference speed** | Faster than 2B on mid-range devices (1B params) |
| **RAM usage** | ~500 MB–1 GB while model is loaded |
| **Recommended** | Load once, keep `LlmInference` instance alive |
| **Decoding** | Deterministic (`temperature: 0`) for repeatable keyboard output |

> Do not reload the model on every request. `ensureGemmaModelLoaded()` dedupes loads; `unloadModel()` is only for explicit teardown.

> Show download progress on first launch so users understand the ~550 MB download.

---

## Pre-Submission Checklist

- [ ] Using `google/gemma-3-1b-it` (instruct, not base)
- [ ] `.task` file from Hugging Face / LiteRT community or your own MediaPipe bundle
- [ ] Model downloaded to `filesDir` (not bundled in APK)
- [ ] `GemmaModule` registered in `KeyboardModulePackage.kt`
- [ ] MediaPipe `tasks-genai:0.10.27` (or newer compatible release)
- [ ] Prompts use `<start_of_turn>/<end_of_turn>` format
- [ ] Using `LlmInferenceSession` with per-request generation config
- [ ] Model loaded once and reused — not per request
- [ ] Fallback / error handling when model not downloaded
- [ ] On-device parsers tolerate plain-text responses (not strict JSON)
- [ ] Tested on target Android devices with int4 quantization
