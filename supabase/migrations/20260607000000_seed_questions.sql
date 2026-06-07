-- Seed questions for categories_library
-- Generated from seed_questions.json
-- Run in Supabase Dashboard (SQL Editor)
--

-- Quantum Mechanics (Science) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Quantum Mechanics') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Quantum Mechanics',
      'Science',
      'The bizarre world of quantum physics from superposition to entanglement.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"In 1925 this Austrian physicist developed wave mechanics by treating electrons as waves rather than particles earning him a Nobel Prize and reshaping atomic physics.","answer_text":"Erwin Schrödinger","options":["Werner Heisenberg","Erwin Schrödinger","Niels Bohr","Max Planck"],"backdoor_type":"Synonym Bridge","backdoor_explanation":"Schrödinger is most famously associated with the wave equation and the Schrödinger cat thought experiment.","points":100,"difficulty_tier":"easy","tag":"Wave"},{"lens":"The Oddity","form":"Form 2 (Parenthetical Hook)","question_text":"Unlike classical objects a subatomic particle can exist in multiple states at once a behavior formally known by this term beginning with S.","answer_text":"Superposition","options":["Entanglement","Superposition","Collapse","Decoherence"],"backdoor_type":"Contrast Pop","backdoor_explanation":"Superposition describes quantum systems existing in multiple states simultaneously until measured the foundation of Schrödinger cat.","points":200,"difficulty_tier":"easy","tag":"Duality"},{"lens":"The Connection","form":"Form 6 (The Contradiction)","question_text":"Despite being separated by miles two particles can instantaneously affect each other a phenomenon Einstein called spooky action at a distance.","answer_text":"Quantum entanglement","options":["Quantum superposition","Quantum entanglement","Wave function collapse","Quantum tunneling"],"backdoor_type":"Everyday Link","backdoor_explanation":"Entangled particles affect each other instantly across distance. Einstein spooky action at a distance quote is the classic description.","points":300,"difficulty_tier":"medium","tag":"Spooky"},{"lens":"The Human Element","form":"Form 4 (Active Quote)","question_text":"God does not play dice with the universe declared this iconic physicist who never accepted the Copenhagen interpretation of quantum mechanics.","answer_text":"Albert Einstein","options":["Niels Bohr","Albert Einstein","Richard Feynman","Max Born"],"backdoor_type":"Pop Culture Hook","backdoor_explanation":"The God does not play dice quote is one of Einstein most famous frequently referenced in popular culture.","points":400,"difficulty_tier":"challenging","tag":"Dice"},{"lens":"Numbers and Scale","form":"Form 8 (The Timeline)","question_text":"First theorized by Einstein and Rosen in 1935 then named by John Wheeler in 1967 these hypothetical shortcuts through spacetime are a sci-fi staple.","answer_text":"Wormholes","options":["Black holes","Wormholes","White holes","Cosmic strings"],"backdoor_type":"Sequence Pattern","backdoor_explanation":"Einstein Rosen bridges were theorized in 1935 and renamed wormholes by Wheeler in 1967.","points":500,"difficulty_tier":"expert","tag":"Shortcut"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Quantum Mechanics', 'Theme:Science'],
      true,
      v_uid
    );
  END IF;
END $$;

-- Genetics and DNA (Science) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Genetics and DNA') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Genetics and DNA',
      'Science',
      'The blueprint of life how DNA genes and heredity shape every living thing.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"In a now famous 1953 paper spanning barely one page two scientists proposed the double helix structure of DNA.","answer_text":"Watson and Crick","options":["Mendel and Morgan","Watson and Crick","Franklin and Wilkins","Darwin and Wallace"],"backdoor_type":"Synonym Bridge","backdoor_explanation":"The double helix is the iconic structure of DNA proposed in 1953 by Watson and Crick.","points":100,"difficulty_tier":"easy","tag":"Helix"},{"lens":"Behind the Scenes","form":"Form 2 (Parenthetical Hook)","question_text":"Though Watson and Crick received the credit this British scientist X-ray image called Photograph 51 provided critical evidence for DNA helical structure.","answer_text":"Rosalind Franklin","options":["Lise Meitner","Rosalind Franklin","Barbara McClintock","Marie Curie"],"backdoor_type":"Category Elimination","backdoor_explanation":"Only Rosalind Franklin is associated with Photograph 51 and X-ray work on DNA.","points":200,"difficulty_tier":"easy","tag":"Photo 51"},{"lens":"The Unexpected","form":"Form 9 (The Misdirection)","question_text":"You might think your DNA is 100 percent human but 8 percent of the genome consists of ancient viral DNA permanently integrated millions of years ago.","answer_text":"Endogenous retroviruses","options":["Transposons","Endogenous retroviruses","Pseudogenes","Introns"],"backdoor_type":"Functional Logic","backdoor_explanation":"Endogenous means originating from within retroviruses insert DNA into host genomes. ERVs are fossilized viral DNA.","points":300,"difficulty_tier":"medium","tag":"Fossil"},{"lens":"The Legacy","form":"Form 8 (The Timeline)","question_text":"Completed in 2003 after 13 years of collaboration costing 3 billion dollars this project mapped every base pair of the human genome.","answer_text":"Human Genome Project","options":["GenBank Initiative","Human Genome Project","ENCODE Project","1000 Genomes Project"],"backdoor_type":"Everyday Link","backdoor_explanation":"The Human Genome Project was completed in 2003 comparable to Apollo for biology.","points":400,"difficulty_tier":"challenging","tag":"Blueprint"},{"lens":"What If","form":"Form 7 (The Question Lead)","question_text":"What revolutionary technology first developed in 2012 by Doudna and Charpentier allows scientists to edit genes with precision described as molecular scissors for DNA","answer_text":"CRISPR-Cas9","options":["Zinc finger nucleases","TALENs","CRISPR-Cas9","RNA interference"],"backdoor_type":"Sequence Pattern","backdoor_explanation":"Doudna and Charpentier won the 2020 Nobel Prize for CRISPR-Cas9 gene editing.","points":500,"difficulty_tier":"expert","tag":"Scissors"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Genetics and DNA', 'Theme:Science'],
      true,
      v_uid
    );
  END IF;
END $$;

