# Project rules

Nothing describes the system in present tense until it runs in production. Copy describes actual behavior, never intended behavior.

Every false claim found in the 2026-08-09 copy audit came from writing the version we were building toward — a fabricated "AI mines scan activity in real time" claim, a hardcoded "Synced just now" timestamp that never updated, "community-updated" describing a form that only emails a notification, "reviewed by a person" asserted before the review gate had ever run once. None of these were invented to deceive; all of them were the intended end state written down before it was real. Check what the code actually does today before describing what it does, every time — not what the commit in progress is building toward.
