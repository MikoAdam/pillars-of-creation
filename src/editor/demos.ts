export interface Demo {
  id: string;
  name: string;
  code: string;
  /** Maps the script includes, stored under these names when the demo is loaded. */
  maps?: Record<string, string>;
}

const EU_MAP = "EU enlargement, 2004 (demo)";

/** Starting points. Each line is a plain command: change a word or number and the video changes. */
export const DEMOS: Demo[] = [
  {
    id: "pillars",
    name: "Inside the Pillars of Creation",
    code: `project "Inside the Pillars of Creation" theme clean_modern

show photo @pillars as pillars enter fade
zoom pillars 1.0 to 1.25 over 14s ease smooth
caption pillars "The Pillars of Creation, Eagle Nebula (M16)"
wait 7s
whip 0.5

count 6500 suffix " light years" label "Distance from Earth" over 2s as dist enter rise
source dist "NASA, Hubble Space Telescope" https://science.nasa.gov
shake 10 over 0.6s delay 2.2s
wait 6s
push 0.6

say "The light you see left these clouds about *6,500 years* ago" at 960 540 beat 0.4s enter blur
wait 5s
blur 0.6
`,
  },
  {
    id: "eu",
    name: "EU enlargement, 2004: a 3D map",
    code: `project "The 2004 enlargement of the EU" theme clean_modern

say "On 1 May 2004, *ten countries* joined the European Union" at 960 540 beat 0.4s enter blur exit blur
wait 3.5s
crossfade 0.8

# The map plays from its own script. Open it with "Edit map" to change it.
include map "${EU_MAP}"
wait 1s
crossfade 0.8

say "Together: about *74 million people*" at 960 540 beat 0.4s enter pop
wait 3s
`,
    maps: {
      [EU_MAP]: `map 60 20 zoom 1.6 as europe
year "2004" highlight
wait 1s

fly 50 15 zoom 3.4 tilt 40 turn -12 over 3s
wait 3s

country poland blue fade
bubble 52.2 19.2 "Poland, the largest of the ten" blue
wait 1.5s
country czechia blue fade
country slovakia blue fade
country hungary blue fade
country slovenia blue fade
wait 1.5s

country estonia green sweep
country latvia green sweep
country lithuania green sweep
wait 1.5s

country cyprus orange radial
country malta orange radial
wait 1.5s

legend "Central Europe" blue
legend "Baltic states" green
legend "Mediterranean islands" orange
fly 50 15 zoom 2.6 tilt 0 turn 0 over 2.5s
wait 3s
`,
    },
  },
  {
    id: "webb",
    name: "Webb's mirror, in numbers",
    code: `project "Inside the James Webb Space Telescope" theme clean_modern

show photo @telescope as webb enter fade
zoom webb 1.0 to 1.12 over 6s ease smooth
caption webb "Webb's primary mirror: 18 gold-coated segments"
wait 4s
wipe 0.6

bars "Primary mirror diameter (metres)" "Hubble" 2.4 "Webb" 6.5 over 3s as mirrors enter rise
source mirrors "NASA" https://www.nasa.gov/webb
wait 4s
push 0.6

count 18 label "Hexagonal segments, aligned after launch" over 2s as segs enter pop
shake 8 over 0.4s delay 2s
wait 3.5s
whip 0.5

say "It sees the light of the *first galaxies*, more than 13 billion years old" beat 0.4s enter blur
wait 3s
`,
  },
];