-- Space Exploration (Science) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Space Exploration') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Space Exploration',
      'Science',
      'Humanity journey beyond our atmosphere from the first satellites to interplanetary missions.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"On October 4 1957 the world was stunned as a beach ball sized metal sphere became the first human made object to orbit Earth.","answer_text":"Sputnik 1","options":["Explorer 1","Sputnik 1","Vanguard 1","Telstar 1"],"backdoor_type":"Everyday Link","backdoor_explanation":"Sputnik 1 launched in 1957 sparked the space race and its date is one of the most famous in history.","points":100,"difficulty_tier":"easy","tag":"Beep"},{"lens":"The Human Element","form":"Form 4 (Active Quote)","question_text":"That one small step for man one giant leap for mankind uttered by this Apollo 11 commander as he first set foot on the lunar surface in 1969.","answer_text":"Neil Armstrong","options":["Buzz Aldrin","Neil Armstrong","Michael Collins","John Glenn"],"backdoor_type":"Pop Culture Hook","backdoor_explanation":"Arguably the most famous quote in human history universally associated with Neil Armstrong and Apollo 11.","points":100,"difficulty_tier":"easy","tag":"Step"},{"lens":"Numbers and Scale","form":"Form 3 (Sensory Clue)","question_text":"Vibrant rust colored dust covers this planet surface where a car sized robot has explored since 2012 traveling over 30 kilometers.","answer_text":"Mars Curiosity rover","options":["Venus Venera probe","Mars Curiosity rover","Jupiter Juno orbiter","Saturn Cassini probe"],"backdoor_type":"Sensory Logic","backdoor_explanation":"The rust colored dust points to Mars the Red Planet. Curiosity rover has been exploring since 2012.","points":300,"difficulty_tier":"medium","tag":"Rust"},{"lens":"The Rivalry","form":"Form 6 (The Contradiction)","question_text":"Despite vastly different budgets NASA and this private company compete to return humans to the Moon with Artemis and Starship respectively.","answer_text":"SpaceX","options":["Blue Origin","SpaceX","Virgin Galactic","Rocket Lab"],"backdoor_type":"Category Elimination","backdoor_explanation":"SpaceX Starship is explicitly designed for lunar missions competing with NASA Artemis.","points":400,"difficulty_tier":"challenging","tag":"Moon race"},{"lens":"The Legacy","form":"Form 8 (The Timeline)","question_text":"Launched in 1977 this spacecraft became the first human made object to enter interstellar space in 2012 carrying a golden record of Earth sounds and images.","answer_text":"Voyager 1","options":["Pioneer 10","Voyager 1","New Horizons","Cassini"],"backdoor_type":"Synonym Bridge","backdoor_explanation":"The golden record is the iconic calling card of Voyager spacecraft launched in 1977.","points":500,"difficulty_tier":"expert","tag":"Golden"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Space Exploration', 'Theme:Science'],
      true,
      v_uid
    );
  END IF;
END $$;

-- Evolution and Natural Selection (Science) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Evolution and Natural Selection') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Evolution and Natural Selection',
      'Science',
      'How species adapt change and diversify over millions of years.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"After a five year voyage aboard HMS Beagle this English naturalist published On the Origin of Species in 1859 proposing natural selection.","answer_text":"Charles Darwin","options":["Alfred Russel Wallace","Charles Darwin","Jean Baptiste Lamarck","Gregor Mendel"],"backdoor_type":"Synonym Bridge","backdoor_explanation":"HMS Beagle voyage On the Origin of Species and natural selection all point to Darwin.","points":100,"difficulty_tier":"easy","tag":"Origin"},{"lens":"The Oddity","form":"Form 3 (Sensory Clue)","question_text":"This peacock sized flightless bird from a remote Indian Ocean island went extinct in the late 1600s when humans arrived with dogs rats and pigs.","answer_text":"Dodo","options":["Moa","Dodo","Great auk","Passenger pigeon"],"backdoor_type":"Everyday Link","backdoor_explanation":"The Dodo from Mauritius went extinct in the late 1600s. Dead as a dodo keeps its memory alive.","points":200,"difficulty_tier":"easy","tag":"Dodo"},{"lens":"The Unexpected","form":"Form 9 (The Misdirection)","question_text":"You might think we need fossils to see evolution but the famous long term experiment started in 1988 watches this simple organism evolve across 70 thousand generations in flasks.","answer_text":"E. coli","options":["E. coli","Yeast","Fruit flies","Zebrafish"],"backdoor_type":"Functional Logic","backdoor_explanation":"Richard Lenski long term evolution experiment at Michigan State tracks E. coli evolving across 70k generations.","points":300,"difficulty_tier":"medium","tag":"Flask"},{"lens":"The Rivalry","form":"Form 6 (The Contradiction)","question_text":"Despite independently conceiving natural selection alongside Darwin and sending an essay that spurred publication this explorer naturalist is far less remembered.","answer_text":"Alfred Russel Wallace","options":["Thomas Henry Huxley","Alfred Russel Wallace","Joseph Dalton Hooker","Charles Lyell"],"backdoor_type":"Category Elimination","backdoor_explanation":"Only Wallace independently conceived natural selection and sent Darwin the essay that prompted publication.","points":400,"difficulty_tier":"challenging","tag":"Forgotten"},{"lens":"The Legacy","form":"Form 7 (The Question Lead)","question_text":"What revolutionary idea that all species share a common ancestor and branch from a single tree became the unifying framework of modern biology confirmed by DNA","answer_text":"Common descent","options":["Punctuated equilibrium","Common descent","Genetic drift","Niche construction"],"backdoor_type":"Etymology Name Logic","backdoor_explanation":"The Tree of Life concept confirmed by DNA sequencing that reveals our kinship with fungi and plants.","points":500,"difficulty_tier":"expert","tag":"Tree"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Evolution and Natural Selection', 'Theme:Science'],
      true,
      v_uid
    );
  END IF;
END $$;

