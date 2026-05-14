export const SYSTEM_PROMPT_STANDARD = `
Create quiz categories for the following topics: [{topic}].
Target Audience Difficulty: {difficulty}. Adjust the complexity of questions accordingly.

CRITICAL INSTRUCTIONS:
1. Use the EXACT topic name provided in the list. Do not use synonyms or variations.
2. For EACH topic, generate exactly {questionCount} questions with increasing difficulty.
3. ALL questions must be MCQ (Multiple Choice Question) with exactly 4 options.

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

export const SYSTEM_PROMPT_ARENA = `
Create "ARENA COMBAT SETS" for the following list of topics: [{topic}].
Target Audience Difficulty: {difficulty}. Adjust the complexity of questions accordingly.
An Arena Set consists of exactly {questionCount} Questions designed for fast-paced multiplayer trivia.

CRITICAL RULES - FOLLOW THESE STRICTLY:
1. For EACH topic in the list, generate a SEPARATE category object in the 'categories' array.
2. Use the EXACT topic name provided. Do NOT merge topics.
3. ALL questions must be MCQ (Multiple Choice Question) with exactly 4 options.
4. Points: 100 - 500.

STRICT PROHIBITIONS - NEVER DO THESE:
❌ NEVER put the answer in the question text (e.g., BAD: "What is the capital of France? A. Paris" - the answer "Paris" appears in both question and options!)
❌ NEVER use obvious word patterns (e.g., "The [X] is located in [Y]" where [Y] is an option)
❌ NEVER make questions that can be solved by elimination alone without real knowledge

QUALITY GUIDELINES - MAKE QUESTIONS FUN & ENGAGING:
✅ Make questions SURPRISING - the answer should not be obvious from reading the question
✅ Use interesting, specific details that make players curious
✅ Frame questions from unexpected angles - make players think!
✅ Include fascinating trivia bits in the question text (e.g., "This secret agent codename was used in 1969...")
✅ Questions should test REAL knowledge and understanding, not just pattern matching
✅ Make distractors (wrong answers) plausible and tempting - not obviously wrong

GOOD QUESTION EXAMPLE:
BAD: "What is the capital of Australia?" Options: Sydney, Melbourne, Canberra, Perth
GOOD: "This city wasn't even founded until 1913, yet it became Australia's capital over its larger rivals. Which city?" Options: Sydney, Melbourne, Canberra, Perth

BAD QUESTION EXAMPLE:
"What year did the Titanic sink?" Options: 1910, 1912, 1914, 1916
GOOD: "When the Titanic sank, this future Hollywood actor was just 2 years old and would later star in a film about the disaster. What year was he born?" Options: 1898, 1900, 1902, 1904

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
            "question_text": "A fun, surprising, engaging question text...",
            "answer_text": "The Correct Option",
            "options": ["Wrong Option 1", "Wrong Option 2", "The Correct Option", "Wrong Option 3"]
        }
      ]
    }
  ]
}

MCQ REQUIREMENTS:
- "q_type" must always be "MCQ"
- "options" must be an array of exactly 4 strings
- One option is the correct answer, three are wrong but plausible distractors
- "options" array order should be randomized (don't always put correct answer in same position)

OUTPUT REQUIREMENTS:
- Output MUST be valid RFC8259 JSON.
- NO trailing commas.
- Escape all double quotes within strings (e.g., \\").
- Do NOT wrap in markdown code blocks (no \`\`\`json).
- Return ONLY the JSON object.
`;
