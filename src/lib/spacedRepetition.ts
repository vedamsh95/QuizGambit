/**
 * Spaced Repetition Question Picker
 * 
 * Ensures that a question is not repeated until all questions at that 
 * difficulty level have been shown at least once.
 * 
 * Storage Key Format:
 * - qb_seen_{category_id}_{points} = ["question_id_1", "question_id_2", ...]
 */

const STORAGE_PREFIX = 'qb_seen_'

/**
 * Get the storage key for a category and points level
 */
const getStorageKey = (categoryId: string, points: number): string => {
    const sanitizedId = categoryId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
    return `${STORAGE_PREFIX}${sanitizedId}_${points}`
}

/**
 * Get the list of already seen question IDs for a category/points combo
 */
export const getSeenQuestions = (categoryId: string, points: number): string[] => {
    const key = getStorageKey(categoryId, points)
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
}

/**
 * Mark a question as seen
 */
export const markQuestionSeen = (categoryId: string, questionId: string, points: number): void => {
    const key = getStorageKey(categoryId, points)
    const seen = getSeenQuestions(categoryId, points)

    if (!seen.includes(questionId)) {
        seen.push(questionId)
        localStorage.setItem(key, JSON.stringify(seen))
    }
}

/**
 * Reset seen questions for a category/points combo (called when all have been seen)
 */
export const resetSeenQuestions = (categoryId: string, points: number): void => {
    const key = getStorageKey(categoryId, points)
    localStorage.removeItem(key)
}

/**
 * Pick a random unseen question from a pool.
 * If all questions have been seen, reset and pick randomly.
 * 
 * @param questions - All questions at a specific point level
 * @param categoryId - The category ID for tracking
 * @param points - The point level (100, 200, etc.)
 * @returns A randomly selected question, preferring unseen ones
 */
export const pickUnseenQuestion = (
    questions: any[],
    categoryId: string,
    points: number
): any | null => {
    if (!questions || questions.length === 0) return null

    const seen = getSeenQuestions(categoryId, points)

    // Filter to unseen questions
    const unseen = questions.filter(q => {
        const qId = q.id || `${categoryId}-${q.points}-${q.question_text?.slice(0, 20)}`
        return !seen.includes(qId)
    })

    // If all questions have been seen, reset and start fresh
    if (unseen.length === 0) {
        console.log(`[SR] All ${questions.length} questions at ${points}pts for ${categoryId} seen. Resetting...`)
        resetSeenQuestions(categoryId, points)
        // Pick randomly from all questions
        return questions[Math.floor(Math.random() * questions.length)]
    }

    // Pick randomly from unseen questions
    const picked = unseen[Math.floor(Math.random() * unseen.length)]

    // Mark as seen for next time
    const pickedId = picked.id || `${categoryId}-${picked.points}-${picked.question_text?.slice(0, 20)}`
    markQuestionSeen(categoryId, pickedId, points)

    console.log(`[SR] Picked question at ${points}pts. Seen: ${seen.length + 1}/${questions.length}`)

    return picked
}

/**
 * Pick one question per difficulty level from a category using spaced repetition
 * 
 * @param categoryData - All questions in the category
 * @param categoryId - The category ID for tracking
 * @returns Array of 5 questions (one per 100-500 point level)
 */
export const pickQuestionsForGame = (
    categoryData: any[],
    categoryId: string
): any[] => {
    const pointLevels = [100, 200, 300, 400, 500]

    return pointLevels.map(pts => {
        const atThisLevel = categoryData.filter(q => q.points === pts)
        return pickUnseenQuestion(atThisLevel, categoryId, pts)
    }).filter(Boolean)
}

/**
 * Clear all spaced repetition data (useful for testing or reset)
 */
export const clearAllSpacedRepetitionData = (): void => {
    const keysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(STORAGE_PREFIX)) {
            keysToRemove.push(key)
        }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key))
    console.log(`[SR] Cleared ${keysToRemove.length} spaced repetition entries`)
}