-- The Periodic Table (Science) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'The Periodic Table') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'The Periodic Table',
      'Science',
      'The chemist map of the elements their discovery properties and patterns.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"While organizing his chemistry textbook this Russian scientist dreamt of a table where elements arranged themselves waking to write the first periodic table in 1869.","answer_text":"Dmitri Mendeleev","options":["Dmitri Mendeleev","John Dalton","Antoine Lavoisier","Henry Moseley"],"backdoor_type":"Everyday Link","backdoor_explanation":"Mendeleev dreamt the periodic table in 1869 and famously predicted undiscovered elements.","points":100,"difficulty_tier":"easy","tag":"Dream"},{"lens":"The Oddity","form":"Form 9 (The Misdirection)","question_text":"It sounds like it should be a heavy metal but this element is a gas at room temperature its name comes from Greek for stranger.","answer_text":"Xenon","options":["Argon","Krypton","Xenon","Radon"],"backdoor_type":"Etymology Name Logic","backdoor_explanation":"Xenon comes from Greek xenos meaning stranger. Krypton means hidden Argon means lazy.","points":200,"difficulty_tier":"easy","tag":"Strange"},{"lens":"The Human Element","form":"Form 1 (Action First)","question_text":"Defying sexist barriers this Polish born physicist discovered polonium and radium becoming the first person to win two Nobel Prizes.","answer_text":"Marie Curie","options":["Lise Meitner","Marie Curie","Irene Joliot Curie","Dorothy Hodgkin"],"backdoor_type":"Synonym Bridge","backdoor_explanation":"Polish born discovered polonium and radium first person to win two Nobel Prizes all point to Marie Curie.","points":300,"difficulty_tier":"medium","tag":"Twice"},{"lens":"Numbers and Scale","form":"Form 3 (Sensory Clue)","question_text":"Dense bluish gray and used in Egyptian kohl this heavy metal was added to paint pipes and gasoline before we discovered it was poisoning civilizations.","answer_text":"Lead","options":["Mercury","Lead","Cadmium","Arsenic"],"backdoor_type":"Sensory Logic","backdoor_explanation":"Lead was used in Egyptian kohl paint plumbing the word comes from Latin plumbum and gasoline.","points":400,"difficulty_tier":"challenging","tag":"Poison"},{"lens":"The Connection","form":"Form 10 (Defining Trait)","question_text":"Silvery white and the heaviest element observable in quantity this element 83 is used in fire extinguishers and bismuth subsalicylate the pink stomach medicine.","answer_text":"Bismuth","options":["Antimony","Bismuth","Polonium","Lead"],"backdoor_type":"Everyday Link","backdoor_explanation":"Pepto Bismol contains bismuth subsalicylate. Bismuth element 83 is the heaviest stable element.","points":500,"difficulty_tier":"expert","tag":"Pink"}]'::jsonb::jsonb,
      ARRAY['Grid', 'The Periodic Table', 'Theme:Science'],
      true,
      v_uid
    );
  END IF;
END $$;

-- Ancient Civilizations (History) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Ancient Civilizations') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Ancient Civilizations',
      'History',
      'The great empires and cultures of the ancient world.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"Flowing through modern-day Iraq, the land between the Tigris and Euphrates rivers gave birth to the first cities, writing system cuneiform, and legal code — a civilization known by this Greek name meaning between rivers.","answer_text":"Mesopotamia","options":["Mesopotamia","Sumer","Babylon","Assyria"],"backdoor_type":"Etymology / Name Logic","backdoor_explanation":"Meso means middle and potamia means rivers. The Tigris and Euphrates are in modern Iraq, the cradle of civilization.","points":100,"difficulty_tier":"easy","tag":"Cradle"},{"lens":"The Unexpected","form":"Form 6 (The Contradiction)","question_text":"Though most famous for its massive wall, this ancient civilization also invented paper, the compass, gunpowder, and printing — four technologies that transformed the world.","answer_text":"China","options":["India","China","Persia","Rome"],"backdoor_type":"Contrast Pop","backdoor_explanation":"The Four Great Inventions of ancient China are paper, compass, gunpowder, and printing.","points":200,"difficulty_tier":"easy","tag":"Wall"},{"lens":"The Rivalry","form":"Form 2 (Parenthetical Hook)","question_text":"Unlike Athens which gave us philosophy and democracy, this rival Greek city-state produced no lasting philosophers — its entire legacy is military discipline and the heroic stand at Thermopylae.","answer_text":"Sparta","options":["Corinth","Sparta","Thebes","Macedon"],"backdoor_type":"Synonym Bridge","backdoor_explanation":"The warrior society known for military discipline and Thermopylae. Sparta studied everything through the lens of war.","points":300,"difficulty_tier":"medium","tag":"Warriors"},{"lens":"Behind the Scenes","form":"Form 8 (The Timeline)","question_text":"Created around 1754 BCE, this black stone stele features 282 laws inscribed in Akkadian cuneiform including the principle of an eye for an eye, discovered in 1901 in what is now Iran.","answer_text":"Code of Hammurabi","options":["Code of Ur-Nammu","Code of Hammurabi","Justinian Code","Twelve Tables"],"backdoor_type":"Sequence Pattern","backdoor_explanation":"1754 BCE, 282 laws, an eye for an eye, discovered in 1901. The Code of Hammurabi is the most famous legal code of the ancient world.","points":400,"difficulty_tier":"challenging","tag":"Laws"},{"lens":"The Human Element","form":"Form 4 (Active Quote)","question_text":"\"I am the king of kings who built a library to hold all the knowledge of the world,\" this Assyrian ruler declared before collecting over 30,000 clay tablets.","answer_text":"Ashurbanipal","options":["Sargon of Akkad","Ashurbanipal","Nebuchadnezzar II","Cyrus the Great"],"backdoor_type":"Category Elimination","backdoor_explanation":"Only Ashurbanipal is famous for his library at Nineveh containing the Epic of Gilgamesh. Nebuchadnezzar is Babylonian, Sargon is Akkadian.","points":500,"difficulty_tier":"expert","tag":"Library"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Ancient Civilizations', 'Theme:History'],
      true,
      v_uid
    );
  END IF;
END $$;

