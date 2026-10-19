import { SAMPLE_CODE } from "./sampleCode";

export interface Demo { id: string; name: string; code: string }

export const DEMOS: Demo[] = [
  { id: "chernobyl", name: "Chernobyl Explained", code: SAMPLE_CODE },
  {
    id: "coffee",
    name: "The Price of Coffee",
    code: `project "Why Coffee Got Expensive" theme clean_modern

headline "Coffee prices hit a record high as harvests fail" paper "THE MORNING LEDGER" body "Drought in Brazil and Vietnam cut supply just as demand kept climbing worldwide." mark "record high" mark "harvests fail" over 3s enter drop
camera zoom 1.15 over 4s ease smooth
wait 4.5s
push 0.6

line "Arabica price, $ per lb" "2019" 1.0 "2020" 1.1 "2021" 1.9 "2022" 2.2 "2023" 1.7 "2024" 2.9 over 3s as price enter blur
unverified price
camera to 1400 400 zoom 1.5 over 1s ease snap delay 3s
wait 4.5s
whip 0.5

count 70 suffix "%" label "Share of beans from just five countries" over 2s as share enter pop
unverified share
wiggle share over 0.8s delay 2s
wait 3.5s
wipe 0.6

say "Your morning cup is a *climate* story" beat 0.35s enter rise
wait 3s
`,
  },
  {
    id: "startup",
    name: "Startup Growth",
    code: `project "From Zero to a Million Users" theme clean_modern

say "Year one: *nobody* noticed" beat 0.3s enter blur exit blur
wait 2.5s
whip 0.5

line "Monthly users (thousands)" "Jan" 2 "Mar" 5 "May" 14 "Jul" 60 "Sep" 240 "Nov" 1000 over 3s enter rise
camera to 1500 350 zoom 1.6 over 0.8s ease snap delay 3s
shake 14 over 0.4s delay 3.8s
wait 4.5s
zoom

count 1 suffix "M" label "Users after 11 months" over 1.5s as users enter spin
pulse users 0.2 over 0.6s delay 1.5s
wait 3s
push 0.6

bars "Where users came from (%)" "Search" 18 "Ads" 12 "Word of mouth" 70 over 3s enter slide_left
circle at 1500 560 radius 160 over 0.6s delay 3s
wait 4s
blur 0.6

say "Build something people *tell friends about*" beat 0.3s enter pop
move say2 to 960 480 curve 120 over 1.2s ease spring delay 2s
wait 3s
`,
  },
  {
    id: "showcase",
    name: "Feature Showcase (everything)",
    code: `project "Everything Paint & Turtle Can Do" theme clean_modern
style radius 28

# --- 1. Kinetic text with entrance + exit
say "Every *feature*, one video" beat 0.3s enter pop exit blur
wait 2.5s
whip 0.5

# --- 2. Photo: Ken Burns zoom, caption, camera move, rotate, fade
show photo @pillars as nebula enter blur
zoom nebula 1.0 to 1.2 over 5s ease smooth
caption nebula "Photos zoom, pan and get captions"
camera to 1100 450 zoom 1.2 over 3s ease smooth
rotate nebula 3 over 2s delay 2s
fade nebula to 0.6 over 1s delay 3.5s
wait 5s
push 0.6

# --- 3. Counter with source, unverified badge, pulse and shake
count 6500 suffix " ly" label "Distance to the Pillars" over 2s as dist enter spin
source dist "NASA" https://science.nasa.gov
unverified dist
pulse dist 0.2 over 0.6s delay 2s
shake 14 over 0.4s delay 2.2s
wait 3.5s
wipe 0.6

# --- 4. Bar chart with pen annotations
bars "Pen tools" "Arrow" 40 "Circle" 65 "Box" 80 "Highlight" 95 over 3s enter rise
circle at 1450 560 radius 150 over 0.6s delay 3s
box at 300 820 size 500 120 over 0.6s delay 3.3s
highlight from 320 880 to 780 880 over 0.6s delay 3.6s
wait 4.5s
blur 0.6

# --- 5. Line chart with snap camera
line "Growth" "Q1" 2 "Q2" 5 "Q3" 9 "Q4" 20 over 3s as growth enter slide_left
camera to 1500 350 zoom 1.5 over 0.8s ease snap delay 3s
wait 4.5s
zoom

# --- 6. Headline with marker sweeps
headline "Studio ships every feature at once" paper "THE DAILY CANVAS" body "Code and hand editing stay perfectly in sync." mark "every feature" over 3s enter drop
wait 4s
crossfade 0.6

# --- 7. Turtle code: variables, loops, move along a curve, wiggle
let gap = 380
say "Loops draw *patterns*" at 960 220 beat 0.25s as title
repeat 3
  wait 0.3s
end
for i from 0 to 3
  arrow from (250 + i*gap) 800 to (450 + i*gap) 650 over 0.4s
  wait 0.3s
end
move title to 960 500 curve 120 over 1.2s ease spring
wiggle title over 0.8s delay 1.2s
scale title 1.2 over 0.5s delay 2s
wait 3s
`,
  },
];
