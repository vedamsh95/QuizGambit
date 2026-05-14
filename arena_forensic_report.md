# Arena Forensic Report

## 1. Table Definitions (Constraints)
**Table**: `arena_answers`
**Constraints Found**:
1. `arena_answers_pkey`: PRIMARY KEY (id)
2. `unique_answer_per_turn`: **UNIQUE (lobby_code, question_id, player_id)**
3. `arena_answers_lobby_code_fkey`: FK to lobbies(code)
4. `arena_answers_player_id_fkey`: FK to players(id)

*Analysis*: The unique constraint is present and correct. The failure of `ON CONFLICT DO NOTHING` to work suggests the active function code is not referencing it correctly or is referencing a different inferred index.

## 2. RPC Function Definition
**Status**: **CRITICAL ERROR**
Running `SELECT pg_get_functiondef('submit_arena_answer'::regproc);` failed with:
> `ERROR: 42725: more than one function named "submit_arena_answer"`

**Forensic Scan** revealed **3 active versions** of the function:
1. `(text, uuid, uuid, text, double precision)` - *Legacy V1 (Expects UUID question_id)*
2. `(text, text, uuid, text, text, integer, text, boolean)` - *Current Target*
3. `(text, text, uuid, text, text, text, integer, integer)` - *Legacy V2 (Accepts answer_time_ms)*

*Diagnosis*: Postgres Function Overloading is causing ambiguity. Even though we updated "the function", we effectively created *new* overloads while the old ones persisted. If the client arguments drift, they might latch onto an old, buggy version.

## 3. The Fix
We must **DROP ALL** versions explicitly and recreate the canonical, secure version.

## 4. Recommended Action
Run the attached migration `nuke_and_replace_rpc.sql` immediately.
