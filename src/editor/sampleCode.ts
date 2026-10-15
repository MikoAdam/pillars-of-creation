export const SAMPLE_CODE = `project "Chernobyl Explained" theme dark_documentary

show photo @reactor_wide as reactor
zoom reactor 1.0 to 1.15 over 6s
caption reactor "Reactor 4, April 1986"
wait 4s
cut

count 3.6 unit "roentgen per hour" over 2s as dose
source dose "IAEA" https://example.org
unverified dose
wait 3s
crossfade

bars "Deaths by estimate" "Official" 31 "WHO estimate" 4000 over 4s
wait 5s
cut

say "One mistake changed *everything*" at 960 540 beat 0.4s
wait 2s

# turtle pattern: three arrows, one after another
for i from 0 to 2
  arrow from (300 + i*500) 900 to (500 + i*500) 800 over 0.5s
  wait 0.4s
end
wait 2s
`;