-- World War II (History) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'World War II') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'World War II',
      'History',
      'The deadliest conflict in history 1939-1945 that reshaped the global order.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"On September 1, 1939, this European nation became the target of the first major campaign of World War II when German battleships opened fire on Westerplatte, triggering a six-year global conflict.","answer_text":"Poland","options":["Poland","France","Czechoslovakia","Belgium"],"backdoor_type":"Everyday Link","backdoor_explanation":"Germany invasion of Poland on September 1, 1939 is universally recognized as the start of World War II.","points":100,"difficulty_tier":"easy","tag":"Invasion"},{"lens":"The Human Element","form":"Form 4 (Active Quote)","question_text":"\"I have nothing to offer but blood, toil, tears, and sweat,\" declared this British prime minister in 1940, whose defiant speeches during the Blitz rallied a nation standing alone against Nazi Germany.","answer_text":"Winston Churchill","options":["Winston Churchill","Franklin D. Roosevelt","Charles de Gaulle","Clement Attlee"],"backdoor_type":"Pop Culture Hook","backdoor_explanation":"Churchill most famous speech delivered to the House of Commons on May 13, 1940. His cigar, V-sign, and Blitz speeches are cultural icons.","points":100,"difficulty_tier":"easy","tag":"Defiance"},{"lens":"The Unexpected","form":"Form 9 (The Misdirection)","question_text":"It sounds like it would be the most bombed city of WWII, but the title of tonnage dropped belongs to this industrial German city, home to Krupp Industries, hit by over 600,000 bombs.","answer_text":"Essen","options":["Hamburg","Essen","Dresden","Cologne"],"backdoor_type":"Contrast Pop","backdoor_explanation":"Essen was home to Krupp Industries, Germany largest weapons manufacturer, making it the primary target of Allied strategic bombing.","points":300,"difficulty_tier":"medium","tag":"Bombed"},{"lens":"Behind the Scenes","form":"Form 2 (Parenthetical Hook)","question_text":"Though Enigma code-breaking is credited to Turing at Bletchley Park, the first breakthroughs into German Enigma were achieved years earlier by this nation cryptologic bureau working since 1932.","answer_text":"Poland","options":["France","Poland","Soviet Union","Netherlands"],"backdoor_type":"Sequence Pattern","backdoor_explanation":"Polish Cipher Bureau led by Rejewski, Zygalski, and Różycki first broke Enigma and gave their knowledge to the British in 1939.","points":400,"difficulty_tier":"challenging","tag":"Enigma"},{"lens":"The Legacy","form":"Form 8 (The Timeline)","question_text":"On June 6, 1944, the largest amphibious invasion in history saw 156,000 Allied troops storm five beaches codenamed Utah, Omaha, Gold, Juno, and this final one.","answer_text":"Sword Beach","options":["Juno Beach","Sword Beach","Omaha Beach","Gold Beach"],"backdoor_type":"Sequence Pattern","backdoor_explanation":"The five D-Day beaches from west to east: Utah, Omaha, Gold, Juno, and Sword. Sword was the easternmost beach assigned to British forces.","points":500,"difficulty_tier":"expert","tag":"D-Day"}]'::jsonb::jsonb,
      ARRAY['Grid', 'World War II', 'Theme:History'],
      true,
      v_uid
    );
  END IF;
END $$;

-- Renaissance Masters (Arts & Culture) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Renaissance Masters') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Renaissance Masters',
      'Arts & Culture',
      'The brilliant artists and thinkers of the European Renaissance.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"Painting the Sistine Chapel ceiling between 1508 and 1512, this sculptor, painter, and architect created one of the most recognizable images in human history despite preferring sculpture over painting.","answer_text":"Michelangelo","options":["Leonardo da Vinci","Michelangelo","Raphael","Donatello"],"backdoor_type":"Pop Culture Hook","backdoor_explanation":"The Sistine Chapel ceiling is one of the most famous artworks. Michelangelo preference for sculpture is legendary.","points":100,"difficulty_tier":"easy","tag":"Sistine"},{"lens":"Behind the Scenes","form":"Form 2 (Parenthetical Hook)","question_text":"Unlike his rival Michelangelo muscular idealized figures, this Florentine painter depicted the Virgin Mary with a remarkably human relatable expression — his Madonnas feel like real mothers.","answer_text":"Raphael","options":["Botticelli","Raphael","Titian","Caravaggio"],"backdoor_type":"Contrast Pop","backdoor_explanation":"Raphael Madonnas are known for their gentle human quality. The Uffizi Gallery in Florence houses many of them.","points":200,"difficulty_tier":"easy","tag":"Madonna"},{"lens":"The Human Element","form":"Form 4 (Active Quote)","question_text":"\"The human foot is a masterpiece of engineering,\" this Renaissance polymath wrote in his notebooks, reflecting his belief that art and science were inseparable, with anatomical sketches centuries ahead of their time.","answer_text":"Leonardo da Vinci","options":["Leonardo da Vinci","Albrecht Dürer","Andreas Vesalius","Giorgio Vasari"],"backdoor_type":"Synonym Bridge","backdoor_explanation":"Renaissance polymath who filled notebooks with anatomical sketches from human dissections. His Vitruvian Man is the iconic fusion of art and science.","points":300,"difficulty_tier":"medium","tag":"Sketch"},{"lens":"The Oddity","form":"Form 9 (The Misdirection)","question_text":"Despite sharing a name with a teenage mutant ninja turtle, this Venetian artist pioneered the use of color over line drawing and painted the monumental Assumption of the Virgin in the Frari church.","answer_text":"Titian","options":["Giorgione","Titian","Tintoretto","Veronese"],"backdoor_type":"Pop Culture Hook","backdoor_explanation":"The Teenage Mutant Ninja Turtles are named Donatello, Michelangelo, Raphael, Leonardo but Titian is NOT one of them.","points":400,"difficulty_tier":"challenging","tag":"Color"},{"lens":"The Legacy","form":"Form 7 (The Question Lead)","question_text":"What city ruled by the Medici family became the birthplace of the Renaissance, often called the Athens of the Middle Ages for its concentration of creative genius?","answer_text":"Florence","options":["Venice","Florence","Rome","Milan"],"backdoor_type":"Etymology / Name Logic","backdoor_explanation":"The Medici family, birthplace of the Renaissance, originally Florentia meaning flourishing, perfectly capturing its role as the cradle of the Renaissance.","points":500,"difficulty_tier":"expert","tag":"Birthplace"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Renaissance Masters', 'Theme:Arts & Culture'],
      true,
      v_uid
    );
  END IF;
END $$;

