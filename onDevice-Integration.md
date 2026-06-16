# Gemma 2B — On-Device AI Integration
**Developer Notes · Side+ (React Native + Expo)**

---

## Overview

Integrating `google/gemma-2-2b-it` (instruct-tuned) as on-device AI for Side+'s Summarizer and Audio refinement features. All inference runs locally — no network required after model download.

| | |
|---|---|
| **Model** | `google/gemma-2-2b-it` |
| **Type** | Instruction-tuned (use `-it`, NOT base `gemma-2b`) |
| **Size (quantized)** | ~600MB (int4) / ~1.2GB (int8) |
| **License** | Gemma License (free for commercial use) |
| **Runtime** | MediaPipe LLM Inference API (Android) |
| **RN Integration** | Native Module (Kotlin) bridged to JS |

> ⚠ Do NOT use `google/gemma-2b` — that is the base model, it completes text instead of following instructions. Always use `google/gemma-2-2b-it`.

---

## Architecture

Expo/React Native cannot run MediaPipe directly from JS. The correct path:

```
React Native (JS)  →  Native Module (Kotlin)  →  MediaPipe LLM Inference API  →  Gemma model (.task file)
```

---

## Step 1 — Get the Model File

Download the quantized `.task` file (MediaPipe-compatible) from Kaggle:

```
https://www.kaggle.com/models/google/gemma/tfLite/gemma-2-2b-it-cpu-int4
```

- File: `gemma-2-2b-it-cpu-int4.task`
- Size: ~600MB
- Requires a free Kaggle account

> ⚠ Do not use HuggingFace `.safetensors` — MediaPipe requires the `.task` format from Kaggle.

> ✓ For production, host the model on your server and download on first launch. Do not bundle it inside the APK.

---

## Step 2 — Add MediaPipe to Android

**`android/app/build.gradle`**
```gradle
dependencies {
    implementation 'com.google.mediapipe:tasks-genai:0.10.14'
}
```

**`android/build.gradle`**
```gradle
android {
    defaultConfig {
        minSdkVersion 24   // MediaPipe GenAI requires API 24+
    }
}
```

---

## Step 3 — Kotlin Native Module

**`GemmaModule.kt`**
```kotlin
package com.yourapp

import com.facebook.react.bridge.*
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import java.io.File

class GemmaModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "GemmaModule"

    private var llmInference: LlmInference? = null

    @ReactMethod
    fun loadModel(modelPath: String, promise: Promise) {
        try {
            val options = LlmInference.LlmInferenceOptions.builder()
                .setModelPath(modelPath)
                .setMaxTokens(1024)
                .setTopK(40)
                .setTemperature(0.7f)
                .build()
            llmInference = LlmInference.createFromOptions(
                reactApplicationContext, options
            )
            promise.resolve("loaded")
        } catch (e: Exception) {
            promise.reject("LOAD_ERROR", e.message)
        }
    }

    @ReactMethod
    fun generateResponse(prompt: String, promise: Promise) {
        try {
            val result = llmInference?.generateResponse(prompt)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("INFERENCE_ERROR", e.message)
        }
    }
}
```

**`GemmaPackage.kt`**
```kotlin
package com.yourapp

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class GemmaPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext):
        List<NativeModule> = listOf(GemmaModule(ctx))
    override fun createViewManagers(ctx: ReactApplicationContext):
        List<ViewManager<*, *>> = emptyList()
}
```

**Register in `MainApplication.kt`**
```kotlin
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
        add(GemmaPackage())   // add this line
    }
```

---

## Step 4 — JS Bridge (`gemma.ts`)

```typescript
import { NativeModules } from 'react-native';
const { GemmaModule } = NativeModules;

// Call once on app start
export const loadGemma = (modelPath: string) =>
    GemmaModule.loadModel(modelPath);

// Call for each summarize/refine request
export const askGemma = (prompt: string): Promise<string> =>
    GemmaModule.generateResponse(prompt);
```

---

## Step 5 — Model Download on First Launch

```typescript
import RNFS from 'react-native-fs';

const MODEL_URL = 'https://your-server.com/gemma-2-2b-it-cpu-int4.task';
const MODEL_PATH = `${RNFS.DocumentDirectoryPath}/gemma.task`;

export async function ensureModelDownloaded(
    onProgress: (pct: number) => void
) {
    const exists = await RNFS.exists(MODEL_PATH);
    if (exists) return MODEL_PATH;

    await RNFS.downloadFile({
        fromUrl: MODEL_URL,
        toFile: MODEL_PATH,
        progress: (r) => onProgress(r.bytesWritten / r.contentLength),
    }).promise;

    return MODEL_PATH;
}
```

> ⚠ `react-native-fs` must be installed: `npx expo install react-native-fs`

---

## Step 6 — Prompts

**Summarizer**
```typescript
const summarizePrompt = (text: string) => `
<start_of_turn>user
Summarize the following text in 3-5 concise bullet points.
Be direct. No preamble.

${text}
<end_of_turn>
<start_of_turn>model
`;
```

**Audio Refinement**
```typescript
const refinePrompt = (raw: string) => `
<start_of_turn>user
Fix grammar and punctuation in this transcribed speech.
Return only the corrected text, nothing else.

${raw}
<end_of_turn>
<start_of_turn>model
`;
```

> ⚠ The `<start_of_turn>` / `<end_of_turn>` tags are required for `-it` models. Without them output quality degrades significantly.

---

## Step 7 — Usage in Components

```typescript
import { loadGemma, askGemma } from './gemma';
import { ensureModelDownloaded } from './modelDownload';

// In app init (e.g. App.tsx useEffect)
const modelPath = await ensureModelDownloaded(setProgress);
await loadGemma(modelPath);

// In Summarizer screen
const summary = await askGemma(summarizePrompt(screenshotText));

// In Audio Flow
const refined = await askGemma(refinePrompt(rawTranscript));
```

---

## Performance Notes

| | |
|---|---|
| **First load time** | 3–8 sec (model loads into memory) |
| **Inference speed** | 10–30 tokens/sec on mid-range devices |
| **RAM usage** | ~800MB–1.2GB while active |
| **Recommended** | Load model once, keep instance alive |
| **Nothing Phone 2a** | Should run int4 fine (Dimensity 7200) |
| **CMF Phone 1** | Borderline — test int4 specifically |

> ⚠ Do not reload the model on every request. Load once at startup and reuse the instance.

> ✓ Show a one-time download progress screen on first launch so users understand the 600MB download.

---

## Pre-Submission Checklist

- [ ] Using `gemma-2-2b-it` (not base `gemma-2b`)
- [ ] Model downloaded to `DocumentDirectoryPath` (not bundled in APK)
- [ ] `GemmaPackage` registered in `MainApplication.kt`
- [ ] Prompts use `<start_of_turn>/<end_of_turn>` format
- [ ] Model loaded once on startup, not per request
- [ ] Fallback handled if model not yet downloaded
- [ ] Tested on target devices (Nothing/CMF) with int4 quantization
