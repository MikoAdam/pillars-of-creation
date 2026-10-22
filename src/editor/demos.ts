export interface Demo {
  id: string;
  name: string;
  code: string;
  /** Maps the script includes, stored under these names when the demo is loaded. */
  maps?: Record<string, string>;
}

const EU_MAP = "EU enlargement, 2004 (demo)";

/** Short starting points. Each line is a plain command: change a word or number and the video changes. */
export const DEMOS: Demo[] = [
  {
    id: "stars",
    name: "Why stars shine: photo and a counter",
    code: `project "Why stars shine" theme clean_modern

show photo @pillars as pillars enter fade
zoom pillars 1.0 to 1.1 over 6s ease smooth
caption pillars "The Pillars of Creation, Eagle Nebula (M16)"
wait 4s
crossfade 0.8

say "Stars are made mostly of *hydrogen*" at 960 540 beat 0.4s enter pop
wait 2.5s
count 4 label "hydrogen nuclei fuse into one helium nucleus" over 2s as fuse enter rise
source fuse "Stellar fusion, standard astrophysics" https://science.nasa.gov
wait 4s
wipe 0.6

say "That fusion releases the light you can *see* from Earth" beat 0.4s enter blur
wait 3s
`,
  },
  {
    id: "eu",
    name: "EU enlargement, 2004: a map",
    code: `project "The 2004 enlargement of the EU" theme clean_modern

say "On 1 May 2004, *ten countries* joined the European Union" at 960 540 beat 0.4s enter blur exit blur
wait 3.5s
crossfade 0.8

# The map is stored separately and plays from its own script. Edit it with "Edit map".
include map "${EU_MAP}"
wait 1s
crossfade 0.8

say "Colours show the groups of countries, nothing else" beat 0.35s enter rise
wait 3s
`,
    maps: {
      [EU_MAP]: `map 50 12 zoom 3.6 as europe
year "2004" highlight
wait 1s

country poland blue fade
country czechia blue fade
country slovakia blue fade
country hungary blue fade
country slovenia blue fade
wait 1.5s

country estonia green fade
country latvia green fade
country lithuania green fade
wait 1.5s

country cyprus orange fade
country malta orange fade
wait 1.5s

legend "Central Europe" blue
legend "Baltic states" green
legend "Mediterranean islands" orange
wait 2s
`,
    },
  },
  {
    id: "week",
    name: "A week in hours: an illustrative chart",
    code: `project "Where a week goes (illustrative)" theme clean_modern

headline "A week has 168 hours. Where do yours go?" paper "THE DAILY LEDGER" body "These numbers are illustrative. Replace them with your own before you publish." mark "168 hours" over 3s enter drop
wait 4.5s
push 0.6

# "unverified" puts a note on screen until the numbers are checked.
bars "Hours per week (illustrative)" "Sleep" 56 "Work" 40 "Commute" 5 "Everything else" 67 over 3s as week enter rise
unverified week
wait 4.5s
whip 0.5

say "Change any number and the chart follows" beat 0.35s enter rise
wait 3s
`,
  },
];