-- The Internet Revolution (Technology) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'The Internet Revolution') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'The Internet Revolution',
      'Technology',
      'From vacuum tubes to the World Wide Web.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"In 1969, the first message was sent over this U.S. Department of Defense network between UCLA and Stanford — the system crashed after transmitting just two letters of the word LOGIN.","answer_text":"ARPANET","options":["NSFNET","ARPANET","MILNET","CERN"],"backdoor_type":"Everyday Link","backdoor_explanation":"1969, DOD network, UCLA to Stanford, the crashed LOGIN message. This is the birth story of ARPANET, the precursor to the internet.","points":100,"difficulty_tier":"easy","tag":"Login"},{"lens":"The Human Element","form":"Form 4 (Active Quote)","question_text":"While working at CERN in 1989, this British computer scientist proposed an information management system giving us URLs, HTTP, and HTML, famously not patenting his invention.","answer_text":"Tim Berners-Lee","options":["Vint Cerf","Tim Berners-Lee","Robert Cailliau","Marc Andreessen"],"backdoor_type":"Synonym Bridge","backdoor_explanation":"CERN, 1989, URLs, HTTP, HTML, first browser and server, kept the web free for everyone.","points":200,"difficulty_tier":"easy","tag":"Web"},{"lens":"Behind the Scenes","form":"Form 9 (The Misdirection)","question_text":"It sounds like a movie rating system but this pair of protocols created by Cerf and Kahn in 1974 is the fundamental communication standard that routes data packets across networks.","answer_text":"TCP/IP","options":["SMTP","TCP/IP","DNS","FTP"],"backdoor_type":"Functional Logic","backdoor_explanation":"Vint Cerf and Bob Kahn designed TCP/IP in 1974. TCP and IP are the fundamental communication protocols of the internet.","points":300,"difficulty_tier":"medium","tag":"Packets"},{"lens":"Numbers & Scale","form":"Form 3 (Sensory Clue)","question_text":"Born in a Harvard dorm room and originally called TheFacebook, this blue-and-white platform connects nearly 3 billion monthly active users, portrayed in the Oscar-winning film The Social Network.","answer_text":"Facebook","options":["Twitter","Facebook","YouTube","Instagram"],"backdoor_type":"Pop Culture Hook","backdoor_explanation":"Harvard dorm room, originally TheFacebook, film The Social Network, founded by Mark Zuckerberg.","points":400,"difficulty_tier":"challenging","tag":"Network"},{"lens":"The Legacy","form":"Form 7 (The Question Lead)","question_text":"What company founded in 1998 by two Stanford PhD students took its name from the mathematical term for 1 followed by 100 zeros, reflecting its mission to organize the infinite web?","answer_text":"Google","options":["Yahoo","Google","AltaVista","Bing"],"backdoor_type":"Etymology / Name Logic","backdoor_explanation":"Googol is 10^100. Larry Page and Sergey Brin intended to name it Googol but a friend wrote the check to Google Inc.","points":500,"difficulty_tier":"expert","tag":"Search"}]'::jsonb::jsonb,
      ARRAY['Grid', 'The Internet Revolution', 'Theme:Technology'],
      true,
      v_uid
    );
  END IF;
END $$;

-- Artificial Intelligence (Technology) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Artificial Intelligence') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Artificial Intelligence',
      'Technology',
      'The quest to create machines that can think, learn, and reason.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"In 1950, this Cambridge mathematician proposed an imitation game to test machine intelligence, now considered the father of AI and theoretical computer science.","answer_text":"Alan Turing","options":["Alan Turing","John McCarthy","Marvin Minsky","Norbert Wiener"],"backdoor_type":"Pop Culture Hook","backdoor_explanation":"The imitation game is the Turing Test, featured in the film The Imitation Game 2014 starring Benedict Cumberbatch.","points":100,"difficulty_tier":"easy","tag":"Imitation"},{"lens":"The Unexpected","form":"Form 2 (Parenthetical Hook)","question_text":"Unlike chess where computers beat humans in 1997, this ancient board game with more positions than atoms in the universe was considered impossible for AI until DeepMind AlphaGo won in 2016.","answer_text":"Go","options":["Go","Chess","Shogi","Othello"],"backdoor_type":"Contrast Pop","backdoor_explanation":"More positions than atoms in the universe is a famous property of Go. AlphaGo beat Lee Sedol in a landmark 2016 match.","points":200,"difficulty_tier":"easy","tag":"AlphaGo"},{"lens":"The Human Element","form":"Form 4 (Active Quote)","question_text":"This roboticist lab at Boston Dynamics created robots like BigDog and Atlas that can run jump and backflip like living creatures.","answer_text":"Marc Raibert","options":["Marc Raibert","Hod Lipson","Hiroshi Ishiguro","Daniela Rus"],"backdoor_type":"Synonym Bridge","backdoor_explanation":"Boston Dynamics, BigDog, Atlas, backflipping humanoid robots in viral videos.","points":300,"difficulty_tier":"medium","tag":"Robots"},{"lens":"The Connection","form":"Form 6 (The Contradiction)","question_text":"Though it powers everything from facial recognition to language translation, this mathematical architecture loosely inspired by the brain was dismissed as fringe for 50 years before dominating AI.","answer_text":"Neural networks (deep learning)","options":["Genetic algorithms","Neural networks (deep learning)","Bayesian inference","Symbolic AI"],"backdoor_type":"Functional Logic","backdoor_explanation":"The artificial neuron concept dates to the 1940s but deep learning exploded in the 2010s with GPUs and big data.","points":400,"difficulty_tier":"challenging","tag":"Brain"},{"lens":"What If?","form":"Form 7 (The Question Lead)","question_text":"What 1956 Dartmouth College workshop with McCarthy, Minsky, and Shannon gave this field its name and set research agendas for the next 70 years of computer science?","answer_text":"Dartmouth Conference","options":["MIT AI Lab founding","Dartmouth Conference","Cybernetics Symposium","DARPA Grand Challenge"],"backdoor_type":"Sequence Pattern","backdoor_explanation":"1956 Dartmouth Summer Research Project on AI is the founding event. John McCarthy coined the term Artificial Intelligence.","points":500,"difficulty_tier":"expert","tag":"Birth"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Artificial Intelligence', 'Theme:Technology'],
      true,
      v_uid
    );
  END IF;
