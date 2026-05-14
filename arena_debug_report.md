# Arena Debug Report & Real-Time Gap Analysis

## 1. The 409 Conflict Error
**Root Cause**: 
We encountered a `409 Conflict` error when submitting answers. This happens when a UNIQUE constraint in the database is violated. In our case, the constraint `unique_answer_per_turn` prevents a player from answering the same question twice in the same lobby.

**Why "ON CONFLICT" Failed Previously**:
PostgreSQL's `ON CONFLICT (col1, col2)` syntax requires precise matching of the index definition. If there was any ambiguity (e.g., column ordering or potential type coercion differences between the RPC arguments and the table columns using text vs uuid), Postgres might fail to infer the correct "arbiter index" to use for the conflict resolution, causing it to fall back to a hard error.

**The Solution**:
I have updated the RPC to use `ON CONFLICT ON CONSTRAINT unique_answer_per_turn DO NOTHING`. By referencing the constraint *by name*, we force Postgres to use it, eliminating any ambiguity. This ensures the "DO NOTHING" clause always triggers on duplicates, preventing the crash.

## 2. Real-Time Feature Gaps (What's Missing?)
To make this a fully Production-Grade Real-Time Multiplayer system, here is what is missing:

### A. Cheating Prevention (Server-Side Time Validation)
*   **Current State**: The client sends `answer_time_ms`. A savvy user could edit the JS to send `1ms` and always win the race.
*   **Fix Needed**: The Database needs to store the `phase_start_time` securely. The RPC should calculate `NOW() - phase_start_time` itself, ignoring the client's claimed time.

### B. Strict Disconnect Handling
*   **Current State**: We have a "Heartbeat" that filters "Ghost Pickers" from *starting* a turn.
*   **Gap**: If a picker disconnects *during* their thinking time, the game waits (potentially forever until manual skip).
*   **Fix Needed**: A background job (pg_cron) or a refined `heartbeat` check that auto-skips the turn if the picker's `last_seen` > 20s.

### C. Reconnection Resilience
*   **Current State**: If a user refreshes, they rely on the `lobbies` subscription to get the current state.
*   **Gap**: There is a race condition. If the `lobbies` update happened *before* the refresh finished loading, the client might settle on an initial empty state.
*   **Fix Needed**: The client should explicitly `fetch` the latest lobby state on mount (in `useEffect`) before setting up the subscription, ensuring they are instantly synced even if no new events occur.

### D. Precise Clock Sync
*   **Current State**: We use polling + Realtime.
*   **Gap**: Clients might be 1-2 seconds desynchronized.
*   **Fix Needed**: Use a server timestamp offset (NTP-style) to ensure everyone's countdown timer ends at the exact same physical moment.

## Summary
The current system is functional and robust against crashes, but relies on "honor system" for timings and basic connectivity. The fixes applied today ensure stability (no crashes), which is the baseline requirement.
