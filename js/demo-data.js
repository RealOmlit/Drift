/* ==========================================================================
   Drift · demo-data.js
   ───────────────────────────────────────────────────────────────────────────
   ⚠️  DEMO / MOCK DATA LAYER — this file exists ONLY so the static GitHub
   Pages build feels alive. Everything here would come from Supabase /
   Firebase in production (users, rooms, messages, presence, topics).
   It is intentionally isolated: swap js/backend.js adapters and delete this.
   ========================================================================== */

window.DemoData = (() => {
  'use strict';

  const H = 3600e3, M = 60e3;
  const now = () => Date.now();

  /* ------------------------------------------------------------------ */
  /* Demo people (would be a `users` table)                              */
  /* ------------------------------------------------------------------ */
  const RAW_USERS = [
    ['LunaWave',    '🌙', 'Luna',      'Product designer · gradients are a personality trait',        'Designing in the dark mode',   'online'],
    ['Kai_42',      '⚡', 'Kai',       'Full-stack dev · ships on Fridays, sorry',                    'Debugging production',         'online'],
    ['PixelPeach',  '🍑', 'Peach',     'Illustrator & pixel artist',                                  'Commissions open!',            'online'],
    ['Orbyt',       '🪐', 'Orbyt',     'Astro nerd · ask me about exoplanets',                        'Stargazing',                   'away'],
    ['MiaSyntax',   '💻', 'Mia',       'SRE · if it moves, I monitor it',                             'On-call (send coffee)',        'online'],
    ['RiffMaster',  '🎸', 'Riff',      'Guitarist · synthwave covers',                                'In the studio',                'online'],
    ['StudyOwl',    '🦉', 'Owl',       'Med student · flashcards forever',                            'Deep work 📚',                 'online'],
    ['NovaJade',    '✨', 'Nova',      'Community manager here to help!',                             'Say hi 👋',                    'online'],
    ['TurboToast',  '🍞', 'Toast',     'Certified meme archivist',                                    'toasting',                     'online'],
    ['EchoValley',  '🏔️', 'Echo',      'Trail runner · 14 peaks and counting',                        'Offline hike',                 'offline'],
    ['JumpyFox',    '🦊', 'Fox',       'FPS grinder · radiant btw',                                   'Ranked grind',                 'online'],
    ['SolarisK',    '☀️', 'Sol',       'Photographer chasing golden hour',                            'Editing shots',                'away'],
    ['QuillFeather','🪶', 'Quill',     'Writer · world-building addict',                               'Chapter 12…',                  'offline'],
    ['ByteBandit',  '🏴‍☠️', 'Bandit',  'CTF player · pwn is a lifestyle',                              'hunting flags',                'online'],
    ['Marigold',    '🌼', 'Mari',      'Biology major · plant mom',                                   'Lab report time',              'offline'],
    ['ZenithRim',   '🛞', 'Zen',       'F1 fanatic · apex enjoyer',                                   'Race weekend!!',               'online'],
    ['CloudSurfer', '🏄', 'Cloud',     'Windsurfing + weather geeks unite',                           'Waiting for wind',             'offline'],
    ['MintCondition','🌿', 'Mint',     'Minimalist · tea over coffee',                                'Repotting monstera',           'away'],
    ['RetroRay',    '👾', 'Ray',       'Speedrunner · CRT purist',                                     'PB attempt tonight',           'online'],
    ['HaloJump',    '🎧', 'Halo',      'Playlist curator · 300+ hrs of lofi',                          'Vibing',                       'online'],
    ['PuddleJumper','💦', 'Puddle',    'Chaos agent · professional reply-guy',                         'lurking',                      'online'],
    ['VoxelVera',   '🧊', 'Vera',      '3D artist · blender since 2.7',                               'Rendering (help)',             'offline']
  ];

  const users = RAW_USERS.map(([username, emoji, displayName, bio, statusMsg, status], i) => ({
    id: 'u' + (i + 1),
    username,
    displayName,
    avatarEmoji: emoji,
    bio, statusMsg, status,
    lastSeen: status === 'offline' ? now() - U.randInt(1, 72) * H : null,
    xp: 400 + (U.hashCode(username) % 5200),
    joinedAt: now() - (30 + (U.hashCode(username) % 500)) * 24 * H,
    affinity: null, // filled below
    isDemo: true    // ⚠️ marks mock accounts (never shown as "real" users)
  }));

  // Which rooms each bot calls home (used by ambient chatter simulation)
  const AFFINITY = {
    r1: ['u1','u8','u13','u18','u21','u12'],
    r2: ['u11','u19','u14','u21','u3'],
    r3: ['u5','u2','u14','u22','u4'],
    r4: ['u4','u5','u2','u22'],
    r5: ['u7','u15','u18','u13'],
    r6: ['u6','u20','u1','u12'],
    r7: ['u9','u21','u19','u3'],
    r8: ['u16','u17','u11'],
    r9: ['u13','u21','u9','u17'],
    r10:['u22','u3','u1','u12']
  };

  /* ------------------------------------------------------------------ */
  /* Rooms (would be a `rooms` table)                                    */
  /* ------------------------------------------------------------------ */
  const ROOM_DEFS = [
    { id:'r1', name:'Orbit Lounge', icon:'🛋️', category:'general',
      desc:'The cozy heart of Drift. Grab a seat, share your day, meet the crew.',
      tags:['hangout','community','chill'], ownerId:'u1', mods:['u2','u8'], memberCount:1287, momentum:74 },
    { id:'r2', name:'Pixel Arena', icon:'🎮', category:'gaming',
      desc:'From ranked climbs to cozy indies — squads, clips and hot takes.',
      tags:['fps','indie','speedrun'], ownerId:'u11', mods:['u19'], memberCount:2143, momentum:88 },
    { id:'r3', name:'The Code Forge', icon:'👨‍💻', category:'coding',
      desc:'Ship talk: debugging war stories, architecture debates and rubber ducks.',
      tags:['javascript','devops','opensource'], ownerId:'u5', mods:['u2'], memberCount:1732, momentum:81 },
    { id:'r4', name:'Future Tech', icon:'🚀', category:'technology',
      desc:'AI, spaceflight, gadgets and the weird future arriving early.',
      tags:['ai','space','gadgets'], ownerId:'u4', mods:[], memberCount:986, momentum:63 },
    { id:'r5', name:'Late Night Study', icon:'📚', category:'study',
      desc:'Focus timers, pomodoro pals and 2am motivation for finals season.',
      tags:['pomodoro','exams','focus'], ownerId:'u7', mods:['u15'], memberCount:654, momentum:41 },
    { id:'r6', name:'Sound Wave', icon:'🎧', category:'music',
      desc:'Share what you\'re listening to. Weekly playlist swaps encouraged.',
      tags:['lofi','playlists','concerts'], ownerId:'u6', mods:['u20'], memberCount:1103, momentum:57 },
    { id:'r7', name:'Meme Harbor', icon:'😂', category:'memes',
      desc:'Premium nonsense only. Lurkers welcome, cringe policed by mods.',
      tags:['funny','daily','shitposting'], ownerId:'u9', mods:['u21'], memberCount:1890, momentum:92 },
    { id:'r8', name:'Sports Bar', icon:'⚽', category:'sports',
      desc:'Matchday threads, transfer rumors and questionable hot takes.',
      tags:['football','f1','nba'], ownerId:'u16', mods:[], memberCount:720, momentum:48 },
    { id:'r9', name:'Off Topic', icon:'🎲', category:'random',
      desc:'No theme, no rules (okay, three rules). The wildcard channel.',
      tags:['whatever','chaos'], ownerId:'u13', mods:[], memberCount:1430, momentum:66 },
    { id:'r10', name:'Design Deck', icon:'🎨', category:'design',
      desc:'UI critiques, type pairings and portfolio feedback that doesn\'t sting.',
      tags:['ui','typography','portfolio'], ownerId:'u22', mods:['u3','u1'], memberCount:512, momentum:37 }
  ];

  const RULES = [
    ['Be kind first. Debate ideas, not people.', 'No spam, self-promo floods or scam links.', 'Keep it legal & age-appropriate.', 'Mods have the final word — appeal politely in DMs with the owner.'],
    ['Spoiler-tag current season content.', 'Clips welcome — keep clips under 60s.', 'No toxicity in LFG threads.', 'Have fun, it\'s a game.'],
    ['Include context: language, error, what you tried.', 'Use code blocks (``` fences) for code.', 'No "urgent!!" titles — everyone\'s issue is urgent.', 'Mark solved threads with a ✅ reaction.'],
    ['Cite sources for big claims.', 'No hype-only posts — add substance.', 'AI news welcome, AI doom spirals less so.', 'Beginner questions are great questions.'],
    ['Quiet focus 25/5 cycles — chat between timers.', 'Share goals, not guilt.', 'Body-doubling sessions start on the hour.', 'Celebrate small wins loudly.'],
    ['Link the track, not just the vibe.', 'No genre shaming.', 'Weekly playlist swap every Friday.', 'Concert footage > bootlegs.'],
    ['If you have to explain it, it\'s better.', 'Reposts allowed after 30 days.', 'Political rage-bait gets yeeted.', 'Laugh at yourself at least once per visit.'],
    ['Flair your team before trash talk.', 'Score updates in the matchday thread only.', 'Respect athletes, roast tactics.', 'No betting spam.'],
    ['Three actual rules: 1) consent 2) kindness 3) no dice gambling with real money.', 'Everything else goes.', 'Yes, even that.', 'Mods may invent rule four at any time.'],
    ['Critique the work, not the human.', 'Screenshot ≠ permission to roast.', 'Share process, not just polish.', 'Credit fonts, palettes and inspiration.']
  ];
  const RULE_MAP = Object.fromEntries(ROOM_DEFS.map((d, i) => [d.id, RULES[i]]));

  /* ------------------------------------------------------------------ */
  /* Seed conversations (would come from a paginated messages query)      */
  /* ------------------------------------------------------------------ */
  let mid = 0;
  const mk = (uidx, text, minsAgo, extra = {}) => Object.assign({
    id: 'sm' + (++mid),
    userId: typeof uidx === 'number' ? 'u' + uidx : uidx,
    text,
    ts: now() - minsAgo * M,
    edited: false, deleted: false, pinned: false,
    reactions: {}, replyTo: null, type: 'text', seen: true, poll: null, meta: null
  }, extra);

  function seedFor(roomId, def) {
    switch (roomId) {
      case 'r1': return [
        mk('u1', 'Welcome to the Lounge! 🛋️ Pin board has house rules — short version: be cool, stay hydrated.', 600, { pinned: true }),
        mk('u8', 'morning drifters ☀️ coffee count so far: 3. judging: none.', 320),
        mk('u12', 'ok important question: cereal first or milk first? this defines you as a person', 296),
        mk('u21', 'milk first is a cry for help', 294, { reactions: { '😂': ['u12', 'u9', 'u1'] } }),
        mk('u13', 'writing update: chapter 12 is fighting back. send snacks.', 210),
        mk('u18', 'my monstera grew a new leaf and yes this is my personality now', 180),
        mk('u1', '', 150, {
          type: 'poll',
          poll: { question: 'Next community game night — which vibe?', options: [
            { label: '🎮 Co-op chaos', votes: ['u12', 'u21', 'u8'] },
            { label: '🧩 Puzzle night', votes: ['u13'] },
            { label: '🏎️ Racing league', votes: ['u16', 'u11'] },
            { label: '🕵️ Social deduction', votes: [] }
          ] }
        }),
        mk('u2', 'voted co-op purely to watch Puddle friendly-fire everyone again', 148),
        mk('u21', 'it was ONE time', 147, { reactions: { '💀': ['u2', 'u8', 'u12', 'u9'] } }),
        mk('u3', 'sketching the lounge mascot during lunch, will post to Design Deck later 🎨', 95),
        mk('u22', '👀 excited for this one', 93, { replyTo: 9 })
      ];
      case 'r2': return [
        mk('u11', 'ARENA HOUSE RULES: spoiler tags for story modes, clips under 60s, salt levels under 11.', 700, { pinned: true }),
        mk('u19', 'new CRT arrived. input lag: imperceptible. vibes: immaculate 👾', 420),
        mk('u14', 'anyone up for co-op raid tonight? need two more, mic optional, chaos guaranteed', 240),
        mk('u3', 'me + peach = carry confirmed', 238, { replyTo: 2, reactions: { '🔥': ['u11'] } }),
        mk('u11', '', 200, { type: 'activity', meta: { game: 'reaction-race', headline: 'Kai_42 won Reaction Race', detail: '212ms · room record is 187ms' } }),
        mk('u19', '212?? my hands are faster than my wifi I swear', 198, { reactions: { '😂': ['u11', 'u3'] } }),
        mk('u21', 'hot take: remakes should lock the original behind beating the remake', 120),
        mk('u11', 'controversial but I respect it', 118)
      ];
      case 'r3': return [
        mk('u5', 'Forge rules: context > code dumps. Language + error + what you tried. We\'re friendly, promise.', 800, { pinned: true }),
        mk('u2', 'PSA: your `useEffect` isn\'t broken, your dependency array just saw things it can\'t unsee', 350),
        mk('u22', 'blender python API is a fever dream and I say that with love', 280),
        mk('u5', '```js\n// tiny debounce, zero deps\nconst debounce = (fn, ms = 200) => {\n  let t;\n  return (...args) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), ms);\n  };\n};\n```', 260, { reactions: { '💡': ['u2', 'u22', 'u4'] } }),
        mk('u4', 'saving this before my next side project consumes me', 255, { replyTo: 3 }),
        mk('u14', 'CTF tip of the day: always check response headers, half the flags live there 🏴‍☠️', 140),
        mk('u2', 'deployed on a friday again. wish me luck. actually don\'t, I need skill not luck', 60, { reactions: { '😱': ['u5'], '🙏': ['u22'] } })
      ];
      case 'r4': return [
        mk('u4', 'Future Tech briefing: this week in orbit launches, model releases and chips nobody can buy 🚀', 900, { pinned: true }),
        mk('u2', 'local-first apps are quietly winning. sync engines are the new frameworks', 300),
        mk('u5', 'edge functions changed how I architect side projects entirely. cold starts who?', 220),
        mk('u22', 'the foldable-that-is-actually-good era is finally here and I\'m not ready financially', 150, { reactions: { '💀': ['u4'] } }),
        mk('u4', 'exoplanet count crossed 6000 this week btw. six thousand other worlds. casual.', 90)
      ];
      case 'r5': return [
        mk('u7', 'Late Night Study rules: quiet during pomodoros (25/5), cheer between rounds 📚', 1000, { pinned: true }),
        mk('u15', 'round one starting in 3… 2…', 240),
        mk('u18', 'flashcards made: 84. soul remaining: 12%', 160),
        mk('u13', 'just finished a 3-hour deep work block. who AM I', 80, { reactions: { '🏆': ['u7', 'u15'] } })
      ];
      case 'r6': return [
        mk('u6', 'Drop what\'s in your headphones right now. No judgment (minimal judgment). 🎧', 800, { pinned: true }),
        mk('u20', 'new lofi mix dropped, 47 minutes of pure focus fuel', 260),
        mk('u1', 'synthwave covers of pop songs are criminally underrated', 170, { reactions: { '🎸': ['u6', 'u20'] } }),
        mk('u12', 'golden hour photos + this playlist = personality', 60, { replyTo: 1 })
      ];
      case 'r7': return [
        mk('u9', 'HARBOR LAW: explainable memes only. If you have to explain it, it\'s better.', 750, { pinned: true }),
        mk('u21', 'monday mood: a loading bar at 99% since january', 300, { reactions: { '😂': ['u9', 'u19', 'u3', 'u11'] } }),
        mk('u19', 'my sleep schedule is speedrunning any% to insomnia', 180),
        mk('u3', 'artist meme: opens new canvas, closes new canvas, opens reference, closes everything', 90, { reactions: { '💀': ['u22', 'u1'] } })
      ];
      case 'r8': return [
        mk('u16', 'Matchday thread lives here. Flair up, roar responsibly ⚽', 900, { pinned: true }),
        mk('u17', 'that free kick was physics-breaking. I\'ve rewatched it 11 times', 200),
        mk('u16', 'race weekend prep: new floor upgrade, pray for no DNF 🏎️', 100, { reactions: { '🏎️': ['u11'] } })
      ];
      case 'r9': return [
        mk('u13', 'Rule check: 1) consent 2) kindness 3) no real-money dice. Everything else is canon.', 850, { pinned: true }),
        mk('u21', 'unpopular opinion: pineapple pizza discourse is a psyop and we\'re all pawns', 250, { reactions: { '🍕': ['u9', 'u17'] } }),
        mk('u17', 'wind forecast says saturday is THE day. see you on the water nerds', 130),
        mk('u9', 'current hyperfixation: ranking airport carpets. Schiphol leads by a mile.', 45)
      ];
      case 'r10': return [
        mk('u22', 'Deck etiquette: critique the work, credit the inspiration, screenshot ≠ permission to roast.', 1100, { pinned: true }),
        mk('u3', 'wip: lounge mascot concepts. round one — a very sleepy comet 🌠', 300, { reactions: { '😍': ['u1', 'u22'] } }),
        mk('u1', 'the sleepy comet is everything. number two needs tinier stars imo', 240, { replyTo: 1 }),
        mk('u12', 'type pairing question: grotesk headings + serif body — timeless or cursed?', 70)
      ];
      case 'r11': return [
        mk('u2', 'Secret Sprint HQ. Scope locked, scope creep arrested on sight.', 500, { pinned: true }),
        mk('u5', 'infra green across the board. staging deploy in 10.', 200),
        mk('u14', 'found a fun edge case in auth flow — writing the repro now 🏴‍☠️', 90)
      ];
      default: return [];
    }
  }

  /* Build materialized rooms with owners/mods/members/messages */
  function buildRooms() {
    return ROOM_DEFS.map(def => {
      const members = [...AFFINITY[def.id]];
      const msgs = seedFor(def.id, def);
      // resolve replyTo indexes → message ids
      msgs.forEach(m => {
        if (typeof m.replyTo === 'number') m.replyTo = msgs[m.replyTo]?.id ?? null;
      });
      return {
        ...def,
        visibility: 'public',
        createdAt: now() - U.randInt(40, 400) * 24 * H,
        slowMode: 0,
        rules: RULE_MAP[def.id],
        members,
        messages: msgs
      };
    }).concat([{
      id: 'r11', name: 'Secret Sprint', icon: '🔒', category: 'coding',
      desc: 'Private build sprint — invite only.',
      tags: ['private'], ownerId: 'u2', mods: ['u5'], memberCount: 8, momentum: 55,
      visibility: 'private', privateCode: 'DRIFT-Y89',
      createdAt: now() - 20 * 24 * H, slowMode: 0, rules: ['What\'s said in the sprint stays in the sprint.'],
      members: ['u2', 'u5', 'u14'], messages: seedFor('r11')
    }]);
  }

  /* ------------------------------------------------------------------ */
  /* Quick Pulse topics + trivia bank (demo content)                     */
  /* ------------------------------------------------------------------ */
  const TOPICS = [
    { tag: '#webgpu-shaders',  heat: 94, room: 'r3',  blurb: 'creative coding is having a moment' },
    { tag: '#indie-games-2026',heat: 91, room: 'r2',  blurb: 'cozy roguelikes everywhere' },
    { tag: '#study-with-me',   heat: 76, room: 'r5',  blurb: 'pomodoro crews assembling' },
    { tag: '#synthwave',       heat: 71, room: 'r6',  blurb: 'retro waves never crash' },
    { tag: '#rust-vs-go',      heat: 69, room: 'r3',  blurb: 'the eternal flame war, politely' },
    { tag: '#launch-window',   heat: 66, room: 'r4',  blurb: 'three orbital launches this week' },
    { tag: '#css-gods',        heat: 61, room: 'r10', blurb: ':has() changed everything' },
    { tag: '#matchday',        heat: 58, room: 'r8',  blurb: 'title race heating up' },
    { tag: '#airport-carpets', heat: 52, room: 'r9',  blurb: 'yes really' },
    { tag: '#lofi-focus',      heat: 49, room: 'r6',  blurb: 'beats to ship code to' }
  ];

  const TRIVIA = [
    { q: 'Which planet has the most moons?', o: ['Jupiter', 'Saturn', 'Neptune', 'Uranus'], a: 1 },
    { q: 'What does CSS stand for?', o: ['Creative Style Sheets', 'Cascading Style Sheets', 'Computed Style Syntax', 'Colorful Sheet Styles'], a: 1 },
    { q: 'Which year did the first website go live?', o: ['1989', '1991', '1995', '2000'], a: 1 },
    { q: 'A group of crows is called a…', o: ['Pack', 'Murder', 'Flock', 'Congress'], a: 1 },
    { q: 'Which gas dominates Earth\'s atmosphere?', o: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Argon'], a: 2 },
    { q: 'What\'s the largest internal organ in the human body?', o: ['Brain', 'Heart', 'Skin is external — Liver', 'Lungs'], a: 2 },
    { q: 'In gaming, "NPC" stands for…', o: ['New Player Character', 'Non-Playable Character', 'Network Protocol Client', 'Named Protagonist Class'], a: 1 },
    { q: 'Which element has the symbol "Au"?', o: ['Silver', 'Aluminium', 'Gold', 'Argon'], a: 2 }
  ];

  /* ------------------------------------------------------------------ */
  /* Ambient chatter pools (used by the realtime simulation)             */
  /* ------------------------------------------------------------------ */
  const CHATTER = {
    general: ['anyone else main-character-ing today or is it just me', 'reminder that hydration is a feature, not a bug 💧', 'just saw the prettiest sunset, brb moving outdoors permanently', 'poll idea brewing… stay tuned', 'who\'s around? thinking of starting a watch-party thread', 'small win of the day: inbox zero achieved (for 4 minutes)', 'if you read this, you owe yourself a stretch break'],
    gaming: ['queue\'s popping off tonight, who\'s in?', 'patch notes dropped and my main is BUFFED let\'s gooo', 'clipped the most ridiculous outplay of my life, posting soon', 'anyone tried that new indie roguelike? wishlist material', 'ranked anxiety is real but the grind calls', 'co-op raid forming in 10 — mic optional, vibes mandatory'],
    coding: ['this stack trace is modern art', 'rubber duck session open, bring your weirdest bug', 'TIL you can ship a whole SaaS on edge functions now', 'refactor done. tests green. ego temporarily restored', 'hot take: naming things is the true final boss', 'who\'s joining the Friday deploy support group'],
    technology: ['that keynote had TWO actual surprises, rare W', 'battery tech is quietly becoming the most exciting frontier', 'open-source hardware scene is thriving lately', 'the future is distributed, local-first and weirdly cozy'],
    study: ['timer started — join me for a 25-min sprint 📚', 'exam in 9 days. we study. we do not spiral. (we spiral slightly)', 'someone check on the flashcard gang', 'study tip: teach it to an imaginary duck. works every time'],
    music: ['this bassline is doing illegal things to my brainwaves', 'playlist swap friday — start queuing your picks', 'live session recordings > studio versions, fight me (kindly)', 'currently: 47 minutes of rain sounds and soft piano'],
    memes: ['posting the meme that got me banned from the family group chat', 'my humor peaked in 2019 and I\'ve made peace with it', 'caption contest: this cat, mid-judgment, go', 'certified fresh nonsense coming through'],
    sports: ['what a finish!! that last-minute equalizer broke my bracket', 'transfer window rumors tier: believable to unhinged', 'matchday thread is LIVE, bring takes', 'underdog arc continues, I\'m emotionally invested'],
    random: ['shower thought: your phone knows you better than your diary does', 'ranking everyday objects by how satisfying the word feels: "kumquat" tops the list', 'conspiracy: stairs are just slow ladders', 'tell me your most useless talent, I\'ll go first: I can wiggle my ears'],
    design: ['spacing audit complete: the answer was more whitespace, it\'s always whitespace', 'that gradient mesh trend? earned. chef\'s kiss typography though', 'portfolio review slots open this weekend', 'kerning crimes reported, suspects in custody']
  };
  const GENERIC = ['oh interesting 👀', 'big agree', 'wait say more about that', 'this thread is cooking honestly', 'adding this to my list of things I didn\'t expect to learn today'];

  /* ------------------------------------------------------------------ */
  /* Seed notifications (shown once the demo account logs in)            */
  /* ------------------------------------------------------------------ */
  function seedNotifications() {
    const t = now();
    return [
      { id: U.uid('n'), type: 'friend', title: 'Nova sent you a friend request', body: 'Community manager · says hi 👋', ts: t - 12 * M, read: false, actorId: 'u8' },
      { id: U.uid('n'), type: 'invite', title: 'Kai invited you to #secret-sprint', body: 'Private room · use code DRIFT-Y89', ts: t - 46 * M, read: false, actorId: 'u2', roomId: 'r11' },
      { id: U.uid('n'), type: 'mention', title: 'Luna mentioned you in Orbit Lounge', body: '"welcome to the Lounge!" — check the pinned intro', ts: t - 3 * H, read: true, actorId: 'u1', roomId: 'r1' },
      { id: U.uid('n'), type: 'room_activity', title: 'Meme Harbor is trending 🔥', body: '+38 members in the last hour — momentum 92', ts: t - 5 * H, read: true, roomId: 'r7' },
      { id: U.uid('n'), type: 'achievement', title: 'Badge unlocked: Early Drifter', body: 'You joined Drift in its opening season', ts: t - 26 * H, read: true }
    ];
  }

  function ensureUsers() { /* users are module-static; hook kept for symmetry */ }

  /** Assemble the initial world into persistent state. */
  function buildWorld() {
    return { rooms: buildRooms() };
  }

  return {
    users, TOPICS, TRIVIA, CHATTER, GENERIC, seedNotifications, buildWorld, ensureUsers,
    userById: id => users.find(u => u.id === id)
  };
})();
