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
    name: "Feature Showcase (university briefing)",
    code: `project "Department of Astrophysics — Research Briefing" theme clean_modern
style radius 12

# --- 1. Title card
say "Star Formation in the *Eagle Nebula*" beat 0.35s enter fade exit fade
wait 3s
crossfade 0.8

# --- 2. Photo: slow zoom, caption, gentle camera drift
show photo @pillars as nebula enter fade
zoom nebula 1.0 to 1.12 over 6s ease smooth
caption nebula "Fig. 1 — The Pillars of Creation, M16"
camera to 1050 500 zoom 1.08 over 5s ease smooth
rotate nebula 1 over 4s delay 1s
fade nebula to 0.85 over 1s delay 4.5s
wait 6s
wipe 0.7

# --- 3. Key figure with citation
count 6500 suffix " ly" label "Distance from Earth" over 2.5s as dist enter rise
source dist "NASA Science" https://science.nasa.gov
unverified dist
pulse dist 0.06 over 0.8s delay 2.6s
shake 3 over 0.3s delay 2.6s
wait 4s
crossfade 0.7

# --- 4. Results with annotations
bars "Observed protostars by region" "Pillar I" 40 "Pillar II" 65 "Pillar III" 80 "Periphery" 95 over 3s enter rise
box at 300 820 size 500 120 over 0.6s delay 3.2s
highlight from 320 880 to 780 880 over 0.6s delay 3.6s
circle at 1450 560 radius 150 over 0.6s delay 4s
wait 5s
push 0.7

# --- 5. Trend with focused camera
line "Publications per year" "2019" 2 "2020" 5 "2021" 9 "2022" 20 over 3s as growth enter fade
camera to 1500 350 zoom 1.3 over 1.2s ease smooth delay 3s
wait 5s
blur 0.6

# --- 6. Press coverage
headline "New images reveal stellar nurseries in unprecedented detail" paper "UNIVERSITY NEWS" body "Researchers from the department analysed infrared data from the James Webb Space Telescope." mark "unprecedented detail" over 3s enter fade
wait 4.5s
crossfade 0.8

# --- 7. Methodology diagram drawn with a loop
let gap = 380
say "Data *pipeline*" at 960 220 beat 0.3s as title enter fade
wait 0.8s
for i from 0 to 3
  arrow from (250 + i*gap) 650 to (450 + i*gap) 650 over 0.4s
  wait 0.3s
end
move title to 960 420 curve 40 over 1.2s ease smooth
scale title 1.1 over 0.6s delay 1.4s
wiggle title over 0.4s delay 2.2s
wait 3.5s
`,
  },
];
