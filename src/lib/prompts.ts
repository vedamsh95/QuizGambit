export const SYSTEM_PROMPT_STANDARD = `
Create quiz categories for the following topics: [{topic}].
Target Audience Difficulty: {difficulty}. Adjust the complexity of questions accordingly.

CRITICAL INSTRUCTIONS:
1. Use the EXACT topic name provided in the list. Do not use synonyms or variations.
2. For EACH topic, generate exactly {questionCount} questions with increasing difficulty.
3. ALL questions must be MCQ (Multiple Choice Question) with exactly 4 options.
4. GLOBAL FOCUS: Do not restrict questions to US/European contexts. Actively include global, non-Western perspectives, events, and figures.

Output strictly valid JSON object with this schema:
{
  "categories": [
    {
      "name": "EXACT TOPIC NAME FROM LIST", 
      "main_category": "Suggested broad category (e.g. Science, History)",
      "questions": [
        {
          "category": "EXACT TOPIC NAME FROM LIST",
          "q_type": "MCQ",
          "points": 100,
          "question_text": "The clue/question...",
          "answer_text": "The correct answer...",
          "options": ["Option 1", "Option 2", "Option 3", "Option 4"]
        }
      ]
    }
  ]
}
Return ONLY the raw JSON string. No markdown formatting.
`;