END $$;

-- Ocean Life (Nature and Wildlife) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Ocean Life') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Ocean Life',
      'Nature and Wildlife',
      'The mysterious world beneath the waves.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"Covering over 70 percent of Earth surface and producing more than half its oxygen this vast body of salt water gave rise to all life 3.5 billion years ago.","answer_text":"The ocean","options":["The ocean","The atmosphere","The Great Lakes","Underground aquifers"],"backdoor_type":"Everyday Link","backdoor_explanation":"Every second breath comes from the ocean phytoplankton produces most of our oxygen.","points":100,"difficulty_tier":"easy","tag":"Blue"},{"lens":"The Oddity","form":"Form 3 (Sensory Clue)","question_text":"Translucent and only 4.5 millimeters across this tiny jellyfish can reverse its life cycle when injured transforming its cells back to their earliest form.","answer_text":"Immortal jellyfish","options":["Immortal jellyfish","Lion mane jellyfish","Box jellyfish","Portuguese man o war"],"backdoor_type":"Functional Logic","backdoor_explanation":"Turritopsis dohrnii the immortal jellyfish reverts to its polyp stage through transdifferentiation.","points":200,"difficulty_tier":"easy","tag":"Immortal"},{"lens":"Numbers and Scale","form":"Form 2 (Parenthetical Hook)","question_text":"Unlike extinct dinosaurs this ocean giant weighing 200 tons and stretching 100 feet is the largest animal to have ever lived on Earth.","answer_text":"Blue whale","options":["Blue whale","Fin whale","Humpback whale","Sperm whale"],"backdoor_type":"Contrast Pop","backdoor_explanation":"Blue whale at 200 tons is larger than any dinosaur. Its heart is the size of a small car.","points":300,"difficulty_tier":"medium","tag":"Giant"},{"lens":"Behind the Scenes","form":"Form 1 (Action First)","question_text":"Living at 3000 feet depth this bioluminescent predator uses a lure dangling from its forehead to attract prey in total darkness.","answer_text":"Anglerfish","options":["Viperfish","Anglerfish","Lanternfish","Dragonfish"],"backdoor_type":"Synonym Bridge","backdoor_explanation":"The anglerfish glowing esca is a modified dorsal fin ray with bioluminescent bacteria.","points":400,"difficulty_tier":"challenging","tag":"Lure"},{"lens":"The Connection","form":"Form 10 (Defining Trait)","question_text":"Colorful stationary built from colonies of polyps these living cities cover less than one percent of the ocean floor yet host 25 percent of all marine species.","answer_text":"Coral reefs","options":["Kelp forests","Coral reefs","Mangrove swamps","Seagrass meadows"],"backdoor_type":"Category Elimination","backdoor_explanation":"Coral reefs are the rainforests of the sea the most biodiverse ocean ecosystems.","points":500,"difficulty_tier":"expert","tag":"Reef"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Ocean Life', 'Theme:Nature and Wildlife'],
      true,
      v_uid
    );
  END IF;
END $$;

-- Animal Kingdom Records (Nature and Wildlife) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Animal Kingdom Records') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Animal Kingdom Records',
      'Nature and Wildlife',
      'The fastest toughest and most extreme survivors.',
      '[{"lens":"Numbers and Scale","form":"Form 2 (Parenthetical Hook)","question_text":"Unlike cheetahs that sprint on land this streamlined hunter holds the title of fastest animal reaching 240 miles per hour during its hunting dive.","answer_text":"Peregrine falcon","options":["Peregrine falcon","Golden eagle","Spine tailed swift","Frigatebird"],"backdoor_type":"Contrast Pop","backdoor_explanation":"The peregrine falcon stoop dive exceeds 240 mph making it the fastest animal on Earth.","points":100,"difficulty_tier":"easy","tag":"Dive"},{"lens":"The Oddity","form":"Form 9 (The Misdirection)","question_text":"It sounds like sci-fi but this microscopic animal barely 1 millimeter long survives space vacuum radiation and decades without water by entering cryptobiosis.","answer_text":"Tardigrade","options":["Nematode","Tardigrade","Rotifer","Bdelloid rotifer"],"backdoor_type":"Pop Culture Hook","backdoor_explanation":"Tardigrades also called water bears are internet famous for their near indestructibility.","points":200,"difficulty_tier":"easy","tag":"Water bear"},{"lens":"The Unexpected","form":"Form 2 (Parenthetical Hook)","question_text":"Though it lives in the ocean and looks like a plant this creature has no brain no heart and no blood yet some species live over 10 thousand years.","answer_text":"Sponge","options":["Sea anemone","Sponge","Coral","Jellyfish"],"backdoor_type":"Functional Logic","backdoor_explanation":"Sponges Porifera are the simplest multicellular animals filter feeders that live for millennia.","points":300,"difficulty_tier":"medium","tag":"Simple"},{"lens":"The Human Element","form":"Form 4 (Active Quote)","question_text":"This British primatologist spent decades living with mountain gorillas in Rwanda protecting them from poachers and changing how we view our closest relatives.","answer_text":"Dian Fossey","options":["Dian Fossey","Jane Goodall","Birute Galdikas","Louis Leakey"],"backdoor_type":"Category Elimination","backdoor_explanation":"Fossey studied gorillas in Rwanda portrayed by Sigourney Weaver in Gorillas in the Mist.","points":400,"difficulty_tier":"challenging","tag":"Gorilla"},{"lens":"The Legacy","form":"Form 7 (The Question Lead)","question_text":"What 1973 US law has saved over 2000 species from extinction including the bald eagle gray wolf and American alligator by protecting habitats","answer_text":"Endangered Species Act","options":["Marine Mammal Protection Act","Endangered Species Act","Lacey Act","CITES"],"backdoor_type":"Sequence Pattern","backdoor_explanation":"The US Endangered Species Act of 1973 saved the bald eagle from near extinction delisted in 2007.","points":500,"difficulty_tier":"expert","tag":"Saved"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Animal Kingdom Records', 'Theme:Nature and Wildlife'],
      true,
      v_uid
    );
  END IF;
END $$;

