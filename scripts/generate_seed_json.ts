/**
 * Seed Data Generator
 * 
 * Generates a clean, valid JSON file (seed_questions_generated.json) with
 * well-crafted quiz questions across 6 themes, matching the QuizGambitQuestion
 * interface and categories_library schema.
 * 
 * Usage: npx tsx scripts/generate_seed_json.ts
 * 
 * Then import the output via: Admin Dashboard → JSON Import tab
 * Or use scripts/seed_import.mjs
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Question Generator ─────────────────────────────────────────────

type LensType =
  | 'Origin Story' | 'The Unexpected' | 'The Human Element'
  | 'Numbers & Scale' | 'The Rivalry' | 'The Oddity'
  | 'Behind the Scenes' | 'The Connection' | 'What If?'
  | 'The Legacy' | 'The Butterfly Effect' | 'The Evolution'
  | 'The Cultural Impact';

type FormType =
  | 'Form 1 (Action-First)' | 'Form 2 (Parenthetical Hook)'
  | 'Form 3 (Sensory Clue)' | 'Form 4 (Active Quote)'
  | 'Form 5 (Direct Narrative)' | 'Form 6 (The Contradiction)'
  | 'Form 7 (The Question Lead)' | 'Form 8 (The Timeline)'
  | 'Form 9 (The Misdirection)' | 'Form 10 (Defining Trait)';

type BackdoorType =
  | 'Synonym Bridge' | 'Contrast Pop' | 'Everyday Link'
  | 'Anagram-Wordplay' | 'Sequence Pattern' | 'Sensory Logic'
  | 'Category Elimination' | 'Etymology / Name Logic'
  | 'Functional Logic' | 'Pop Culture Hook';

type DifficultyTier = 'easy' | 'medium' | 'challenging' | 'expert';

interface QuizQuestion {
  lens: LensType;
  form: FormType;
  question_text: string;
  answer_text: string;
  options: [string, string, string, string];
  backdoor_type: BackdoorType;
  backdoor_explanation: string;
  points: number;
  difficulty_tier: DifficultyTier;
  tag: string;
}

interface CategoryEntry {
  name: string;
  main_category: string;
  description: string;
  data: QuizQuestion[];
  tags: string[];
}

interface SeedData {
  categories: CategoryEntry[];
}

// ─── Factory to create questions ────────────────────────────────────

function q(
  lens: LensType,
  form: FormType,
  question_text: string,
  answer_text: string,
  options: [string, string, string, string],
  backdoor_type: BackdoorType,
  backdoor_explanation: string,
  points: number,
  difficulty_tier: DifficultyTier,
  tag: string,
): QuizQuestion {
  return { lens, form, question_text, answer_text, options, backdoor_type, backdoor_explanation, points, difficulty_tier, tag };
}

function cat(name: string, main_category: string, description: string, data: QuizQuestion[], tags?: string[]): CategoryEntry {
  return {
    name,
    main_category,
    description,
    data,
    tags: tags || ['Grid', name, `Theme:${main_category}`],
  };
}

// ─────────────────────────────────────────────────────────────────────
// THEME 1: SCIENCE
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// THEME 1: SCIENCE
// ─────────────────────────────────────────────────────────────────────

const science: CategoryEntry[] = [
  cat("Quantum Mechanics", "Science", "The bizarre world of quantum physics from superposition to entanglement.", [
    q("Origin Story", "Form 5 (Direct Narrative)",
      "In 1925 this Austrian physicist developed wave mechanics by treating electrons as waves rather than particles earning him a Nobel Prize and reshaping atomic physics.",
      "Erwin Schrödinger",
      ["Werner Heisenberg", "Erwin Schrödinger", "Niels Bohr", "Max Planck"],
      "Synonym Bridge",
      "Schrödinger is most famously associated with the wave equation and the Schrödinger cat thought experiment.",
      100, "easy", "Wave"),
    q("The Oddity", "Form 2 (Parenthetical Hook)",
      "Unlike classical objects a subatomic particle can exist in multiple states at once a behavior formally known by this term beginning with S.",
      "Superposition",
      ["Entanglement", "Superposition", "Collapse", "Decoherence"],
      "Contrast Pop",
      "Superposition describes quantum systems existing in multiple states simultaneously until measured the foundation of Schrödinger cat.",
      200, "easy", "Duality"),
    q("The Connection", "Form 6 (The Contradiction)",
      "Despite being separated by miles two particles can instantaneously affect each other a phenomenon Einstein called spooky action at a distance.",
      "Quantum entanglement",
      ["Quantum superposition", "Quantum entanglement", "Wave function collapse", "Quantum tunneling"],
      "Everyday Link",
      "Entangled particles affect each other instantly across distance. Einstein spooky action at a distance quote is the classic description.",
      300, "medium", "Spooky"),
    q("The Human Element", "Form 4 (Active Quote)",
      "God does not play dice with the universe declared this iconic physicist who never accepted the Copenhagen interpretation of quantum mechanics.",
      "Albert Einstein",
      ["Niels Bohr", "Albert Einstein", "Richard Feynman", "Max Born"],
      "Pop Culture Hook",
      "The God does not play dice quote is one of Einstein most famous frequently referenced in popular culture.",
      400, "challenging", "Dice"),
    q("Numbers and Scale", "Form 8 (The Timeline)",
      "First theorized by Einstein and Rosen in 1935 then named by John Wheeler in 1967 these hypothetical shortcuts through spacetime are a sci-fi staple.",
      "Wormholes",
      ["Black holes", "Wormholes", "White holes", "Cosmic strings"],
      "Sequence Pattern",
      "Einstein Rosen bridges were theorized in 1935 and renamed wormholes by Wheeler in 1967.",
      500, "expert", "Shortcut"),
  ]),

  cat("Genetics and DNA", "Science", "The blueprint of life how DNA genes and heredity shape every living thing.", [
    q("Origin Story", "Form 5 (Direct Narrative)",
      "In a now famous 1953 paper spanning barely one page two scientists proposed the double helix structure of DNA.",
      "Watson and Crick",
      ["Mendel and Morgan", "Watson and Crick", "Franklin and Wilkins", "Darwin and Wallace"],
      "Synonym Bridge",
      "The double helix is the iconic structure of DNA proposed in 1953 by Watson and Crick.",
      100, "easy", "Helix"),
    q("Behind the Scenes", "Form 2 (Parenthetical Hook)",
      "Though Watson and Crick received the credit this British scientist X-ray image called Photograph 51 provided critical evidence for DNA helical structure.",
      "Rosalind Franklin",
      ["Lise Meitner", "Rosalind Franklin", "Barbara McClintock", "Marie Curie"],
      "Category Elimination",
      "Only Rosalind Franklin is associated with Photograph 51 and X-ray work on DNA.",
      200, "easy", "Photo 51"),
    q("The Unexpected", "Form 9 (The Misdirection)",
      "You might think your DNA is 100 percent human but 8 percent of the genome consists of ancient viral DNA permanently integrated millions of years ago.",
      "Endogenous retroviruses",
      ["Transposons", "Endogenous retroviruses", "Pseudogenes", "Introns"],
      "Functional Logic",
      "Endogenous means originating from within retroviruses insert DNA into host genomes. ERVs are fossilized viral DNA.",
      300, "medium", "Fossil"),
    q("The Legacy", "Form 8 (The Timeline)",
      "Completed in 2003 after 13 years of collaboration costing 3 billion dollars this project mapped every base pair of the human genome.",
      "Human Genome Project",
      ["GenBank Initiative", "Human Genome Project", "ENCODE Project", "1000 Genomes Project"],
      "Everyday Link",
      "The Human Genome Project was completed in 2003 comparable to Apollo for biology.",
      400, "challenging", "Blueprint"),
    q("What If", "Form 7 (The Question Lead)",
      "What revolutionary technology first developed in 2012 by Doudna and Charpentier allows scientists to edit genes with precision described as molecular scissors for DNA",
      "CRISPR-Cas9",
      ["Zinc finger nucleases", "TALENs", "CRISPR-Cas9", "RNA interference"],
      "Sequence Pattern",
      "Doudna and Charpentier won the 2020 Nobel Prize for CRISPR-Cas9 gene editing.",
      500, "expert", "Scissors"),
  ]),

  cat("Space Exploration", "Science", "Humanity journey beyond our atmosphere from the first satellites to interplanetary missions.", [
    q("Origin Story", "Form 5 (Direct Narrative)",
      "On October 4 1957 the world was stunned as a beach ball sized metal sphere became the first human made object to orbit Earth.",
      "Sputnik 1",
      ["Explorer 1", "Sputnik 1", "Vanguard 1", "Telstar 1"],
      "Everyday Link",
      "Sputnik 1 launched in 1957 sparked the space race and its date is one of the most famous in history.",
      100, "easy", "Beep"),
    q("The Human Element", "Form 4 (Active Quote)",
      "That one small step for man one giant leap for mankind uttered by this Apollo 11 commander as he first set foot on the lunar surface in 1969.",
      "Neil Armstrong",
      ["Buzz Aldrin", "Neil Armstrong", "Michael Collins", "John Glenn"],
      "Pop Culture Hook",
      "Arguably the most famous quote in human history universally associated with Neil Armstrong and Apollo 11.",
      100, "easy", "Step"),
    q("Numbers and Scale", "Form 3 (Sensory Clue)",
      "Vibrant rust colored dust covers this planet surface where a car sized robot has explored since 2012 traveling over 30 kilometers.",
      "Mars Curiosity rover",
      ["Venus Venera probe", "Mars Curiosity rover", "Jupiter Juno orbiter", "Saturn Cassini probe"],
      "Sensory Logic",
      "The rust colored dust points to Mars the Red Planet. Curiosity rover has been exploring since 2012.",
      300, "medium", "Rust"),
    q("The Rivalry", "Form 6 (The Contradiction)",
      "Despite vastly different budgets NASA and this private company compete to return humans to the Moon with Artemis and Starship respectively.",
      "SpaceX",
      ["Blue Origin", "SpaceX", "Virgin Galactic", "Rocket Lab"],
      "Category Elimination",
      "SpaceX Starship is explicitly designed for lunar missions competing with NASA Artemis.",
      400, "challenging", "Moon race"),
    q("The Legacy", "Form 8 (The Timeline)",
      "Launched in 1977 this spacecraft became the first human made object to enter interstellar space in 2012 carrying a golden record of Earth sounds and images.",
      "Voyager 1",
      ["Pioneer 10", "Voyager 1", "New Horizons", "Cassini"],
      "Synonym Bridge",
      "The golden record is the iconic calling card of Voyager spacecraft launched in 1977.",
      500, "expert", "Golden"),
  ]),

  cat("Evolution and Natural Selection", "Science", "How species adapt change and diversify over millions of years.", [
    q("Origin Story", "Form 5 (Direct Narrative)",
      "After a five year voyage aboard HMS Beagle this English naturalist published On the Origin of Species in 1859 proposing natural selection.",
      "Charles Darwin",
      ["Alfred Russel Wallace", "Charles Darwin", "Jean Baptiste Lamarck", "Gregor Mendel"],
      "Synonym Bridge",
      "HMS Beagle voyage On the Origin of Species and natural selection all point to Darwin.",
      100, "easy", "Origin"),
    q("The Oddity", "Form 3 (Sensory Clue)",
      "This peacock sized flightless bird from a remote Indian Ocean island went extinct in the late 1600s when humans arrived with dogs rats and pigs.",
      "Dodo",
      ["Moa", "Dodo", "Great auk", "Passenger pigeon"],
      "Everyday Link",
      "The Dodo from Mauritius went extinct in the late 1600s. Dead as a dodo keeps its memory alive.",
      200, "easy", "Dodo"),
    q("The Unexpected", "Form 9 (The Misdirection)",
      "You might think we need fossils to see evolution but the famous long term experiment started in 1988 watches this simple organism evolve across 70 thousand generations in flasks.",
      "E. coli",
      ["E. coli", "Yeast", "Fruit flies", "Zebrafish"],
      "Functional Logic",
      "Richard Lenski long term evolution experiment at Michigan State tracks E. coli evolving across 70k generations.",
      300, "medium", "Flask"),
    q("The Rivalry", "Form 6 (The Contradiction)",
      "Despite independently conceiving natural selection alongside Darwin and sending an essay that spurred publication this explorer naturalist is far less remembered.",
      "Alfred Russel Wallace",
      ["Thomas Henry Huxley", "Alfred Russel Wallace", "Joseph Dalton Hooker", "Charles Lyell"],
      "Category Elimination",
      "Only Wallace independently conceived natural selection and sent Darwin the essay that prompted publication.",
      400, "challenging", "Forgotten"),
    q("The Legacy", "Form 7 (The Question Lead)",
      "What revolutionary idea that all species share a common ancestor and branch from a single tree became the unifying framework of modern biology confirmed by DNA",
      "Common descent",
      ["Punctuated equilibrium", "Common descent", "Genetic drift", "Niche construction"],
      "Etymology Name Logic",
      "The Tree of Life concept confirmed by DNA sequencing that reveals our kinship with fungi and plants.",
      500, "expert", "Tree"),
  ]),

  cat("The Periodic Table", "Science", "The chemist map of the elements their discovery properties and patterns.", [
    q("Origin Story", "Form 5 (Direct Narrative)",
      "While organizing his chemistry textbook this Russian scientist dreamt of a table where elements arranged themselves waking to write the first periodic table in 1869.",
      "Dmitri Mendeleev",
      ["Dmitri Mendeleev", "John Dalton", "Antoine Lavoisier", "Henry Moseley"],
      "Everyday Link",
      "Mendeleev dreamt the periodic table in 1869 and famously predicted undiscovered elements.",
      100, "easy", "Dream"),
    q("The Oddity", "Form 9 (The Misdirection)",
      "It sounds like it should be a heavy metal but this element is a gas at room temperature its name comes from Greek for stranger.",
      "Xenon",
      ["Argon", "Krypton", "Xenon", "Radon"],
      "Etymology Name Logic",
      "Xenon comes from Greek xenos meaning stranger. Krypton means hidden Argon means lazy.",
      200, "easy", "Strange"),
    q("The Human Element", "Form 1 (Action First)",
      "Defying sexist barriers this Polish born physicist discovered polonium and radium becoming the first person to win two Nobel Prizes.",
      "Marie Curie",
      ["Lise Meitner", "Marie Curie", "Irene Joliot Curie", "Dorothy Hodgkin"],
      "Synonym Bridge",
      "Polish born discovered polonium and radium first person to win two Nobel Prizes all point to Marie Curie.",
      300, "medium", "Twice"),
    q("Numbers and Scale", "Form 3 (Sensory Clue)",
      "Dense bluish gray and used in Egyptian kohl this heavy metal was added to paint pipes and gasoline before we discovered it was poisoning civilizations.",
      "Lead",
      ["Mercury", "Lead", "Cadmium", "Arsenic"],
      "Sensory Logic",
      "Lead was used in Egyptian kohl paint plumbing the word comes from Latin plumbum and gasoline.",
      400, "challenging", "Poison"),
    q("The Connection", "Form 10 (Defining Trait)",
      "Silvery white and the heaviest element observable in quantity this element 83 is used in fire extinguishers and bismuth subsalicylate the pink stomach medicine.",
      "Bismuth",
      ["Antimony", "Bismuth", "Polonium", "Lead"],
      "Everyday Link",
      "Pepto Bismol contains bismuth subsalicylate. Bismuth element 83 is the heaviest stable element.",
      500, "expert", "Pink"),
  ]),
];

// ─────────────────────────────────────────────────────────────────────
// THEME 2: HISTORY
// ─────────────────────────────────────────────────────────────────────

const history: CategoryEntry[] = [
  cat('Ancient Civilizations', 'History', 'The great empires and cultures of the ancient world.', [
    q('Origin Story', 'Form 5 (Direct Narrative)',
      'Flowing through modern-day Iraq, the land between the Tigris and Euphrates rivers gave birth to the first cities, writing system cuneiform, and legal code — a civilization known by this Greek name meaning between rivers.',
      'Mesopotamia',
      ['Mesopotamia', 'Sumer', 'Babylon', 'Assyria'],
      'Etymology / Name Logic',
      'Meso means middle and potamia means rivers. The Tigris and Euphrates are in modern Iraq, the cradle of civilization.',
      100, 'easy', 'Cradle'),

    q('The Unexpected', 'Form 6 (The Contradiction)',
      'Though most famous for its massive wall, this ancient civilization also invented paper, the compass, gunpowder, and printing — four technologies that transformed the world.',
      'China',
      ['India', 'China', 'Persia', 'Rome'],
      'Contrast Pop',
      'The Four Great Inventions of ancient China are paper, compass, gunpowder, and printing.',
      200, 'easy', 'Wall'),

    q('The Rivalry', 'Form 2 (Parenthetical Hook)',
      'Unlike Athens which gave us philosophy and democracy, this rival Greek city-state produced no lasting philosophers — its entire legacy is military discipline and the heroic stand at Thermopylae.',
      'Sparta',
      ['Corinth', 'Sparta', 'Thebes', 'Macedon'],
      'Synonym Bridge',
      'The warrior society known for military discipline and Thermopylae. Sparta studied everything through the lens of war.',
      300, 'medium', 'Warriors'),

    q('Behind the Scenes', 'Form 8 (The Timeline)',
      'Created around 1754 BCE, this black stone stele features 282 laws inscribed in Akkadian cuneiform including the principle of an eye for an eye, discovered in 1901 in what is now Iran.',
      'Code of Hammurabi',
      ['Code of Ur-Nammu', 'Code of Hammurabi', 'Justinian Code', 'Twelve Tables'],
      'Sequence Pattern',
      '1754 BCE, 282 laws, an eye for an eye, discovered in 1901. The Code of Hammurabi is the most famous legal code of the ancient world.',
      400, 'challenging', 'Laws'),

    q('The Human Element', 'Form 4 (Active Quote)',
      '"I am the king of kings who built a library to hold all the knowledge of the world," this Assyrian ruler declared before collecting over 30,000 clay tablets.',
      'Ashurbanipal',
      ['Sargon of Akkad', 'Ashurbanipal', 'Nebuchadnezzar II', 'Cyrus the Great'],
      'Category Elimination',
      'Only Ashurbanipal is famous for his library at Nineveh containing the Epic of Gilgamesh. Nebuchadnezzar is Babylonian, Sargon is Akkadian.',
      500, 'expert', 'Library'),
  ]),

  cat('World War II', 'History', 'The deadliest conflict in history 1939-1945 that reshaped the global order.', [
    q('Origin Story', 'Form 5 (Direct Narrative)',
      'On September 1, 1939, this European nation became the target of the first major campaign of World War II when German battleships opened fire on Westerplatte, triggering a six-year global conflict.',
      'Poland',
      ['Poland', 'France', 'Czechoslovakia', 'Belgium'],
      'Everyday Link',
      'Germany invasion of Poland on September 1, 1939 is universally recognized as the start of World War II.',
      100, 'easy', 'Invasion'),

    q('The Human Element', 'Form 4 (Active Quote)',
      '"I have nothing to offer but blood, toil, tears, and sweat," declared this British prime minister in 1940, whose defiant speeches during the Blitz rallied a nation standing alone against Nazi Germany.',
      'Winston Churchill',
      ['Winston Churchill', 'Franklin D. Roosevelt', 'Charles de Gaulle', 'Clement Attlee'],
      'Pop Culture Hook',
      'Churchill most famous speech delivered to the House of Commons on May 13, 1940. His cigar, V-sign, and Blitz speeches are cultural icons.',
      100, 'easy', 'Defiance'),

    q('The Unexpected', 'Form 9 (The Misdirection)',
      'It sounds like it would be the most bombed city of WWII, but the title of tonnage dropped belongs to this industrial German city, home to Krupp Industries, hit by over 600,000 bombs.',
      'Essen',
      ['Hamburg', 'Essen', 'Dresden', 'Cologne'],
      'Contrast Pop',
      'Essen was home to Krupp Industries, Germany largest weapons manufacturer, making it the primary target of Allied strategic bombing.',
      300, 'medium', 'Bombed'),

    q('Behind the Scenes', 'Form 2 (Parenthetical Hook)',
      'Though Enigma code-breaking is credited to Turing at Bletchley Park, the first breakthroughs into German Enigma were achieved years earlier by this nation cryptologic bureau working since 1932.',
      'Poland',
      ['France', 'Poland', 'Soviet Union', 'Netherlands'],
      'Sequence Pattern',
      'Polish Cipher Bureau led by Rejewski, Zygalski, and R\u00f3\u017cycki first broke Enigma and gave their knowledge to the British in 1939.',
      400, 'challenging', 'Enigma'),

    q('The Legacy', 'Form 8 (The Timeline)',
      'On June 6, 1944, the largest amphibious invasion in history saw 156,000 Allied troops storm five beaches codenamed Utah, Omaha, Gold, Juno, and this final one.',
      'Sword Beach',
      ['Juno Beach', 'Sword Beach', 'Omaha Beach', 'Gold Beach'],
      'Sequence Pattern',
      'The five D-Day beaches from west to east: Utah, Omaha, Gold, Juno, and Sword. Sword was the easternmost beach assigned to British forces.',
      500, 'expert', 'D-Day'),
  ]),
];

// ─────────────────────────────────────────────────────────────────────
// THEME 3: ARTS & CULTURE
// ─────────────────────────────────────────────────────────────────────

const arts: CategoryEntry[] = [
  cat('Renaissance Masters', 'Arts & Culture', 'The brilliant artists and thinkers of the European Renaissance.', [
    q('Origin Story', 'Form 5 (Direct Narrative)',
      'Painting the Sistine Chapel ceiling between 1508 and 1512, this sculptor, painter, and architect created one of the most recognizable images in human history despite preferring sculpture over painting.',
      'Michelangelo',
      ['Leonardo da Vinci', 'Michelangelo', 'Raphael', 'Donatello'],
      'Pop Culture Hook',
      'The Sistine Chapel ceiling is one of the most famous artworks. Michelangelo preference for sculpture is legendary.',
      100, 'easy', 'Sistine'),

    q('Behind the Scenes', 'Form 2 (Parenthetical Hook)',
      'Unlike his rival Michelangelo muscular idealized figures, this Florentine painter depicted the Virgin Mary with a remarkably human relatable expression — his Madonnas feel like real mothers.',
      'Raphael',
      ['Botticelli', 'Raphael', 'Titian', 'Caravaggio'],
      'Contrast Pop',
      'Raphael Madonnas are known for their gentle human quality. The Uffizi Gallery in Florence houses many of them.',
      200, 'easy', 'Madonna'),

    q('The Human Element', 'Form 4 (Active Quote)',
      '"The human foot is a masterpiece of engineering," this Renaissance polymath wrote in his notebooks, reflecting his belief that art and science were inseparable, with anatomical sketches centuries ahead of their time.',
      'Leonardo da Vinci',
      ['Leonardo da Vinci', 'Albrecht D\u00fcrer', 'Andreas Vesalius', 'Giorgio Vasari'],
      'Synonym Bridge',
      'Renaissance polymath who filled notebooks with anatomical sketches from human dissections. His Vitruvian Man is the iconic fusion of art and science.',
      300, 'medium', 'Sketch'),

    q('The Oddity', 'Form 9 (The Misdirection)',
      'Despite sharing a name with a teenage mutant ninja turtle, this Venetian artist pioneered the use of color over line drawing and painted the monumental Assumption of the Virgin in the Frari church.',
      'Titian',
      ['Giorgione', 'Titian', 'Tintoretto', 'Veronese'],
      'Pop Culture Hook',
      'The Teenage Mutant Ninja Turtles are named Donatello, Michelangelo, Raphael, Leonardo but Titian is NOT one of them.',
      400, 'challenging', 'Color'),

    q('The Legacy', 'Form 7 (The Question Lead)',
      'What city ruled by the Medici family became the birthplace of the Renaissance, often called the Athens of the Middle Ages for its concentration of creative genius?',
      'Florence',
      ['Venice', 'Florence', 'Rome', 'Milan'],
      'Etymology / Name Logic',
      'The Medici family, birthplace of the Renaissance, originally Florentia meaning flourishing, perfectly capturing its role as the cradle of the Renaissance.',
      500, 'expert', 'Birthplace'),
  ]),
];

// ─────────────────────────────────────────────────────────────────────
// THEME 4: TECHNOLOGY
// ─────────────────────────────────────────────────────────────────────

const tech: CategoryEntry[] = [
  cat('The Internet Revolution', 'Technology', 'From vacuum tubes to the World Wide Web.', [
    q('Origin Story', 'Form 5 (Direct Narrative)',
      'In 1969, the first message was sent over this U.S. Department of Defense network between UCLA and Stanford — the system crashed after transmitting just two letters of the word LOGIN.',
      'ARPANET',
      ['NSFNET', 'ARPANET', 'MILNET', 'CERN'],
      'Everyday Link',
      '1969, DOD network, UCLA to Stanford, the crashed LOGIN message. This is the birth story of ARPANET, the precursor to the internet.',
      100, 'easy', 'Login'),

    q('The Human Element', 'Form 4 (Active Quote)',
      'While working at CERN in 1989, this British computer scientist proposed an information management system giving us URLs, HTTP, and HTML, famously not patenting his invention.',
      'Tim Berners-Lee',
      ['Vint Cerf', 'Tim Berners-Lee', 'Robert Cailliau', 'Marc Andreessen'],
      'Synonym Bridge',
      'CERN, 1989, URLs, HTTP, HTML, first browser and server, kept the web free for everyone.',
      200, 'easy', 'Web'),

    q('Behind the Scenes', 'Form 9 (The Misdirection)',
      'It sounds like a movie rating system but this pair of protocols created by Cerf and Kahn in 1974 is the fundamental communication standard that routes data packets across networks.',
      'TCP/IP',
      ['SMTP', 'TCP/IP', 'DNS', 'FTP'],
      'Functional Logic',
      'Vint Cerf and Bob Kahn designed TCP/IP in 1974. TCP and IP are the fundamental communication protocols of the internet.',
      300, 'medium', 'Packets'),

    q('Numbers & Scale', 'Form 3 (Sensory Clue)',
      'Born in a Harvard dorm room and originally called TheFacebook, this blue-and-white platform connects nearly 3 billion monthly active users, portrayed in the Oscar-winning film The Social Network.',
      'Facebook',
      ['Twitter', 'Facebook', 'YouTube', 'Instagram'],
      'Pop Culture Hook',
      'Harvard dorm room, originally TheFacebook, film The Social Network, founded by Mark Zuckerberg.',
      400, 'challenging', 'Network'),

    q('The Legacy', 'Form 7 (The Question Lead)',
      'What company founded in 1998 by two Stanford PhD students took its name from the mathematical term for 1 followed by 100 zeros, reflecting its mission to organize the infinite web?',
      'Google',
      ['Yahoo', 'Google', 'AltaVista', 'Bing'],
      'Etymology / Name Logic',
      'Googol is 10^100. Larry Page and Sergey Brin intended to name it Googol but a friend wrote the check to Google Inc.',
      500, 'expert', 'Search'),
  ]),

  cat('Artificial Intelligence', 'Technology', 'The quest to create machines that can think, learn, and reason.', [
    q('Origin Story', 'Form 5 (Direct Narrative)',
      'In 1950, this Cambridge mathematician proposed an imitation game to test machine intelligence, now considered the father of AI and theoretical computer science.',
      'Alan Turing',
      ['Alan Turing', 'John McCarthy', 'Marvin Minsky', 'Norbert Wiener'],
      'Pop Culture Hook',
      'The imitation game is the Turing Test, featured in the film The Imitation Game 2014 starring Benedict Cumberbatch.',
      100, 'easy', 'Imitation'),

    q('The Unexpected', 'Form 2 (Parenthetical Hook)',
      'Unlike chess where computers beat humans in 1997, this ancient board game with more positions than atoms in the universe was considered impossible for AI until DeepMind AlphaGo won in 2016.',
      'Go',
      ['Go', 'Chess', 'Shogi', 'Othello'],
      'Contrast Pop',
      'More positions than atoms in the universe is a famous property of Go. AlphaGo beat Lee Sedol in a landmark 2016 match.',
      200, 'easy', 'AlphaGo'),

    q('The Human Element', 'Form 4 (Active Quote)',
      'This roboticist lab at Boston Dynamics created robots like BigDog and Atlas that can run jump and backflip like living creatures.',
      'Marc Raibert',
      ['Marc Raibert', 'Hod Lipson', 'Hiroshi Ishiguro', 'Daniela Rus'],
      'Synonym Bridge',
      'Boston Dynamics, BigDog, Atlas, backflipping humanoid robots in viral videos.',
      300, 'medium', 'Robots'),

    q('The Connection', 'Form 6 (The Contradiction)',
      'Though it powers everything from facial recognition to language translation, this mathematical architecture loosely inspired by the brain was dismissed as fringe for 50 years before dominating AI.',
      'Neural networks (deep learning)',
      ['Genetic algorithms', 'Neural networks (deep learning)', 'Bayesian inference', 'Symbolic AI'],
      'Functional Logic',
      'The artificial neuron concept dates to the 1940s but deep learning exploded in the 2010s with GPUs and big data.',
      400, 'challenging', 'Brain'),

    q('What If?', 'Form 7 (The Question Lead)',
      'What 1956 Dartmouth College workshop with McCarthy, Minsky, and Shannon gave this field its name and set research agendas for the next 70 years of computer science?',
      'Dartmouth Conference',
      ['MIT AI Lab founding', 'Dartmouth Conference', 'Cybernetics Symposium', 'DARPA Grand Challenge'],
      'Sequence Pattern',
      '1956 Dartmouth Summer Research Project on AI is the founding event. John McCarthy coined the term Artificial Intelligence.',
      500, 'expert', 'Birth'),
  ]),
];

// ─────────────────────────────────────────────────────────────────────
// THEME 5: NATURE & WILDLIFE
// ─────────────────────────────────────────────────────────────────────

const nature: CategoryEntry[] = [
  cat("Ocean Life", "Nature and Wildlife", "The mysterious world beneath the waves.", [
    q("Origin Story", "Form 5 (Direct Narrative)",
      "Covering over 70 percent of Earth surface and producing more than half its oxygen this vast body of salt water gave rise to all life 3.5 billion years ago.",
      "The ocean",
      ["The ocean", "The atmosphere", "The Great Lakes", "Underground aquifers"],
      "Everyday Link",
      "Every second breath comes from the ocean phytoplankton produces most of our oxygen.",
      100, "easy", "Blue"),
    q("The Oddity", "Form 3 (Sensory Clue)",
      "Translucent and only 4.5 millimeters across this tiny jellyfish can reverse its life cycle when injured transforming its cells back to their earliest form.",
      "Immortal jellyfish",
      ["Immortal jellyfish", "Lion mane jellyfish", "Box jellyfish", "Portuguese man o war"],
      "Functional Logic",
      "Turritopsis dohrnii the immortal jellyfish reverts to its polyp stage through transdifferentiation.",
      200, "easy", "Immortal"),
    q("Numbers and Scale", "Form 2 (Parenthetical Hook)",
      "Unlike extinct dinosaurs this ocean giant weighing 200 tons and stretching 100 feet is the largest animal to have ever lived on Earth.",
      "Blue whale",
      ["Blue whale", "Fin whale", "Humpback whale", "Sperm whale"],
      "Contrast Pop",
      "Blue whale at 200 tons is larger than any dinosaur. Its heart is the size of a small car.",
      300, "medium", "Giant"),
    q("Behind the Scenes", "Form 1 (Action First)",
      "Living at 3000 feet depth this bioluminescent predator uses a lure dangling from its forehead to attract prey in total darkness.",
      "Anglerfish",
      ["Viperfish", "Anglerfish", "Lanternfish", "Dragonfish"],
      "Synonym Bridge",
      "The anglerfish glowing esca is a modified dorsal fin ray with bioluminescent bacteria.",
      400, "challenging", "Lure"),
    q("The Connection", "Form 10 (Defining Trait)",
      "Colorful stationary built from colonies of polyps these living cities cover less than one percent of the ocean floor yet host 25 percent of all marine species.",
      "Coral reefs",
      ["Kelp forests", "Coral reefs", "Mangrove swamps", "Seagrass meadows"],
      "Category Elimination",
      "Coral reefs are the rainforests of the sea the most biodiverse ocean ecosystems.",
      500, "expert", "Reef"),
  ]),

  cat("Animal Kingdom Records", "Nature and Wildlife", "The fastest toughest and most extreme survivors.", [
    q("Numbers and Scale", "Form 2 (Parenthetical Hook)",
      "Unlike cheetahs that sprint on land this streamlined hunter holds the title of fastest animal reaching 240 miles per hour during its hunting dive.",
      "Peregrine falcon",
      ["Peregrine falcon", "Golden eagle", "Spine tailed swift", "Frigatebird"],
      "Contrast Pop",
      "The peregrine falcon stoop dive exceeds 240 mph making it the fastest animal on Earth.",
      100, "easy", "Dive"),
    q("The Oddity", "Form 9 (The Misdirection)",
      "It sounds like sci-fi but this microscopic animal barely 1 millimeter long survives space vacuum radiation and decades without water by entering cryptobiosis.",
      "Tardigrade",
      ["Nematode", "Tardigrade", "Rotifer", "Bdelloid rotifer"],
      "Pop Culture Hook",
      "Tardigrades also called water bears are internet famous for their near indestructibility.",
      200, "easy", "Water bear"),
    q("The Unexpected", "Form 2 (Parenthetical Hook)",
      "Though it lives in the ocean and looks like a plant this creature has no brain no heart and no blood yet some species live over 10 thousand years.",
      "Sponge",
      ["Sea anemone", "Sponge", "Coral", "Jellyfish"],
      "Functional Logic",
      "Sponges Porifera are the simplest multicellular animals filter feeders that live for millennia.",
      300, "medium", "Simple"),
    q("The Human Element", "Form 4 (Active Quote)",
      "This British primatologist spent decades living with mountain gorillas in Rwanda protecting them from poachers and changing how we view our closest relatives.",
      "Dian Fossey",
      ["Dian Fossey", "Jane Goodall", "Birute Galdikas", "Louis Leakey"],
      "Category Elimination",
      "Fossey studied gorillas in Rwanda portrayed by Sigourney Weaver in Gorillas in the Mist.",
      400, "challenging", "Gorilla"),
    q("The Legacy", "Form 7 (The Question Lead)",
      "What 1973 US law has saved over 2000 species from extinction including the bald eagle gray wolf and American alligator by protecting habitats",
      "Endangered Species Act",
      ["Marine Mammal Protection Act", "Endangered Species Act", "Lacey Act", "CITES"],
      "Sequence Pattern",
      "The US Endangered Species Act of 1973 saved the bald eagle from near extinction delisted in 2007.",
      500, "expert", "Saved"),
  ]),

  cat("Extreme Environments", "Nature and Wildlife", "Life that thrives where nothing should survive.", [
    q("The Unexpected", "Form 2 (Parenthetical Hook)",
      "Unlike most life needing sunlight deep sea ecosystems are powered by this process where bacteria use hydrogen sulfide from hydrothermal vents.",
      "Chemosynthesis",
      ["Chemosynthesis", "Radiosynthesis", "Thermosynthesis", "Fermentation"],
      "Contrast Pop",
      "Chemosynthesis converts chemical energy from hydrogen sulfide into organic matter discovered at vents in 1977.",
      100, "easy", "Dark"),
    q("Numbers and Scale", "Form 3 (Sensory Clue)",
      "Boiling acidic and rich in minerals these underwater geysers reach 750 degrees Fahrenheit yet host giant tube worms 8 feet tall.",
      "Hydrothermal vents",
      ["Hot springs", "Hydrothermal vents", "Geysers", "Volcanic fumaroles"],
      "Sensory Logic",
      "Hydrothermal vents or black smokers superheat mineral rich water supporting unique ecosystems.",
      200, "easy", "Smokers"),
    q("The Oddity", "Form 9 (The Misdirection)",
      "It sounds like a superhero but this Yellowstone microbe discovered in 1966 revolutionized biology with its heat resistant enzyme Taq polymerase enabling PCR.",
      "Thermus aquaticus",
      ["Thermus aquaticus", "Deinococcus radiodurans", "Halobacterium salinarum", "Escherichia coli"],
      "Functional Logic",
      "Taq polymerase from Thermus aquaticus withstands PCR heat revolutionizing DNA amplification.",
      300, "medium", "Taq"),
    q("The Human Element", "Form 1 (Action First)",
      "Descending 36000 feet into the Mariana Trench in 1960 a US Navy lieutenant and Swiss explorer became the first humans to reach Challenger Deep.",
      "Don Walsh and Jacques Piccard",
      ["James Cameron and Don Walsh", "Don Walsh and Jacques Piccard", "Robert Ballard and Jacques Cousteau", "Victor Vescovo and Patrick Lahey"],
      "Sequence Pattern",
      "Walsh and Piccard reached Challenger Deep in the bathyscaphe Trieste in 1960.",
      400, "challenging", "Deepest"),
    q("The Legacy", "Form 7 (The Question Lead)",
      "What 1991 experiment sealed eight humans in a 3.15 acre ecosystem in Arizona to test closed ecological systems struggling with oxygen loss and food shortages",
      "Biosphere 2",
      ["Mars Desert Research Station", "Biosphere 2", "The Eden Project", "Palacio de Cristal"],
      "Everyday Link",
      "Biosphere 2 was a 200 million dollar experiment in closed system life support for space colonization.",
      500, "expert", "Bubble"),
  ]),
];

// ─────────────────────────────────────────────────────────────────────
// THEME 6: FOOD & DRINK
// ─────────────────────────────────────────────────────────────────────

const food: CategoryEntry[] = [
  cat("Culinary Origins", "Food and Drink", "The surprising stories behind foods we enjoy every day.", [
    q("Origin Story", "Form 5 (Direct Narrative)",
      "In 1853 a frustrated chef sliced potatoes paper thin fried them crisp and salted them to spite a customer who loved them creating this beloved snack.",
      "Potato chips",
      ["French fries", "Potato chips", "Tater tots", "Hash browns"],
      "Everyday Link",
      "Chef George Crum created Saratoga Chips at Moon Lake House in Saratoga Springs.",
      100, "easy", "Crisp"),
    q("The Cultural Impact", "Form 6 (The Contradiction)",
      "Despite being associated with San Francisco this Chinese American dish was invented in 1982 by chef Andy Kao in Hawaii at a Panda Express test kitchen.",
      "Orange chicken",
      ["General Tso chicken", "Orange chicken", "Sweet and sour pork", "Kung Pao chicken"],
      "Contrast Pop",
      "Orange chicken is Panda Express most popular dish invented in Hawaii in 1982.",
      200, "easy", "Orange"),
    q("The Rivalry", "Form 6 (The Contradiction)",
      "One cola was created by a veteran as a morphine treatment Coca Cola while this one created in 1898 by Caleb Bradham was originally called Brad Drink.",
      "Pepsi Cola",
      ["Dr Pepper", "Pepsi Cola", "Royal Crown Cola", "7 Up"],
      "Sequence Pattern",
      "Pepsi comes from dyspepsia indigestion reflecting its original marketing as a digestive aid.",
      300, "medium", "Cola"),
    q("The Connection", "Form 1 (Action First)",
      "Fermenting underground for decades this rare golden fungus the most expensive food at over 3000 dollars per pound is harvested by trained pigs or dogs.",
      "White truffle",
      ["Black truffle", "White truffle", "Saffron", "Beluga caviar"],
      "Sensory Logic",
      "Tuber magnatum from Piedmont Italy cannot be cultivated only grows wild with tree roots.",
      400, "challenging", "Gold"),
    q("The Legacy", "Form 7 (The Question Lead)",
      "What condiment developed in China over 2500 years ago and perfected in Japan by monks is made from soybeans wheat salt and koji mold aged in cedar barrels",
      "Soy sauce",
      ["Fish sauce", "Soy sauce", "Miso paste", "Tamari"],
      "Etymology Name Logic",
      "Shoyu in Japanese is one of the oldest condiments using koji Aspergillus oryzae for fermentation.",
      500, "expert", "Umami"),
  ]),

  cat("Coffee and Tea Culture", "Food and Drink", "The beverages that fuel the modern world.", [
    q("Origin Story", "Form 5 (Direct Narrative)",
      "According to legend around 850 CE an Ethiopian goat herder named Kaldi noticed his goats frolicking after eating red berries leading to the discovery of this beverage.",
      "Coffee",
      ["Coffee", "Tea", "Mate", "Coca tea"],
      "Everyday Link",
      "Kaldi the goat herder legend from the Kaffa region of Ethiopia where the word coffee may originate.",
      100, "easy", "Kaldi"),
    q("The Cultural Impact", "Form 2 (Parenthetical Hook)",
      "Unlike green tea which is pan fired this tea type accounting for 78 percent of Western consumption undergoes full oxidation giving dark color and bold flavor.",
      "Black tea",
      ["Black tea", "Oolong tea", "White tea", "Pu erh tea"],
      "Functional Logic",
      "Black tea is fully oxidized creating bold flavor. Earl Grey and Orange Pekoe are black teas.",
      200, "easy", "Dark"),
    q("Behind the Scenes", "Form 1 (Action First)",
      "Using a secret spray drying process this Swiss developed product introduced the first successful instant coffee in 1938 becoming a WWII staple.",
      "Nescafe",
      ["Nescafe", "Maxwell House", "Folgers", "Taster Choice"],
      "Sequence Pattern",
      "Nescafe invented by Nestle scientist Max Morgenthaler in 1938 supplied to US troops in WWII.",
      300, "medium", "Instant"),
    q("The Rivalry", "Form 6 (The Contradiction)",
      "The Boston Tea Party 1773 made one beverage an act of patriotism to reject while this dark brew became the proudly American alternative with the first coffeehouse in NYC in 1696.",
      "Coffee",
      ["Coffee", "Hot chocolate", "Mint tea", "Apple cider"],
      "Category Elimination",
      "Drinking coffee became a symbol of American independence after the Boston Tea Party.",
      400, "challenging", "Patriot"),
    q("The Connection", "Form 10 (Defining Trait)",
      "Hand picked and processed through the digestive tract of the Asian palm civet this Indonesian coffee at 600 dollars per pound has a uniquely smooth chocolatey flavor.",
      "Kopi Luwak",
      ["Blue Mountain coffee", "Kopi Luwak", "Hawaiian Kona coffee", "Panama Geisha coffee"],
      "Sensory Logic",
      "Civet coffee fermentation in the civet digestive tract breaks down proteins reducing bitterness.",
      500, "expert", "Civet"),
  ]),

  cat("Chocolate and Confectionery", "Food and Drink", "The sweet science behind the world favorite dessert.", [
    q("Origin Story", "Form 5 (Direct Narrative)",
      "The Aztecs believed this bitter foamy drink was a gift from Quetzalcoatl and used cocoa beans as currency a single bean could buy a tamale.",
      "Chocolate",
      ["Chocolate", "Vanilla", "Maguey", "Pulque"],
      "Etymology Name Logic",
      "The Aztec word xocolatl means bitter water served cold with chili and vanilla.",
      100, "easy", "Bitter"),
    q("Behind the Scenes", "Form 9 (The Misdirection)",
      "You might expect fruit or cream but this hollow chocolate egg contains a toy inside invented in Italy in 1974 and banned in the US for safety.",
      "Kinder Surprise",
      ["Ferrero Rocher", "Kinder Surprise", "Cadbury Creme Egg", "Lindt Lindor"],
      "Contrast Pop",
      "Kinder Surprise invented by Michele Ferrero in 1974 contains a toy banned in the US.",
      200, "easy", "Surprise"),
    q("The Human Element", "Form 4 (Active Quote)",
      "This Quaker businessman opened a tea shop in Birmingham 1824 eventually building the Bournville model factory village for his chocolate workers.",
      "John Cadbury",
      ["John Cadbury", "Milton Hershey", "Henri Nestle", "Rudolf Lindt"],
      "Category Elimination",
      "Cadbury built Bournville a model village for workers reflecting Quaker social responsibility.",
      300, "medium", "Quaker"),
    q("Numbers and Scale", "Form 2 (Parenthetical Hook)",
      "Unlike mass produced cacao this rare variety needing 10000 hand pollinated flowers per pound undergoes 25 day fermentation in Chuao Venezuela.",
      "Porcelana Criollo",
      ["Porcelana Criollo", "White chocolate", "Dark chocolate 70 percent", "Gianduja"],
      "Sensory Logic",
      "Porcelana is the rarest Criollo cacao from Chuao Venezuela with porcelain like color before roasting.",
      400, "challenging", "Rare"),
    q("The Legacy", "Form 8 (The Timeline)",
      "First developed in 1912 by a Belgian chocolatier to prevent soft centers from melting this hard sugar shell technique is found on M and Ms and Smarties.",
      "Hard sugar shell panning",
      ["Caramel filling", "Hard sugar shell panning", "Praline", "Ganache"],
      "Functional Logic",
      "Jean Neuhaus Jr invented the panning process in 1912 spraying sugar syrup in a rotating drum.",
      500, "expert", "Shell"),
  ]),
];

// ─── Assemble and Write ─────────────────────────────────────────────

const seedData: SeedData = {
  categories: [...science, ...history, ...arts, ...tech, ...nature, ...food],
};

const outputPath = join(__dirname, '..', 'seed_questions_generated.json');
writeFileSync(outputPath, JSON.stringify(seedData, null, 2), 'utf-8');

// Print summary
console.log('=== Seed Data Generated ===');
console.log(`File: ${outputPath}`);
console.log(`Categories: ${seedData.categories.length}`);
let totalQ = 0;
seedData.categories.forEach((c, i) => {
  totalQ += c.data.length;
  console.log(`  ${i + 1}. [${c.main_category}] ${c.name} — ${c.data.length} questions`);
});
console.log(`\nTotal questions: ${totalQ}`);
console.log(`\nTo import:`);
console.log(`  1. Copy contents of seed_questions_generated.json`);
console.log(`  2. Go to Admin Dashboard → JSON Import tab`);
console.log(`  3. Paste and click "Execute Import"`);
