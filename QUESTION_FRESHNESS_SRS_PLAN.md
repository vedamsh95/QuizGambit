# Question Freshness (SRS) Architecture Plan

> **Goal**: Give every player a fresh question experience. Track which questions each player has seen (server-side), avoid repeats until all questions at a difficulty tier are exhausted, and handle multiplayer unions correctly.

---

## Table of Contents

1. [Current State](#current-state)
2. [Phase 1: Add UUIDs to Every Question](#phase-1-add-uuids-to-every-question)
3. [Phase 2: Server-Side Question History Table](#phase-2-server-side-question-history-table)
4. [Phase 3: Smart Question Selection Library](#phase-3-smart-question-selection-library)
5. [Phase 4: Marking Questions as Seen](#phase-4-marking-questions-as-seen)
6. [Phase 5: Question Selection at Setup Time](#phase-5-question-selection-at-setup-time)
7. [Phase 6: Guest/Anonymous Fallback](#phase-6-guestanonymous-fallback)
8. [Phase 7: Freshness UI During Category Selection](#phase-7-freshness-ui-during-category-selection)
9. [Phase 8: Additional Smart Features](#phase-8-additional-smart-features)
10. [Phase 9: Reporting & Analytics](#phase-9-reporting--analytics)
11. [Phase 10: Edge Cases & Gotchas](#phase-10-edge-cases--gotchas)
12. [Things You Might Be Missing](#things-you-might-be-missing)

---

## Current State

### Question Storage
- All questions stored in `categories_library` table (Supabase)
- Each row = one topic/category with `id` (UUID), `name`, `main_category`, `data` (JSONB array of question objects)
- **Questions have no UUIDs** — identified by position + category + points
- Each question has: `question_text`, `answer_text`, `options` (4 MCQ choices), `points` (100-500), `difficulty_tier`, `lens`, `form`, `backdoor_type`, `backdoor_explanation`

### Current SRS (Spaced Repetition)
- `spacedRepetition.ts` — localStorage-based, tracks per-category+per-points-tier
- `smartSelection.ts` — separate localStorage system with different key format
- Neither is server-side or per-player
- Resets when all questions at a tier are seen

### Auth
- Supabase Auth with email/password
- `profiles` table linked to `auth.users(id)`

### Question Assignment Flow
- **Solo**: `Solo5x5Setup` picks categories → `roundCategories` in localStorage → `Solo5x5Board` builds 5×5 grid
- **Multiplayer**: Host picks categories → `round_categories` in lobby settings JSONB → board components read from there
- Questions picked randomly from the category's `data` array at setup time

---

## Phase 1: Add UUIDs to Every Question

**Critical foundation** — without stable IDs, tracking is unreliable.

### Database Migration

```sql
-- Add question_id to every question in every category's data array
UPDATE categories_library
SET data = (
  SELECT jsonb_agg(
    elem || jsonb_build_object('question_id', gen_random_uuid()::text)
  )
  FROM jsonb_array_elements(data) AS elem
  WHERE elem->>'question_id' IS NULL
)
WHERE data IS NOT NULL;
```

### Forge Importer Update

Update `scripts/forge/2_import_batch.ts` to auto-assign `question_id` on import:

```typescript
// In importCategory(), when building the payload:
const dataWithIds = cat.data.map(q => ({
  ...q,
  question_id: q.question_id || crypto.randomUUID(),
}));
```

### Deterministic Fallback ID

For questions that somehow miss the migration, generate a fallback:
```typescript
function getQuestionId(question: any, categoryId: string): string {
  return question.question_id 
    || `${categoryId}-${question.points}-${hashString(question.question_text.slice(0, 30))}`;
}
```

---

## Phase 2: Server-Side Question History Table

### SQL

```sql
CREATE TABLE public.player_question_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories_library(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,           -- UUID from the question's data JSONB
  points INT NOT NULL DEFAULT 100,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  game_mode TEXT,                      -- 'solo_5x5', 'mp_5x5', 'simultaneous', 'links', 'sprint'
  answered_correctly BOOLEAN,          -- NULL = not yet graded (timer expired)
  time_spent_seconds NUMERIC(5,1),
  UNIQUE(player_id, category_id, question_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_pqh_player_cat ON player_question_history(player_id, category_id);
CREATE INDEX idx_pqh_player_cat_pts ON player_question_history(player_id, category_id, points);
CREATE INDEX idx_pqh_player_seen_at ON player_question_history(player_id, seen_at DESC);
```

### RLS Policies

```sql
ALTER TABLE player_question_history ENABLE ROW LEVEL SECURITY;

-- Players can only read their own history
CREATE POLICY "Players read own history" 
  ON player_question_history FOR SELECT 
  USING (auth.uid() = player_id);

-- Players can only insert their own history
CREATE POLICY "Players insert own history" 
  ON player_question_history FOR INSERT 
  WITH CHECK (auth.uid() = player_id);
```

### Server-Side Write RPC (bypasses RLS for multiplayer)

```sql
CREATE OR REPLACE FUNCTION public.mark_questions_seen(
  p_player_ids UUID[],
  p_category_id UUID,
  p_question_id TEXT,
  p_points INT,
  p_game_mode TEXT,
  p_results JSONB DEFAULT NULL  -- { player_id: { correct: bool, time_spent: number } }
) RETURNS void AS $$
DECLARE
  pid UUID;
BEGIN
  FOREACH pid IN ARRAY p_player_ids LOOP
    INSERT INTO public.player_question_history 
      (player_id, category_id, question_id, points, game_mode, answered_correctly, time_spent_seconds)
    VALUES (
      pid, p_category_id, p_question_id, p_points, p_game_mode,
      (p_results->pid->>'correct')::BOOLEAN,
      (p_results->pid->>'time_spent')::NUMERIC
    )
    ON CONFLICT (player_id, category_id, question_id) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Phase 3: Smart Question Selection Library

New file: `src/lib/questionFreshness.ts`

### Core Function Signature

```typescript
interface QuestionSelectionParams {
  categoryId: string;                // which topic
  playerIds: string[];               // [playerId] for solo, [p1,p2,...p5] for multiplayer
  pointsPerTier?: number[];          // default: [100, 200, 300, 400, 500]
  questionsPerTier?: number;         // default: 1
  allowRepeatsWhenExhausted?: boolean; // default: true
}

interface QuestionSelectionResult {
  selectedQuestions: any[];
  stats: {
    totalAvailable: number;
    freshCount: number;
    exhaustedTiers: number[];
    tiersStatus: Record<number, { available: number; total: number }>;
  };
}

async function selectFreshQuestions(
  params: QuestionSelectionParams
): Promise<QuestionSelectionResult>
```

### Solo Mode Algorithm (1 player)

```
1. Fetch category.data from categories_library (questions with question_ids)
2. Fetch player_question_history for (playerId, categoryId) → Set of seen question_ids
3. Filter to unseen questions
4. Group by points tier (100, 200, 300, 400, 500)
5. For each tier:
   a. If unseen exist → randomly pick one
   b. If ALL seen at this tier AND allowRepeatsWhenExhausted → reset tier, pick randomly from all
   c. If tier has no questions → skip
6. Return { selectedQuestions, stats }
```

### Multiplayer Mode Algorithm (N players)

```
1. Fetch category.data
2. Fetch player_question_history for ALL playerIds → UNION of all seen question_ids
3. Filter to questions UNSEEN by ALL players
4. Group by points tier
5. For each tier:
   a. If unseen-by-all exist → randomly pick one
   b. If NONE unseen-by-all → pick from seen pool (prefer least-recently-seen via seen_at)
   c. If tier empty → skip
6. Return { selectedQuestions, stats }
```

### Key Difference: Solo vs Multiplayer

| Aspect | Solo | Multiplayer |
|---|---|---|
| History scope | 1 player | UNION of all N players |
| Exhaustion trigger | When 1 player has seen all | When ALL N players collectively have seen all |
| Repeat selection | Random from all | Prefer least-recently-seen |

The multiplayer union ensures: if Player A has seen 10 questions and Players B-E are fresh, the pool still excludes A's 10 seen questions. This means everyone sees the same question and A never gets a repeat.

---

## Phase 4: Marking Questions as Seen

### Function

```typescript
async function markQuestionsSeen(
  playerIds: string[],
  categoryId: string,
  questionId: string,
  points: number,
  gameMode: string,
  results?: Record<string, { correct: boolean; timeSpent: number }>
): Promise<void>
```

### Integration Points

| Component | When to Call |
|---|---|
| `Solo5x5Board.tsx` | After `applyGrade(isCorrect)` |
| `GameBoard.tsx` | After question close (all players who answered) |
| `SimultaneousBoard.tsx` | After RESULTS phase (all participating players) |
| `LinksBoardV3.tsx` | After each word round completes |
| `LinksSprintBoardV3.tsx` | After each wave completes |

### For unauthenticated users

Fall back to localStorage:
```typescript
if (!session?.user) {
  markQuestionSeenLocal(categoryId, questionId, points);
} else {
  await markQuestionsSeen([session.user.id], categoryId, questionId, points, gameMode, results);
}
```

---

## Phase 5: Question Selection at Setup Time

### Solo 5x5 (`Solo5x5Setup.tsx`)

```
Current flow:
  Pick categories → assign questions randomly → store in roundCategories

New flow:
  Pick categories → for each category, call selectFreshQuestions([playerId], categoryId)
  → embed selected questions in roundCategories
```

### Multiplayer 5x5 (`UnifiedLobby.tsx` / `HostDashboard.tsx`)

```
Current flow:
  Host picks categories → all questions from category.data stored in round_categories

New flow:
  Host picks categories → for each category, call selectFreshQuestions(allPlayerIds, categoryId)
  → store ONLY the selected 5 questions (one per tier) in round_categories
  → This happens at lobby setup time (before game starts)
```

### Simultaneous Mode

```
Current flow:
  Category assigned → picker selects questions at runtime from category.data

New flow:
  At category switch time → call selectFreshQuestions(allPlayerIds, categoryId)
  → populate dynamic question pool from freshness selection
  → When pool exhausted mid-game → re-select (allow repeats)
```

---

## Phase 6: Guest/Anonymous Fallback

### Anonymous ID

```typescript
function getAnonymousPlayerId(): string {
  let id = localStorage.getItem('anonymous_player_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('anonymous_player_id', id);
  }
  return id;
}
```

### Dual Storage Strategy

| User State | History Storage | Selection |
|---|---|---|
| Signed in | `player_question_history` table | Server-side via `selectFreshQuestions()` |
| Guest (anonymous) | localStorage (`qb_seen_*` keys) | Existing `spacedRepetition.ts` |
| Guest → signs in | Merge localStorage → server | Offer migration prompt |

### Migration Prompt (Guest → Signed In)

When a guest signs in:
1. Detect existing localStorage history
2. Show: "You have question history from 12 games as a guest. Merge into your account?"
3. On confirmation: bulk insert into `player_question_history`

---

## Phase 7: Freshness UI During Category Selection

### Solo Setup

```
📊 Your freshness in this topic:
   "Quantum Mechanics" — 25 fresh / 30 total (5 already seen)
   "World War II" — 0 fresh / 30 total ⚠️ (you've seen all questions — repeats ahead)
```

### Multiplayer Host Setup

```
📊 Freshness for your group (3 players):
   "Quantum Mechanics" — 18 fresh / 30 (12 seen by some players)
   "World War II" — 30 fresh / 30 ✨ (all fresh!)
   "Ancient Rome" — 3 fresh / 15 ⚠️ (lots of repeats ahead)
```

### Color Coding

| Freshness % | Color | Meaning |
|---|---|---|
| > 80% | 🟢 Green | Mostly fresh — great pick |
| 40-80% | 🟡 Yellow | Some repeats ahead |
| < 40% | 🔴 Red | Mostly repeats — consider a different topic |

---

## Phase 8: Additional Smart Features

### 1. Recency Weighting
When picking from previously-seen pool, prefer questions seen longest ago:

```sql
SELECT question_id, seen_at
FROM player_question_history
WHERE player_id = $1 AND category_id = $2
ORDER BY seen_at ASC;
```

Exclude the most recently seen questions first, cycle through older ones.

### 2. Session-Level Deduplication
Track a `session_questions` Set per game session to prevent the same question appearing twice even across different categories.

### 3. Question Quality Tracking
Accumulate `answered_correctly` rates per question. Use for:
- Detecting questions that are too easy/hard (calibration)
- Adaptive difficulty for future rounds
- Flagging questions with issues (e.g., 90%+ wrong rate)

### 4. Minimum Pool Size Warnings
Alert the host if a category has too few questions per tier for multiplayer freshness:

| Players | Min questions/tier recommended |
|---|---|
| 1-2 | 5 |
| 3-4 | 8 |
| 5+ | 10+ |

A category with 30 questions across 5 tiers = ~6 per tier. After ~1.2 games with the same players, the 500-point tier is exhausted.

### 5. Adaptive Difficulty
Based on player performance (correct rate, streak), adjust the difficulty mix for future rounds. If a player has 90% accuracy across 500-point questions, start giving them more 500-point questions. If they struggle at 400-point, give them more 300-point.

### 6. Cross-Category Freshness
Track "theme fatigue" — if a player has seen 80%+ of questions in the "Science" theme, gently suggest other themes.

---

## Phase 9: Reporting & Analytics

### Player Coverage View

```sql
CREATE VIEW player_coverage AS
SELECT 
  pqh.player_id,
  cl.main_category AS theme,
  cl.name AS topic,
  COUNT(DISTINCT pqh.question_id) AS seen_count,
  jsonb_array_length(cl.data) AS total_count,
  ROUND(
    100.0 * COUNT(DISTINCT pqh.question_id) / 
    NULLIF(jsonb_array_length(cl.data), 0), 
    1
  ) AS coverage_pct
FROM player_question_history pqh
JOIN categories_library cl ON cl.id = pqh.category_id
GROUP BY pqh.player_id, cl.main_category, cl.name, cl.data;
```

### Question Popularity

```sql
CREATE VIEW question_popularity AS
SELECT
  category_id,
  question_id,
  COUNT(*) AS times_seen,
  COUNT(*) FILTER (WHERE answered_correctly = true) AS times_correct,
  ROUND(AVG(time_spent_seconds), 1) AS avg_time_spent
FROM player_question_history
GROUP BY category_id, question_id;
```

### Content Gap Detection

```sql
-- Topics with fewer than 10 questions per tier (multiplayer-unfriendly)
SELECT 
  name,
  main_category,
  jsonb_array_length(data) AS total_questions,
  jsonb_array_length(data) / 5.0 AS avg_per_tier
FROM categories_library
WHERE jsonb_array_length(data) / 5.0 < 10
ORDER BY avg_per_tier ASC;
```

---

## Phase 10: Edge Cases & Gotchas

| Scenario | Handling |
|---|---|
| Player has seen ALL questions in ALL tiers | Reset history silently, pick randomly — freshness cycle restarts |
| Category has only 3 questions at 500-point tier | Those 3 cycle faster than 100-point tier (30 questions). Natural behavior — each tier exhausts independently |
| Player leaves multiplayer mid-game | Their history is already recorded — doesn't affect current round |
| Question edited after being seen | Include `version` field in question JSONB. If version changed, treat as "new" |
| Two players answer simultaneously | UNIQUE constraint on `(player_id, category_id, question_id)` prevents duplicates |
| Cold start (new player, never played) | All questions are fresh — ideal case, no special handling needed |
| RLS blocks server writes | Use `SECURITY DEFINER` RPC functions for history writes |
| Player clears localStorage | Guest history lost. Signed-in history is server-side — safe |
| Category deleted | `ON DELETE CASCADE` cleans up history automatically |
| Large history table growth | With indexes and 1000 players × 100 questions each = 100K rows — PostgreSQL handles this easily |

---

## Things You Might Be Missing

### 1. The "Veteran Penalty" in Multiplayer

A player who has played a lot will cause the entire group's question pool to shrink (since the pool excludes questions ANY player has seen). This is correct for fairness but means veterans "drag down" freshness for new players in their lobby.

**Mitigation**: Add a lobby toggle — "Prioritize freshness for new players" (uses majority-unseen) vs "Balanced for all" (uses union-unseen, the default).

### 2. Minimum Pool Size Per Tier

For a 5-player game with 5 categories, you need at least 5 fresh questions per tier per category. If a category has only 5 questions at 500 points, one game exhausts that tier for all players.

**Current forge output**: Focused topics generate 30 questions → ~6 per tier. After ~1.2 games with the same players, the 500-point tier is exhausted.

**Recommendation**: Generate 10+ questions per tier (50+ per topic) for multiplayer-heavy topics.

### 3. Cross-Mode Contamination

If a player plays "Quantum Mechanics" in solo mode, then joins a multiplayer game with the same topic, the multiplayer question pool will already exclude their solo-seen questions. This is correct behavior but could surprise players.

**Mitigation**: Show "You've already seen 12/30 questions in this topic" during lobby category selection.

### 4. The Freshness Asymmetry Problem

In a 5-player game, Player A (veteran, seen 8 questions) and Players B-E (fresh). The game picks questions unseen by ALL 5, so A's history dominates the exclusion set. B-E lose 8 fresh questions because of A.

**Trade-off**: 
- Option A (current design): Union exclusion → A never repeats, B-E lose 8 fresh questions
- Option B (majority): Exclude only if 3+ players have seen → A might get repeats, B-E get more fresh
- Option C (weighted): Exclude questions proportionally to how many have seen them

### 5. Difficulty-Tier Mismatch Within a Tier

Difficulty is per-point-tier (100=easy, 500=expert). But within a tier, some questions are harder than others. When the freshness system cycles through all 500-point questions, a player might get the hardest 500-point question first (since they're all "unseen" equally).

**Mitigation**: Use `answered_correctly` data to rank questions within a tier from easier to harder, and select easier-first for fresh players.

---

## Implementation Priority Order

| Priority | Phase | Effort | Impact |
|---|---|---|---|
| 🔴 P0 | Phase 1 — UUID Migration | Medium (migration) | Foundation — everything depends on this |
| 🔴 P0 | Phase 2 — History Table | Small (SQL) | Foundation |
| 🔴 P0 | Phase 3 — Selection Library | Large (new file) | Core logic |
| 🟡 P1 | Phase 4 — Marking Questions | Medium (integration) | Makes history useful |
| 🟡 P1 | Phase 5 — Setup Integration | Medium (integration) | Wires it into the game |
| 🟡 P1 | Phase 6 — Guest Fallback | Small | Won't break for non-signed-in users |
| 🟢 P2 | Phase 7 — Freshness UI | Medium (UI) | UX improvement |
| 🟢 P2 | Phase 8 — Smart Features | Large (iterative) | Polish |
| 🟢 P3 | Phase 9 — Analytics | Small (SQL views) | Monitoring |

---

## Database Schema Summary

```
categories_library
├── id: UUID (PK)
├── name: TEXT
├── main_category: TEXT
├── data: JSONB[] ← each element has +question_id (UUID)
│   ├── question_id: TEXT (NEW)
│   ├── question_text: TEXT
│   ├── answer_text: TEXT
│   ├── options: TEXT[4]
│   ├── points: INT (100-500)
│   ├── difficulty_tier: TEXT
│   ├── lens: TEXT
│   ├── form: TEXT
│   ├── backdoor_type: TEXT
│   └── backdoor_explanation: TEXT
└── tags: TEXT[]

player_question_history (NEW)
├── id: UUID (PK)
├── player_id: UUID → auth.users(id)
├── category_id: UUID → categories_library(id)
├── question_id: TEXT
├── points: INT
├── seen_at: TIMESTAMPTZ
├── game_mode: TEXT
├── answered_correctly: BOOLEAN?
└── time_spent_seconds: NUMERIC?
```