-- Extreme Environments (Nature and Wildlife) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Extreme Environments') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Extreme Environments',
      'Nature and Wildlife',
      'Life that thrives where nothing should survive.',
      '[{"lens":"The Unexpected","form":"Form 2 (Parenthetical Hook)","question_text":"Unlike most life needing sunlight deep sea ecosystems are powered by this process where bacteria use hydrogen sulfide from hydrothermal vents.","answer_text":"Chemosynthesis","options":["Chemosynthesis","Radiosynthesis","Thermosynthesis","Fermentation"],"backdoor_type":"Contrast Pop","backdoor_explanation":"Chemosynthesis converts chemical energy from hydrogen sulfide into organic matter discovered at vents in 1977.","points":100,"difficulty_tier":"easy","tag":"Dark"},{"lens":"Numbers and Scale","form":"Form 3 (Sensory Clue)","question_text":"Boiling acidic and rich in minerals these underwater geysers reach 750 degrees Fahrenheit yet host giant tube worms 8 feet tall.","answer_text":"Hydrothermal vents","options":["Hot springs","Hydrothermal vents","Geysers","Volcanic fumaroles"],"backdoor_type":"Sensory Logic","backdoor_explanation":"Hydrothermal vents or black smokers superheat mineral rich water supporting unique ecosystems.","points":200,"difficulty_tier":"easy","tag":"Smokers"},{"lens":"The Oddity","form":"Form 9 (The Misdirection)","question_text":"It sounds like a superhero but this Yellowstone microbe discovered in 1966 revolutionized biology with its heat resistant enzyme Taq polymerase enabling PCR.","answer_text":"Thermus aquaticus","options":["Thermus aquaticus","Deinococcus radiodurans","Halobacterium salinarum","Escherichia coli"],"backdoor_type":"Functional Logic","backdoor_explanation":"Taq polymerase from Thermus aquaticus withstands PCR heat revolutionizing DNA amplification.","points":300,"difficulty_tier":"medium","tag":"Taq"},{"lens":"The Human Element","form":"Form 1 (Action First)","question_text":"Descending 36000 feet into the Mariana Trench in 1960 a US Navy lieutenant and Swiss explorer became the first humans to reach Challenger Deep.","answer_text":"Don Walsh and Jacques Piccard","options":["James Cameron and Don Walsh","Don Walsh and Jacques Piccard","Robert Ballard and Jacques Cousteau","Victor Vescovo and Patrick Lahey"],"backdoor_type":"Sequence Pattern","backdoor_explanation":"Walsh and Piccard reached Challenger Deep in the bathyscaphe Trieste in 1960.","points":400,"difficulty_tier":"challenging","tag":"Deepest"},{"lens":"The Legacy","form":"Form 7 (The Question Lead)","question_text":"What 1991 experiment sealed eight humans in a 3.15 acre ecosystem in Arizona to test closed ecological systems struggling with oxygen loss and food shortages","answer_text":"Biosphere 2","options":["Mars Desert Research Station","Biosphere 2","The Eden Project","Palacio de Cristal"],"backdoor_type":"Everyday Link","backdoor_explanation":"Biosphere 2 was a 200 million dollar experiment in closed system life support for space colonization.","points":500,"difficulty_tier":"expert","tag":"Bubble"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Extreme Environments', 'Theme:Nature and Wildlife'],
      true,
      v_uid
    );
  END IF;
END $$;

-- Culinary Origins (Food and Drink) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Culinary Origins') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Culinary Origins',
      'Food and Drink',
      'The surprising stories behind foods we enjoy every day.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"In 1853 a frustrated chef sliced potatoes paper thin fried them crisp and salted them to spite a customer who loved them creating this beloved snack.","answer_text":"Potato chips","options":["French fries","Potato chips","Tater tots","Hash browns"],"backdoor_type":"Everyday Link","backdoor_explanation":"Chef George Crum created Saratoga Chips at Moon Lake House in Saratoga Springs.","points":100,"difficulty_tier":"easy","tag":"Crisp"},{"lens":"The Cultural Impact","form":"Form 6 (The Contradiction)","question_text":"Despite being associated with San Francisco this Chinese American dish was invented in 1982 by chef Andy Kao in Hawaii at a Panda Express test kitchen.","answer_text":"Orange chicken","options":["General Tso chicken","Orange chicken","Sweet and sour pork","Kung Pao chicken"],"backdoor_type":"Contrast Pop","backdoor_explanation":"Orange chicken is Panda Express most popular dish invented in Hawaii in 1982.","points":200,"difficulty_tier":"easy","tag":"Orange"},{"lens":"The Rivalry","form":"Form 6 (The Contradiction)","question_text":"One cola was created by a veteran as a morphine treatment Coca Cola while this one created in 1898 by Caleb Bradham was originally called Brad Drink.","answer_text":"Pepsi Cola","options":["Dr Pepper","Pepsi Cola","Royal Crown Cola","7 Up"],"backdoor_type":"Sequence Pattern","backdoor_explanation":"Pepsi comes from dyspepsia indigestion reflecting its original marketing as a digestive aid.","points":300,"difficulty_tier":"medium","tag":"Cola"},{"lens":"The Connection","form":"Form 1 (Action First)","question_text":"Fermenting underground for decades this rare golden fungus the most expensive food at over 3000 dollars per pound is harvested by trained pigs or dogs.","answer_text":"White truffle","options":["Black truffle","White truffle","Saffron","Beluga caviar"],"backdoor_type":"Sensory Logic","backdoor_explanation":"Tuber magnatum from Piedmont Italy cannot be cultivated only grows wild with tree roots.","points":400,"difficulty_tier":"challenging","tag":"Gold"},{"lens":"The Legacy","form":"Form 7 (The Question Lead)","question_text":"What condiment developed in China over 2500 years ago and perfected in Japan by monks is made from soybeans wheat salt and koji mold aged in cedar barrels","answer_text":"Soy sauce","options":["Fish sauce","Soy sauce","Miso paste","Tamari"],"backdoor_type":"Etymology Name Logic","backdoor_explanation":"Shoyu in Japanese is one of the oldest condiments using koji Aspergillus oryzae for fermentation.","points":500,"difficulty_tier":"expert","tag":"Umami"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Culinary Origins', 'Theme:Food and Drink'],
      true,
      v_uid
    );
  END IF;
END $$;

