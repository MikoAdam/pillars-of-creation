export const SAMPLE_CODE = `project "Chernobyl Explained" theme clean_modern

show photo @reactor_wide as reactor
zoom reactor 1.0 to 1.15 over 6s
caption reactor "Reactor 4, April 1986"
camera zoom 1.12 over 4s ease smooth
wait 4s
whip 0.5

count 3.6 unit "roentgen per hour" over 2s as dose enter pop
source dose "IAEA" https://example.org
unverified dose
pulse dose over 0.6s delay 2s
wait 3s
wipe 0.6

bars "Deaths by estimate" "Official" 31 "WHO estimate" 4000 over 3s enter rise
camera to 1100 600 zoom 1.25 over 2s ease snap delay 2s
wait 5s
blur 0.6

say "One mistake changed *everything*" at 960 540 beat 0.4s enter blur
shake 18 over 0.5s delay 1.2s
wait 2s

# turtle pattern: three arrows, one after another
for i from 0 to 2
  arrow from (300 + i*500) 900 to (500 + i*500) 800 over 0.5s
  wait 0.4s
end
wait 2s
`;
