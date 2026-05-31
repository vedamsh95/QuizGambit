# AI Question Generator Review

**Date:** May 31, 2026
**Context:** Review of the current AI prompt engineering for quiz question generation in QuizGambit, covering `prompts.ts`, `ai.ts`, `AIGeneratorView.tsx`, `smartSelection.ts`, and `spacedRepetition.ts`.

---

## Overall Verdict

The prompts are **functional but basic**. They get the job done for a prototype, but the questions they produce are likely **generic, predictable, and forgettable**. The engineering infrastructure around them (JSON repair, topic validation, SRS) is actually quite solid — it's the creative direction that's lacking.

---

## Current Architecture

### Generation Flow
```
User enters topics → prompt template hydrated → API call (OpenAI/Groq/Gemini) → JSON parsed → validated → saved to DB
```

### Prompt Templates
Two templates exist:
- **`SYSTEM_PROMPT_STANDARD`** — Basic prompt: "Create quiz categories for [topics]. MCQ with 4 options. Increasing difficulty."
- **`SYSTEM_PROMPT_ARENA`** — Better version with good/bad examples, strict prohibitions, quality guidelines.

Both produce only MCQ questions.

### Infrastructure (Good)
- `aggressiveJsonRepair()` — Multi-stage JSON repair (strip markdown, fix trailing commas, fix unescaped quotes)
- Topic validation — Filters hallucinated topics from AI output
- Count-match recovery — If count matches but names don't, accepts output
- `response_format: json_object` — Forces valid JSON from API
- `smartSelection.ts` — Selects questions by difficulty tier for game play
- `spacedRepetition.ts` — Tracks seen questions to avoid repeats
- Multi-provider support (OpenAI, Groq, Gemini)
- JSON injection port for manual import

---

## 🔴 Issue #1: Only One Question Type (MCQ)

**Problem:** Every question is "Which of these 4 is correct?" This makes the game feel like a generic quiz app.

**World-class generators produce a mix of question types:**

| Type | Description | Example |
|------|-------------|---------|
| MCQ (standard) | Pick the correct answer | "Which planet is known as the Red Planet?" |
| True/False | Verify a statement | "Venus is hotter than Mercury. True or false?" |
| Which doesn't belong | Identify the odd one out | "Which of these is NOT a primary color?" |
| Two truths and a lie | Identify the false statement | "Two of these are true, one is false. Which is the lie?" |
| Ordering | Arrange chronologically | "Arrange these events in the order they happened" |
| Fill in the blank | Complete the statement | "The _____ Desert is the largest hot desert in the world." |
| Multiple correct | Select ALL that apply | "Which of these are renewable energy sources?" |
| Spot the error | Identify the mistake | "Which of these statements contains a factual error?" |

---

## 🔴 Issue #2: Questions Are Trivia Factoids, Not Experiences

**Problem:** The prompts say "make questions fun and engaging" but provide no concrete frameworks. The AI defaults to: *"What is X?" / "Who did Y?" / "When did Z happen?"*

**World-class question archetypes:**

