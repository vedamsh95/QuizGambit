import { SYSTEM_PROMPT_STANDARD, SYSTEM_PROMPT_ARENA } from './prompts';

// function mockData... (unchanged)

// Aggressive Client-Side JSON Repair
function aggressiveJsonRepair(raw: string): any {
    // 1. Strip Markdown Wrappers
    let clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    // 2. Extract JSON Object (Find first '{' and last '}')
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1) {
        clean = clean.substring(firstBrace, lastBrace + 1);
    } else {
        throw new Error("No JSON object found in response");
    }

    try {
        // Attempt 1: Direct Parse
        return JSON.parse(clean);
    } catch (e) {
        // Attempt 2: Fix Common AI Errors
        console.warn("[JSON Repair] Direct parse failed, attempting repairs...");

        // A. Fix Trailing Commas
        clean = clean.replace(/,(\s*[}\]])/g, '$1');

        // B. Fix Unescaped Quotes (Basic heuristic: Quotes not preceded by \ or : and not followed by , or } or ] are likely internal)
        // This is risky but often works for simple text. 
        // Better strategy: Fix keys vs values.

        try {
            return JSON.parse(clean);
        } catch (e2) {
            // Attempt 3: "Newlines in strings" fix (AI sometimes breaks lines)
            clean = clean.replace(/\n/g, ' ');
            try {
                return JSON.parse(clean);
            } catch (e3) {
                throw new Error("Local repair failed: " + (e as Error).message);
            }
        }
    }
}

export async function generateQuizQuestions(topics: string | string[], config: AIConfig) {
    const topicList = Array.isArray(topics) ? topics : [topics];
    const isSingle = topicList.length === 1;

    // 1. Select Base Template
    let rawTemplate = config.customPrompt
        ? config.customPrompt
        : (config.mode === 'ARENA' ? SYSTEM_PROMPT_ARENA : SYSTEM_PROMPT_STANDARD);

    // 2. Hydrate Variables
    const topicStr = topicList.map(t => `"${t}"`).join(', ');

    const prompt = rawTemplate
        .replace(/{topic}/g, topicStr)
        .replace(/{difficulty}/g, config.difficulty || "General")
        .replace(/{questionCount}/g, (config.questionCount || 5).toString())
        .replace(/{maxPoints}/g, ((config.questionCount || 5) * 100).toString());


    if (!config.apiKey) {
        console.warn(`No API Key found for ${config.provider}. Using mock data.`);
        return [] // mockData(topicList); // Mock data not implemented yet
    }

    try {
        let resultText = '';

        if (config.provider === 'openai' || config.provider === 'groq') {
            const endpoint = config.provider === 'openai'
                ? "https://api.openai.com/v1/chat/completions"
                : "https://api.groq.com/openai/v1/chat/completions";

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        { role: "system", content: "You are a strict JSON-only quiz generator. Output valid JSON only." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.7,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`API Error ${response.status}: ${err}`);
            }

            const data = await response.json();
            resultText = data.choices[0].message.content;
        }
        else if (config.provider === 'gemini') {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        responseMimeType: "application/json",
                    },
                })
            });

            if (!response.ok) {
                const err = await response.text();
                if (response.status === 400 || response.status === 401 || response.status === 403) {
                    throw new Error(`API Auth Error (${response.status}): Check your API Key. The key might be invalid or expired. Details: ${err}`);
                }
                throw new Error(`API Error ${response.status}: ${err}`);
            }

            const data = await response.json();
            resultText = data.candidates[0].content.parts[0].text;
        }

        // --- COST SAVING LOGIC ---
        // We attempt to repair LOCALLY first. We only retry via API if local repair is impossible.
        try {
            const parsed = aggressiveJsonRepair(resultText);

            // Validate Structure
            let finalOutput: any[] = [];
            if (parsed.categories && Array.isArray(parsed.categories)) {
                finalOutput = parsed.categories;
            } else if (parsed.name && parsed.questions) {
                finalOutput = [parsed];
            } else {
                // If it's an array root
                if (Array.isArray(parsed)) finalOutput = parsed;
                else throw new Error("JSON is valid but structure is incorrect (missing categories)");
            }

            // --- USER SAFETY: Topic Validation ---
            // Ensure we only return what was asked for. AI sometimes hallucinates random topics.
            const requestedTopicsLower = topicList.map(t => t.toLowerCase().trim());

            const validatedOutput = finalOutput.filter(cat => {
                const catName = (cat.name || "").toLowerCase().trim();
                // We check if the category name contains the requested topic OR the requested topic contains the category name
                // This allows for "History" -> "World History" matches
                const matches = requestedTopicsLower.some(req => catName.includes(req) || req.includes(catName));

                if (!matches) {
                    console.warn(`[AI Safety] Filtered out hallucinated topic: "${cat.name}" (Requested: ${topicList.join(', ')})`);
                }
                return matches;
            });

            // --- RECOVERY STRATEGY: Count Match ---
            // If the AI generated exactly the right number of topics, but names didn't match perfectly,
            // we assume the AI just used slightly different names (e.g. "Space" vs "Astronomy") and ACCEPT it.
            // This prevents "0/3 generated" errors when the AI is actually working but being creative with titles.
            if (validatedOutput.length === 0 && finalOutput.length === topicList.length) {
                console.warn("[AI Safety] Strict name match failed, but count matches. Accepting all generated topics as valid.");
                return finalOutput;
            }

            if (validatedOutput.length === 0 && finalOutput.length > 0) {
                console.warn("[AI Safety] All generated topics were filtered out. Returning empty. Full AI Response for debugging:", JSON.stringify(finalOutput));
                return [];
            }

            return validatedOutput;

        } catch (repairError) {
            console.error(`[AI] Repair Failed:`, repairError);
            throw repairError;
        }

    } catch (err) {
        console.error(`AI Error (${config.provider}):`, err);
        throw err;
    }
}


interface AIConfig {
    provider: string;
    apiKey: string;
    model: string;
    questionCount: number;
    mode?: 'STANDARD' | 'ARENA';
    difficulty?: string;
    customPrompt?: string; // Allow Admin to inject raw prompt
}
