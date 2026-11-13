# Production and quality gates

## 1. Assemble from the approved plan

Lock narration timing, then build the picture around meaning and breath. Maintain a shot-to-storyboard mapping. If an asset fails, propose a substitution with its effect on look, truthfulness, schedule, and cost before adopting it.

Use animation curves with controlled acceleration and deceleration. Stagger related elements, but keep labels attached to the data or UI state they explain. Reserve emphatic movement for structural moments.

## 2. UI and text quality

- show authentic UI at a legible scale;
- crop and zoom to the relevant state rather than shrinking a full dashboard;
- keep cursor paths intentional and avoid jitter;
- do not alter metrics or labels in ways that imply false product output;
- respect title-safe and subtitle-safe regions;
- prevent text overflow, orphaned subtitle words, and unreadably short cards.

## 3. Visual continuity

Check palette, type scale, lighting, geometry, character identity, camera direction, and transition logic across the full timeline. Repeated motifs should develop with the narrative. Avoid resetting every scene to a new static layout.

## 4. Audio quality

- narration remains intelligible on laptop and phone speakers;
- music supports pacing and ducks beneath speech;
- sound effects mark meaningful events and never become constant noise;
- edits do not clip breaths or word endings;
- the final mix has no clipping, abrupt ambience changes, or accidental silence.

Normalize to the user's delivery specification. If none is supplied, choose a reasonable online-video target and state it rather than presenting it as a universal standard.

## 5. Technical review

Verify:

- requested resolution, aspect ratio, frame rate, duration, codec, and audio format;
- no black frames, frozen unintended frames, missing media, broken fonts, or dropped overlays;
- subtitle timing and spelling;
- encoded first frame shows the approved complete cover when a cover is required; inspect the separate cover PNG if delivered;
- both corner overlays are aligned and legible on sampled light and dark body frames, and after transitions;
- encoded end card shows the current product name, legal line where applicable, and contact detail; closing narration and captions agree with it;
- media provenance and usage rights;
- final file playback from start to end.

### Hard duration limits

Measure the source duration and divide it by the allowed duration to estimate the minimum uniform speed. Budget any fixed cover or end-card hold separately and leave a small export margin. When modest acceleration fits the request, keep the voice pitch and apply the same time mapping to picture, audio, and external subtitles. If speech becomes hard to follow, tighten pauses or edit the script with the user's approval. Verify the muxed MP4 duration numerically; the player can round away a fractional overrun.

## 6. Gate 3 review package

Deliver a review render with:

- filename and absolute path;
- duration and technical specification;
- a concise list of deliberate departures from the storyboard, if any;
- known limitations or placeholders;
- a request for time-coded feedback.

End with `Gate 3 — 预览确认`. Incorporate approved feedback, rerun all relevant checks, then produce the final master. Retain editable sources and previous approved versions unless the user asks to remove them.
