export const SYSTEM_PROMPT_STANDARD = `
Create quiz categories for the following topics: [{topic}].
Target Audience Difficulty: {difficulty}. Adjust the complexity of questions accordingly.

CRITICAL INSTRUCTIONS:
1. Use the EXACT topic name provided in the list. Do not use synonyms or variations.
2. For EACH topic, generate exactly {questionCount} questions with increasing difficulty.

Output strictly valid JSON object with this schema:
{
  "categories": [
    {
      "name": "EXACT TOPIC NAME FROM LIST", 
      "main_category": "Suggested broad category (e.g. Science, History)",
      "questions": [
        {
          "category": "EXACT TOPIC NAME FROM LIST",
          "points": 100,
          "question_text": "The clue/question...",
          "answer_text": "The correct answer..."
        }
      ]
    }
  ]
}
Return ONLY the raw JSON string. No markdown formatting.
`;

export const SYSTEM_PROMPT_ARENA = `
Create "ARENA COMBAT SETS" for the following list of topics: [{topic}].
Target Audience Difficulty: {difficulty}. Adjust the complexity of questions accordingly.
An Arena Set consists of exactly {questionCount} Questions designed for fast-paced multiplayer trivia.

CRITICAL INSTRUCTIONS:
1. For EACH topic in the list, generate a SEPARATE category object in the 'categories' array.
2. Use the EXACT topic name provided. Do NOT merge topics.
3. Question Types: MCQ is preferred. ONLY use NUMERIC if the topic naturally involves numbers.
4. Points: 100 - 500.

Output strictly valid JSON object with this schema:
{
  "categories": [
    {
      "name": "EXACT TOPIC NAME FROM LIST",  
      "main_category": "Topic Specific Category",
      "tags": ["Arena", "Topic Name"],
      "questions": [
        {
            "q_type": "MCQ", 
            "points": 100,
            "question_text": "A concise, rapid-fire question text...",
            "answer_text": "The Correct Option",
            "options": ["Wrong Option 1", "The Correct Option", "Wrong Option 2", "Wrong Option 3"]
        },
        {
            "q_type": "NUMERIC",
            "points": 500,
            "question_text": "An estimation question...",
            "answer_text": "1995",
            "numeric_answer": 1995
        }
      ]
    }
  ]
}

CONSTRAINT FOR MCQ:
- Options must be an array of exactly 4 strings.
- One option must be the correct answer.
- Distractors should be plausible.

CONSTRAINT FOR NUMERIC (only if topic naturally involves numbers):
- "numeric_answer" must be a pure number (integer or float).
- "answer_text" can be the string representation.
- If NUMERIC doesn't fit the topic naturally, just use MCQ instead.

OUTPUT REQUIREMENTS:
- Output MUST be valid RFC8259 JSON.
- NO trailing commas.
- Escape all double quotes within strings (e.g., \\").
- Do NOT wrap in markdown code blocks (no \`\`\`json).
- Return ONLY the JSON object.
`;
