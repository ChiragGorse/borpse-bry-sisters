/**
 * The game's changelog, newest first. Shown from the title screen ("What's new"); the first entry's
 * version is the game's current version. Add an entry here with every big change.
 */
export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'Beta 0.13',
    date: '2026-11-20',
    title: 'Folk Valley',
    changes: [
      'Slopwood Forest is now called Folk Valley.',
      'Folk Valley has anomalies. Every so often something happens that only you see: a pale, impossibly tall figure watching from the trees (it is gone when you get close); a pig that looks just like Herb but has no lantern, and turns its head all the way round when you approach; the lanterns guttering out while footsteps pass by; little lights that drift away and want you to follow; whispers; the picture tearing; the music suddenly stopping.',
    ],
  },
  {
    version: 'Beta 0.12',
    date: '2026-11-20',
    title: 'Flaming Robots',
    changes: [
      'Earwhen has a new attack: he loads his cannon with burning robots and fires a volley of them (four when he is enraged). Each one lands on an orange ring, explodes, and leaves a patch of fire.',
      'Fixed a crash in the final course when you interrupted Allen while he was eating.',
    ],
  },
  {
    version: 'Beta 0.11',
    date: '2026-11-19',
    title: 'Allen Takes Charge',
    changes: [
      'Allen gets stunlocked far less: after a stun he resists light stuns for 10 seconds, heavy stuns in that window are much shorter, and his stagger bar only refills once he has recovered.',
      'His stagger bar is bigger (more so in big herds), and a stagger is a little shorter.',
      'Allen hits harder (+18%), while the kitchen brigade hits softer (-38%), comes in smaller waves, and comes less often. Allen now does most of the damage, not his bots.',
    ],
  },
  {
    version: 'Beta 0.10',
    date: '2026-11-19',
    title: 'Menus & Settings',
    changes: [
      'Back to the main menu from the pause, game-over and victory screens. Run-ending buttons ask you to confirm.',
      'Online, the host can take the whole room back to the lobby (nobody gets disconnected) to change bots or who plays Allen, then start a fresh run.',
      'New Settings screen: sound, graphics, and fully rebindable keyboard and mouse controls (two keys per action).',
      'Touch buttons can be dragged anywhere, resized, and the stick moved to the right side. Saved on your device.',
      'Online names are now required, and no two players in a room can share one.',
      'In the flashbacks, Allen is a regular kid. He only balloons in the Greed and Hunger scene.',
      'Allen talks about Chinese food now: char siu, fried rice, chili oil. Course 2 is the Dim Sum Blitz.',
      'This changelog.',
    ],
  },
  {
    version: 'Beta 0.9',
    date: '2026-11-19',
    title: 'The Haunted Hog Hunt',
    changes: [
      'The Hog Hunt is now a truffle hunt. Herb carries a lantern and leads you to five buried caches; dig each one up for truffles.',
      'Ask Herb which way to the next cache. Dig up all five for a bonus. One hunt per break between courses.',
      'Slopwood Forest is pitch dark at night: thick fog, lantern light, and red eyes blinking in the trees.',
      "Path Guppy jump-scares you every so often: his grotesque face fills the screen with a scream, then he swings once and vanishes. Hit him and he drops a truffle as he flees.",
      'Recruiting wild hogs is gone; team up with real players instead.',
    ],
  },
  {
    version: 'Beta 0.8',
    date: '2026-11-19',
    title: 'Earwhen',
    changes: [
      'Beat the Grand Feast and Allen, furious, phones Earwhen for backup.',
      'A new final course: Earwhen plus a battered Allen. The farm is only safe once both are down.',
      'Earwhen fights with cream: a sweeping Cream Spray, a rapid Cream Stream, and a charged Mega Dollop that leaves a puddle. He also stops to snack on your crops.',
      'If one of them falls first, the other gets angry.',
    ],
  },
  {
    version: 'Beta 0.7',
    date: '2026-11-19',
    title: "Charig's Prologue",
    changes: [
      'The opening story now starts with Charig telling how it all began: the AL vs Gen Ed war, the farm, the good times back in the lab, and how Allen got kicked out.',
      'New NPC Kioff by the chicken coop: Corn Cannon (moved from Kingger), Backrooms Portal, Wireframe Decoy and Keyframe Rewind.',
      'New NPC Charig by the farmhouse: Health Potion, Out-of-Combat Regen, Speedrun Strats, and Smash Battles (stuns Allen, then he is angry for 15 seconds).',
      'Choose up to six active abilities in the pause menu; they go on Q F C V X G (or 1-6).',
      'Music: two farm songs, a forest song, and fight music when the bell rings.',
    ],
  },
  {
    version: 'Beta 0.6',
    date: '2026-11-19',
    title: 'The Story, Animated',
    changes: [
      'The opening story plays out on the real farm with moving camera shots, effects and sound.',
      'Clearer messages when your game page and the server are on different versions.',
    ],
  },
  {
    version: 'Beta 0.5',
    date: '2026-11-19',
    title: 'Play as Allen',
    changes: [
      'Play as Allen against bot pigs on your own, or online: the host can pick a player to be Allen.',
      'Allen has his own controls: claw swipe, dash, body slam, wok guard, chopsticks, summon bots, hot pot rain and sizzle spin. Eat the farm or flatten every pig to win.',
    ],
  },
  {
    version: 'Beta 0.4',
    date: '2026-11-19',
    title: 'Online Co-op',
    changes: [
      'Host or join online rooms with a four-letter code, and invite friends with a link.',
      'A game server you can run yourself (on Windows or Linux), with a Server box so any copy of the game can connect to it.',
      'Your own pig moves and attacks instantly in your browser, even on a slow connection.',
    ],
  },
  {
    version: 'Beta 0.3',
    date: '2026-11-18',
    title: 'The Herd',
    changes: ['Up to eight pigs on the farm at once.', 'Add bot pigs to fight beside you from the title screen.'],
  },
  {
    version: 'Beta 0.2',
    date: '2026-11-18',
    title: 'Phones & Tablets',
    changes: ['On-screen joystick and buttons for touch screens.', 'A smaller, see-through HUD on small screens.', 'The game is now online on GitHub Pages.'],
  },
  {
    version: 'Beta 0.1',
    date: '2026-11-17',
    title: 'The Farm',
    changes: [
      'Kenji the pig defends the farm from Allen B. Hwang across eight courses.',
      "Rickley's shop, Kingger's gadgets and Trout's combo dojo.",
      "Allen's kitchen brigade: Grillbots, Sriracha Spitters, Skewer Hounds, Tenderizer Brutes and Kettle Bombers.",
      'Slopwood Forest, the Hog Hunt and Path Guppy.',
    ],
  },
];

export const GAME_VERSION = CHANGELOG[0].version;
