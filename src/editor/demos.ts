import { SAMPLE_CODE } from "./sampleCode";

export interface Demo { id: string; name: string; code: string }

export const DEMOS: Demo[] = [
  { id: "chernobyl", name: "Chernobyl Explained", code: SAMPLE_CODE },
  {
    id: "webb",
    name: "Webb Telescope",
    code: `project "How Webb Sees the Past" theme lavender_dusk

say "Light is a *time machine*" beat 0.35s
wait 2.5s
crossfade

show photo @pillars as nebula
zoom nebula 1.0 to 1.2 over 6s
caption nebula "Pillars of Creation, Eagle Nebula"
wait 5s
slide

show photo @telescope as webb
zoom webb 1.15 to 1.0 over 5s
caption webb "18 gold-coated mirror segments"
wait 4s
crossfade

bars "Mirror diameter (m)" "Spitzer" 0.85 "Hubble" 2.4 "Webb" 6.5 over 3s
wait 4.5s
crossfade

count 6500 unit "light-years" label "Distance to the Eagle Nebula" over 2s as dist
source dist "NASA" https://science.nasa.gov/mission/webb/
wait 3.5s
`,
  },
  {
    id: "coffee",
    name: "The Price of Coffee",
    code: `project "Why Coffee Got Expensive" theme warm_editorial

headline "Coffee prices hit a record high as harvests fail" paper "THE MORNING LEDGER" body "Drought in Brazil and Vietnam cut supply just as demand kept climbing worldwide." mark "record high" mark "harvests fail" over 3s
wait 4.5s
crossfade

line "Arabica price, $ per lb" "2019" 1.0 "2020" 1.1 "2021" 1.9 "2022" 2.2 "2023" 1.7 "2024" 2.9 over 3s as price
unverified price
wait 4.5s
slide

count 70 suffix "%" label "Share of beans from just five countries" over 2s as share
unverified share
wait 3.5s
cut

say "Your morning cup is a *climate* story" beat 0.35s
wait 3s
`,
  },
  {
    id: "startup",
    name: "Startup Growth",
    code: `project "From Zero to a Million Users" theme clean_modern

say "Year one: *nobody* noticed" beat 0.3s
wait 2.5s
crossfade

line "Monthly users (thousands)" "Jan" 2 "Mar" 5 "May" 14 "Jul" 60 "Sep" 240 "Nov" 1000 over 3s
wait 4.5s
zoom

count 1 suffix "M" label "Users after 11 months" over 1.5s as users
wait 3s
crossfade

bars "Where users came from (%)" "Search" 18 "Ads" 12 "Word of mouth" 70 over 3s
wait 4s
cut

say "Build something people *tell friends about*" beat 0.3s
wait 3s
`,
  },
  {
    id: "ocean",
    name: "Ocean Plastic",
    code: `project "Where Ocean Plastic Comes From" theme ocean_calm

say "8 million tonnes. *Every year.*" beat 0.4s
wait 3s
crossfade

count 8 suffix "M t" label "Plastic entering the ocean each year" over 2s as tonnes
unverified tonnes
wait 3.5s
slide

bars "Sources of ocean plastic (%)" "Rivers" 80 "Fishing gear" 10 "Ships" 10 over 3s
unverified
wait 4.5s
crossfade

say "Clean the *rivers*, save the sea" beat 0.35s
for i from 0 to 2
  circle at (560 + i*400) 840 radius 40 over 0.4s
  wait 0.3s
end
wait 2.5s
`,
  },
];
