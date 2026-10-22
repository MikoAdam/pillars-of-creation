export interface Demo {
  id: string;
  name: string;
  code: string;
  /** Maps the script includes, stored under these names when the demo is loaded. */
  maps?: Record<string, string>;
}

const EU_MAP = "EU enlargement, 2004 to 2013 (demo)";

/** Starting points. Each line is a plain command: change a word or number and the video changes. */
export const DEMOS: Demo[] = [
  {
    id: "population",
    name: "Eight billion people: a chart",
    code: `project "Eight billion people" theme clean_modern

headline "The world reached *eight billion* people in 2022" paper "UNITED NATIONS" body "Population milestones from the UN World Population Prospects." mark "eight billion" over 3s enter drop
wait 5s
push 0.6

line "World population (billions)" "1804" 1 "1927" 2 "1959" 3 "1974" 4 "1987" 5 "1999" 6 "2011" 7 "2022" 8 over 5s as pop enter blur
source pop "UN World Population Prospects" https://population.un.org/wpp/
wait 7s
crossfade 0.8

say "Each new billion arrived *sooner* than the one before" at 960 540 beat 0.4s enter pop
wait 3.5s
whip 0.5

bars "Years between each billion (rounded)" "1 to 2" 123 "2 to 3" 32 "3 to 4" 15 "4 to 5" 13 "5 to 6" 12 "6 to 7" 12 "7 to 8" 11 over 4s as gaps enter rise
source gaps "Derived from the UN milestone years" https://population.un.org/wpp/
wait 7s
push 0.6

count 11 suffix " years" label "For the most recent billion, 2011 to 2022" over 2s as last enter pop
wait 4s
wipe 0.6

say "Eight billion people share one planet, and the next billion will take longer to add" at 960 540 beat 0.4s enter blur
wait 5s
`,
  },
  {
    id: "eu",
    name: "EU enlargement, 2004 to 2013: a map",
    code: `project "How the European Union grew" theme clean_modern

say "The European Union grew in *three waves*" at 960 540 beat 0.4s enter blur exit blur
wait 4s
crossfade 0.8

# The map plays from its own script. Open it with "Edit map" to change it.
include map "${EU_MAP}"
wait 1s
crossfade 0.8

count 27 suffix " member states" label "In the European Union today" over 2s as members enter pop
source members "European Union, member states" https://european-union.europa.eu
wait 5s
wipe 0.6

say "Each wave brought new countries into the *single market*" at 960 540 beat 0.4s enter rise
wait 4s
`,
    maps: {
      [EU_MAP]: `map 52 15 zoom 2.6 as europe
year "2004" highlight
wait 1s

country poland blue fade
country czechia blue fade
country slovakia blue fade
country hungary blue fade
country slovenia blue fade
country estonia blue fade
country latvia blue fade
country lithuania blue fade
country cyprus blue fade
country malta blue fade
bubble 50.5 21 "2004: ten countries, about 74 million people" blue
legend "2004" blue
wait 4s

fly 46 18 zoom 3.0 over 2s
year "2007" highlight
country bulgaria green fade
country romania green fade
bubble 43 25 "2007: Bulgaria and Romania" green
legend "2007" green
wait 4s

fly 45 17 zoom 3.4 over 2s
year "2013" highlight
country croatia orange fade
bubble 45.5 15.9 "2013: Croatia, the 28th member" orange
legend "2013" orange
wait 4s

fly 52 15 zoom 2.6 over 2.5s
wait 3s
`,
    },
  },
  {
    id: "sky",
    name: "Why the sky is blue: a diagram",
    code: `project "Why the sky is blue" theme clean_modern

say "Sunlight looks white, but it is *every colour mixed together*" at 960 540 beat 0.4s enter pop exit fade
wait 5s
crossfade 0.8

say "Air molecules are much smaller than the wavelength of light" at 960 260 beat 0.4s enter rise
arrow from 220 620 to 820 620 over 1.5s
circle at 520 620 radius 110 over 1s
wait 5s
crossfade 0.8

bars "Relative scattering (red = 1, approximate)" "Red" 1 "Green" 3 "Blue" 6 "Violet" 9 over 4s as scatter enter rise
wait 6s
push 0.6

count 6 suffix " times" label "More scattering for blue than for red" over 2s as ratio enter pop
source ratio "Rayleigh scattering: strength follows the wavelength to the fourth power"
wait 5s
count 450 suffix " nm" label "Wavelength of blue light (approximate)" over 2s as blue_nm enter rise
wait 3s
count 700 suffix " nm" label "Wavelength of red light (approximate)" over 2s as red_nm enter rise
wait 3s
wipe 0.6

say "At sunset the light travels farther, the blue is scattered away, and the *red* reaches you" at 960 540 beat 0.4s enter blur
wait 6s
`,
  },
];
