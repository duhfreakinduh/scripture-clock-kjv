# AI / Contributor Guide

Keep Scripture text authoritative to the selected KJV source. AI may help with navigation, themes, summaries, or explanations, but generated commentary must never be presented as Scripture.

## Priorities
1. Preserve verse text exactly as stored/sourced; never rewrite Bible text with AI.
2. Clearly label generated commentary, summaries, prayers, or explanations as AI-generated/helpful notes.
3. Keep the core clock/verse experience usable offline and without AI.
4. Never expose provider tokens in public client code.
5. Do not send personal notes or prayer content to a remote model without explicit user action.
6. Provide deterministic fallbacks for verse selection/search.
7. Preserve accessibility, readable typography, and low-distraction display behavior.
8. Document Scripture source/version and any AI feature limitations.

## Before merging
- Verify displayed KJV text against the stored source.
- Test offline.
- Test AI unavailable/disabled.
- Confirm generated text is visually distinct from Scripture.
- Check mobile and full-screen clock layouts.
