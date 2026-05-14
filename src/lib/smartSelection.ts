import { supabase } from './supabase'

// Helper to smart-select questions
// Enforcing:
// 1. One question per difficulty (100, 200, 300, 400, 500)
// 2. SRS-Lite: Avoid repeating questions tracked in localStorage history
export async function smartSelectQuestions(
    allQuestions: any[],
    categoryName: string,
    targetCount: number = 5,
    historyKey: string = 'qb_host_history'
) {
    // 1. Load History
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}')
    const seenIds = new Set(history[categoryName] || [])

    // 2. Filter available
    let available = allQuestions.filter(q => !seenIds.has(q.id))

    // Fallback: If ran out, reset history for this category
    if (available.length < targetCount) {
        console.warn(`[SRS] Resetting history for ${categoryName}`)
        available = allQuestions
        // partially clear history
        delete history[categoryName]
        localStorage.setItem(historyKey, JSON.stringify(history))
    }

    // 3. Group by Difficulty
    // Points are usually 100, 200...
    const byPoints: Record<number, any[]> = {}
    available.forEach(q => {
        const pts = q.points || 100
        if (!byPoints[pts]) byPoints[pts] = []
        byPoints[pts].push(q)
    })

    const selected: any[] = []
    const desiredPoints = [100, 200, 300, 400, 500]

    // 4. Select one from each tier
    desiredPoints.forEach(pts => {
        if (selected.length >= targetCount) return

        const pool = byPoints[pts] || []
        if (pool.length > 0) {
            // Random pick
            const pick = pool[Math.floor(Math.random() * pool.length)]
            selected.push(pick)

            // Mark as seen
            if (!history[categoryName]) history[categoryName] = []
            history[categoryName].push(pick.id)
        } else {
            // Tier missing? We'll backfill later
        }
    })

    // 5. Backfill if specific tiers were empty but we have space
    let attempts = 0
    while (selected.length < targetCount && attempts < 100) {
        const randomQ = available[Math.floor(Math.random() * available.length)]
        if (!selected.find(s => s.id === randomQ.id)) {
            selected.push(randomQ)
        }
        attempts++
    }

    // Save updated history
    localStorage.setItem(historyKey, JSON.stringify(history))

    return selected.sort((a, b) => a.points - b.points)
}

export function isNumericQuestion(q: any): boolean {
    // Detect if question is numeric based on metadata or structure
    // Since we failed to migrate schema, we rely on content convention or explicit 'q_type' if it exists in JSON
    return q.q_type === 'NUMERIC' || (q.options === null && typeof q.answer_text === 'string' && !isNaN(parseFloat(q.answer_text)))
}
