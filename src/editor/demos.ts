import { SAMPLE_CODE } from "./sampleCode";

export interface Demo { id: string; name: string; code: string }

export const DEMOS: Demo[] = [
  { id: "chernobyl", name: "Chernobyl Explained", code: SAMPLE_CODE },
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
];