-- Coffee and Tea Culture (Food and Drink) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Coffee and Tea Culture') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Coffee and Tea Culture',
      'Food and Drink',
      'The beverages that fuel the modern world.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"According to legend around 850 CE an Ethiopian goat herder named Kaldi noticed his goats frolicking after eating red berries leading to the discovery of this beverage.","answer_text":"Coffee","options":["Coffee","Tea","Mate","Coca tea"],"backdoor_type":"Everyday Link","backdoor_explanation":"Kaldi the goat herder legend from the Kaffa region of Ethiopia where the word coffee may originate.","points":100,"difficulty_tier":"easy","tag":"Kaldi"},{"lens":"The Cultural Impact","form":"Form 2 (Parenthetical Hook)","question_text":"Unlike green tea which is pan fired this tea type accounting for 78 percent of Western consumption undergoes full oxidation giving dark color and bold flavor.","answer_text":"Black tea","options":["Black tea","Oolong tea","White tea","Pu erh tea"],"backdoor_type":"Functional Logic","backdoor_explanation":"Black tea is fully oxidized creating bold flavor. Earl Grey and Orange Pekoe are black teas.","points":200,"difficulty_tier":"easy","tag":"Dark"},{"lens":"Behind the Scenes","form":"Form 1 (Action First)","question_text":"Using a secret spray drying process this Swiss developed product introduced the first successful instant coffee in 1938 becoming a WWII staple.","answer_text":"Nescafe","options":["Nescafe","Maxwell House","Folgers","Taster Choice"],"backdoor_type":"Sequence Pattern","backdoor_explanation":"Nescafe invented by Nestle scientist Max Morgenthaler in 1938 supplied to US troops in WWII.","points":300,"difficulty_tier":"medium","tag":"Instant"},{"lens":"The Rivalry","form":"Form 6 (The Contradiction)","question_text":"The Boston Tea Party 1773 made one beverage an act of patriotism to reject while this dark brew became the proudly American alternative with the first coffeehouse in NYC in 1696.","answer_text":"Coffee","options":["Coffee","Hot chocolate","Mint tea","Apple cider"],"backdoor_type":"Category Elimination","backdoor_explanation":"Drinking coffee became a symbol of American independence after the Boston Tea Party.","points":400,"difficulty_tier":"challenging","tag":"Patriot"},{"lens":"The Connection","form":"Form 10 (Defining Trait)","question_text":"Hand picked and processed through the digestive tract of the Asian palm civet this Indonesian coffee at 600 dollars per pound has a uniquely smooth chocolatey flavor.","answer_text":"Kopi Luwak","options":["Blue Mountain coffee","Kopi Luwak","Hawaiian Kona coffee","Panama Geisha coffee"],"backdoor_type":"Sensory Logic","backdoor_explanation":"Civet coffee fermentation in the civet digestive tract breaks down proteins reducing bitterness.","points":500,"difficulty_tier":"expert","tag":"Civet"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Coffee and Tea Culture', 'Theme:Food and Drink'],
      true,
      v_uid
    );
  END IF;
END $$;

-- Chocolate and Confectionery (Food and Drink) — 5 questions
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = 'Chocolate and Confectionery') THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      'Chocolate and Confectionery',
      'Food and Drink',
      'The sweet science behind the world favorite dessert.',
      '[{"lens":"Origin Story","form":"Form 5 (Direct Narrative)","question_text":"The Aztecs believed this bitter foamy drink was a gift from Quetzalcoatl and used cocoa beans as currency a single bean could buy a tamale.","answer_text":"Chocolate","options":["Chocolate","Vanilla","Maguey","Pulque"],"backdoor_type":"Etymology Name Logic","backdoor_explanation":"The Aztec word xocolatl means bitter water served cold with chili and vanilla.","points":100,"difficulty_tier":"easy","tag":"Bitter"},{"lens":"Behind the Scenes","form":"Form 9 (The Misdirection)","question_text":"You might expect fruit or cream but this hollow chocolate egg contains a toy inside invented in Italy in 1974 and banned in the US for safety.","answer_text":"Kinder Surprise","options":["Ferrero Rocher","Kinder Surprise","Cadbury Creme Egg","Lindt Lindor"],"backdoor_type":"Contrast Pop","backdoor_explanation":"Kinder Surprise invented by Michele Ferrero in 1974 contains a toy banned in the US.","points":200,"difficulty_tier":"easy","tag":"Surprise"},{"lens":"The Human Element","form":"Form 4 (Active Quote)","question_text":"This Quaker businessman opened a tea shop in Birmingham 1824 eventually building the Bournville model factory village for his chocolate workers.","answer_text":"John Cadbury","options":["John Cadbury","Milton Hershey","Henri Nestle","Rudolf Lindt"],"backdoor_type":"Category Elimination","backdoor_explanation":"Cadbury built Bournville a model village for workers reflecting Quaker social responsibility.","points":300,"difficulty_tier":"medium","tag":"Quaker"},{"lens":"Numbers and Scale","form":"Form 2 (Parenthetical Hook)","question_text":"Unlike mass produced cacao this rare variety needing 10000 hand pollinated flowers per pound undergoes 25 day fermentation in Chuao Venezuela.","answer_text":"Porcelana Criollo","options":["Porcelana Criollo","White chocolate","Dark chocolate 70 percent","Gianduja"],"backdoor_type":"Sensory Logic","backdoor_explanation":"Porcelana is the rarest Criollo cacao from Chuao Venezuela with porcelain like color before roasting.","points":400,"difficulty_tier":"challenging","tag":"Rare"},{"lens":"The Legacy","form":"Form 8 (The Timeline)","question_text":"First developed in 1912 by a Belgian chocolatier to prevent soft centers from melting this hard sugar shell technique is found on M and Ms and Smarties.","answer_text":"Hard sugar shell panning","options":["Caramel filling","Hard sugar shell panning","Praline","Ganache"],"backdoor_type":"Functional Logic","backdoor_explanation":"Jean Neuhaus Jr invented the panning process in 1912 spraying sugar syrup in a rotating drum.","points":500,"difficulty_tier":"expert","tag":"Shell"}]'::jsonb::jsonb,
      ARRAY['Grid', 'Chocolate and Confectionery', 'Theme:Food and Drink'],
      true,
      v_uid
    );
  END IF;
END $$;

