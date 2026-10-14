# Project architecture

- EPI uses a distinct inventory kind and shared photo/code controls; deliveries and whole-balance disposal use an admin-validated, row-locked, idempotent RPC with immutable event snapshots and authenticated Realtime to prevent partial or duplicate stock changes.

- Employee punch history is served by a token-validated public server route; this keeps administrative tables and private media inaccessible to anonymous clients.
- Mobile inventory reassignment uses one admin-validated atomic database function for obra, holder, and paused-site justification updates, preventing partial assignment saves.
- Whole-site resource transfers use one admin-validated database function and lifecycle history; works are never deleted from their detail view.
- Item condition changes are lifecycle events: maintenance exit requires a repair justification, while disposal preserves audit dates and releases the item code.
- Item codes are claimed through a private normalized primary-key reservation table and transactional triggers, preventing concurrent duplicate writes without rewriting legacy duplicates; frontend code checks provide early feedback.
- Inventory and asset photo controls reuse the same dialog so upload and display behavior remain identical.
- Inventory alert resolution is persisted on items by admin-validated inspection RPC and transactional item/allocation triggers; authenticated Realtime subscriptions cancel stale alert reads and patch caches before refetch to prevent treated alerts from reappearing.
- Mobile Obras reuses the inventory confirmation and reassignment controls against live allocations, preserving desktop workflows.
- Token-based item catalogs expose characteristics through additive read RPCs while retaining active-employee token validation for personal allocations.
- Production voice uses browser SpeechRecognition and a pure browser-safe deterministic note parser with no paid AI requests, editable transcription and explicit save; production subscriptions wait for the authenticated session, publish both entries and participants, and key participant reads by entry IDs.
