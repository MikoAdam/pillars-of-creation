export interface Demo { id: string; name: string; code: string }

/** Short starting points. Each line is a plain command: change a word or number and the video changes. */
export const DEMOS: Demo[] = [
  {
    id: "nebula",
    name: "Star formation: photo and one number",
    code: `project "Star Formation in the Eagle Nebula" theme clean_modern

# The photo runs for the first few seconds. Change the caption to change the story.
show photo @pillars as nebula enter fade
zoom nebula 1.0 to 1.12 over 6s ease smooth
caption nebula "The Pillars of Creation, Eagle Nebula (M16)"
wait 4s

# One figure, with its source. Edit the number or the label to adjust.
count 6500 suffix " light years" label "Distance from Earth" over 2.5s as dist enter rise
source dist "NASA, Hubble Space Telescope" https://science.nasa.gov
wait 4s
crossfade 0.8

# Closing line. *Words in asterisks* are highlighted.
say "Stars are born *inside clouds of dust and gas*" beat 0.4s enter blur
wait 3s
`,
  },
  {
    id: "webb",
    name: "Webb's mirror: photo and counters",
    code: `project "Inside the James Webb Space Telescope" theme clean_modern

show photo @telescope as webb enter fade
zoom webb 1.0 to 1.1 over 5s ease smooth
caption webb "Webb's primary mirror: 18 gold-coated segments"
wait 4s
wipe 0.6

# Each counter is a separate scene. Swap the number or label to reuse the pattern.
count 6.5 suffix " m" label "Diameter of the primary mirror" over 2s as mirror enter pop
source mirror "NASA" https://www.nasa.gov/webb
wait 3s
push 0.6

count 18 label "Hexagonal segments, aligned after launch" over 2s as segs enter rise
wait 3.5s
push 0.6

say "Light from the *first galaxies* took more than 13 billion years to reach us" beat 0.4s enter blur
wait 3s
`,
  },
  {
    id: "coffee",
    name: "Coffee prices: chart and an unverified figure",
    code: `project "Why Coffee Got Expensive" theme clean_modern

headline "Coffee prices climbed as harvests shrank" paper "THE MORNING LEDGER" body "A drought in one growing region can move prices worldwide." mark "shrank" over 3s enter drop
wait 4s
push 0.6

# These numbers are illustrative. "unverified" puts a note on screen until a real source is added.
line "Arabica price, $ per lb (illustrative)" "2019" 1.0 "2020" 1.1 "2021" 1.9 "2022" 2.2 "2023" 1.7 over 3s as price enter blur
unverified price
camera to 1300 420 zoom 1.4 over 1s ease snap delay 3s
wait 4s
whip 0.5

count 70 suffix "%" label "Share of beans from five countries (illustrative)" over 2s as share enter pop
unverified share
wiggle share over 0.8s delay 2s
wait 3.5s
wipe 0.6

say "Your morning cup is a *climate* story" beat 0.35s enter rise
wait 3s
`,
  },
];
