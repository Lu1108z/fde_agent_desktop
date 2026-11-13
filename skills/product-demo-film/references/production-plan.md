# Asset and production planning

## 1. Build the asset manifest

Create one row for each production asset:

| Asset ID | Shot(s) | Asset description | Source or creation method | Format/spec | Rights/status | Dependency | Verification |
|---|---|---|---|---|---|---|---|

Classify source material as:

- supplied and ready;
- supplied but needs cleanup, crop, masking, or reconstruction;
- must be captured;
- must be generated;
- must be licensed;
- graphic or UI component to build.

For generated people, identify consistency requirements such as wardrobe, setting, lighting, camera angle, and identity continuity. For screenshots, preserve factual content and remove private data only with authorization.

For a branding revision, inventory the cover text and background, light and dark logo assets, approved product title, end-card copy, and any revised contact voice-over. Plan which layers are rebuilt and which tracks can be reused.

## 2. Plan audio

Specify:

- voice language, gender or vocal character, pace, pronunciation notes, and target duration;
- whether voice is recorded, synthesized, or supplied;
- subtitle language, line length, safe-area placement, and delivery format;
- music mood, structural changes, licensing source, and loop strategy;
- sound-effect categories and their narrative purpose.

Generate or record narration before fine-cut timing whenever possible. The approved spoken track is the timing authority.

## 3. Select the toolchain

Create an execution table:

| Step | Tool | Input | Action | Output | Used by | Check |
|---|---|---|---|---|---|---|

Typical routing:

- Remotion or HyperFrames: programmatic motion graphics, UI choreography, charts, captions, and reusable scene systems;
- image/video generation: concept scenes, illustrative environments, and permitted character shots;
- screen capture/browser automation: authentic product interaction;
- FFmpeg: media probing, image sequences, conforming, audio mix, subtitle rendering, encoding, and packaging;
- NLE: footage-heavy storytelling, manual performance selection, or editorial finishing.

List exact project files, commands, plugins, models, or services only after confirming they are available. Record paid-service, network, credential, and licensing requirements before execution.

## 4. Define intermediate outputs

At minimum plan:

- clean narration master;
- subtitle or timing file;
- per-shot visual assets;
- editable composition/project;
- low-resolution review render;
- final master and requested derivatives.

Use stable asset IDs and versioned filenames so a revised shot does not silently replace an approved asset.

## 5. Plan review

State what Gate 2 approval authorizes: asset creation, external calls, rendering, and editing according to the listed plan. Identify any destructive, paid, public, or externally visible action separately; those actions require explicit authorization even after creative approval.

End with `Gate 2 — 素材与制作方案确认`. Do not start production before approval unless the user has explicitly waived this gate.
