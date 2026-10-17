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
];