| Archetype | Example |
|-----------|---------|
| **The Reveal** | "In 2019, scientists discovered a new organ in the human body. Where is it located?" (Answer: behind the nose — the tubarial glands) |
| **The Twist** | "This president was known for his honesty — but his autobiography was actually ghostwritten by a convicted fraudster. Who?" |
| **The Misdirect** | "Which of these animals does NOT have a backbone?" (all 4 options are vertebrates except one, but 2 look like they wouldn't be) |
| **The Irony** | "The inventor of this device refused to use it himself. What was it?" |
| **The Trap** | "How many months have exactly 31 days?" (trap: many forget July/August both have 31) |
| **The Upside Down** | "Which of these facts is WRONG?" (3 true facts, 1 fabricated but plausible lie) |
| **The Puzzle** | "A farmer has 17 sheep. All but 9 run away. How many are left?" (Answer: 9 — the trap is subtraction) |
| **The Visual** | Requires imagining a scenario (e.g., probability, geometry) |

---

## 🟡 Issue #3: Bad Examples in Arena Prompt

**Problem:** The Arena prompt's "GOOD" example is actually convoluted:

> "When the Titanic sank, this future Hollywood actor was just 2 years old and would later star in a film about the disaster. What year was he born?"

This requires **obscure knowledge** and is essentially a **guess** for 99% of players. A good example should be **clever but fair**.

**The actual good example:**
> "This city wasn't even founded until 1913, yet it became Australia's capital over its larger rivals. Which city?"

This works because:
- It tells you *why* to care (1913 = late, surprising)
- The options (Sydney, Melbourne, Canberra, Perth) are all plausible
- If you know it, you feel smart. If you don't, you learn something.

---

## 🟡 Issue #4: No Distractor Craftsmanship

**Problem:** A multiple-choice question is only as good as its wrong answers. The prompts don't teach the AI how to make good distractors.

| Bad distractors | Good distractors |
|----------------|-----------------|
| Obviously wrong | Close but wrong |
| Random | Common misconception |
| Too similar to each other | Each tests a different misunderstanding |

**Example of distractor craftsmanship:**
> "Which bone is the longest in the human body?"
> - Femur ← correct
> - Tibia ← plausible (also in leg)
> - Spine ← common misconception (people think the spine is one bone)
> - Humerus ← plausible (also a long bone)

**Fix:** Add a distractor section teaching the AI to make wrong answers that are:
1. A common misconception
2. A closely related item
3. A plausible alternate

---

## 🟡 Issue #5: No Difficulty Architecture

**Problem:** The prompt says "generate with increasing difficulty" and "points 100-500" but has no framework for what makes a question harder.

**A proper difficulty ladder:**

| Points | What "harder" means |
|--------|---------------------|
| 100 (Easy) | Pop culture, common knowledge, "in the news" |
| 200 (Medium) | Textbook knowledge, requires some study |
| 300 (Challenging) | Specific detail, requires genuine expertise |
| 400 (Hard) | Counterintuitive, requires connecting two facts |
| 500 (Extreme) | Obscure, multidisciplinary, or tricky logic |

**Difficulty should be defined by cognitive effort, not obscurity.** A 500-point question shouldn't ask about an obscure fact nobody knows — it should be a question that's **fair but requires real thinking**.

---

## 🟡 Issue #6: No Thematic Cohesion

**Problem:** When you generate 5 questions for a category, they feel like a random grab bag of isolated trivia facts rather than a curated set.

**A proper 5-question arc:**
- Question 1-2: Foundational knowledge ("what is it?")
- Question 3-4: Connections ("how does it relate to other things?")
- Question 5: The surprise (counterintuitive fact, recent discovery, or popular misconception)

---

## 🟢 Issue #7: Temperature

`temperature: 0.7` is fine for reliability but may limit creativity. Consider making it configurable or using a **temperature schedule** — generate at 0.7, and if the user says "more creative", bump to 0.9.

---

## 🟢 What's Good (Keep As-Is)

| Feature | Why |
|---------|-----|
| **JSON repair** | Multi-stage fallback (`aggressiveJsonRepair`) is well-designed |
| **Topic validation** | Filters hallucinated topics — safety net |
| **Count-match recovery** | Accepts output if count matches even if names are slightly different |
| **`response_format: json_object`** | Forces valid JSON from the API |
| **SRS system** | `smartSelection.ts` + `spacedRepetition.ts` are production-ready |
| **Multi-provider** | OpenAI, Groq, Gemini — good flexibility |
| **JSON injection port** | Manual import in admin dashboard for power users |

---

## The Fundamental Problem

The current system treats the AI as a **fact-retriever**: "Give me 5 trivia questions about [topic]."

A world-class system treats the AI as a **game designer**: "Create an engaging game experience for [topic] that makes players think, laugh, and learn."

---

## Proposed V2 Architecture: Multi-Stage Generation

Rather than one prompt with vague instructions, a **multi-stage pipeline**:

```
Stage 1: DESIGN
Prompt: "Given topic X, suggest 5 question archetypes from this list
         [The Reveal, The Twist, The Misdirect, The Irony, The Trap, 
          The Puzzle, The Upside Down, Can You Spot It]
         that would work well for this topic."
Output: A design brief with archetype choices

Stage 2: CRAFT
Prompt: "Using this design brief, create one question per archetype.
         Each question must have: a hook, a trap, a satisfying reveal,
         and 4 options where 3 are common misconceptions."
Output: 5 crafted questions

Stage 3: REVIEW
Prompt: "Review these 5 questions. For each:
         - Is the answer unambiguously correct? 
         - Are the distractors plausible?
         - Would a knowledgeable player feel satisfied?
         Fix any issues."
Output: Polished questions
```

This is more expensive (3 calls instead of 1) but produces **dramatically** better questions.

---

## Recommended First Step

Rewrite `SYSTEM_PROMPT_STANDARD` with:

1. **Question archetypes** — give the AI a toolbox of 8 question types, not just MCQ
2. **Difficulty ladder** — define what 100-500 actually means in cognitive effort
3. **Distractor craftsmanship** — teach the AI to make wrong answers that are *tempting*
4. **Thematic structure** — 5 questions should tell a mini-story, not be a random list
5. **Better examples** — replace confusing examples with genuinely clever ones

---

## Future Research Directions

For truly world-class questions, study these sources and extract principles:

- **Jeopardy!** — Answer-in-question format, category themed sets, escalating difficulty within a category
- **Only Connect** — Connections between seemingly unrelated items, lateral thinking
- **University Challenge** — "Starter for 10" + bonuses, layered difficulty
- **The Chase** — Head-to-head speed element, multiple difficulty tiers
- **Connections (NYT)** — Category grouping, clever misdirection, "red herring" design
- **Trivia Murder Party / Jackbox** — Social deduction baked into trivia, mini-games within questions
- **Pub quiz culture** — Picture rounds, music rounds, "in the news" rounds, themed nights
