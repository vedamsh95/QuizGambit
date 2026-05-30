// ── Lobby Code Generator ────────────────────────────────────────────
// Uses ~9,932 common 6-letter English words (curated from word.list
// intersected with macOS system dictionary) to generate human-friendly
// lobby access codes that are easy to spell and share.

let words: string[] | null = null;
let fetchPromise: Promise<string[]> | null = null;

async function loadWords(): Promise<string[]> {
  if (words) return words;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    const res = await fetch("/lobby-codes.json");
    const data = await res.json();
    words = data.words as string[];
    return words;
  })();

  return fetchPromise;
}

/**
 * Pick a random 6-letter word for use as a lobby code.
 * The word list is fetched once and cached in memory.
 */
export async function pickLobbyCode(): Promise<string> {
  const wordList = await loadWords();
  return wordList[Math.floor(Math.random() * wordList.length)];
}
