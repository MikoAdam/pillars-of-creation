/**
 * Pillars of Creation Maps — Showcase Demo
 *
 * Membership colour gradient (all blues, darkest = oldest):
 *   1957 founders : #003fa3
 *   1973          : #1a62c8
 *   1981          : #2c82e0
 *   1986          : #3591e8
 *   1995          : #3fa0f0
 *   2004          : #5abdf8
 *   2007          : #6dc7fc
 *   2013          : #80d0ff
 *   Ukraine cand. : #f59e0b
 *   Other cand.   : goldenrod
 */

const EXAMPLES = {

    showcase: {
        title: 'The European Union — A Continent Transformed',
        description: 'From six founding nations to 27 — and the shock that shook it.',
        script: `rename: Germany, "West Germany", 50.8, 9.0
---
# THE EUROPEAN UNION — A CONTINENT TRANSFORMED

# ── 1957: THE FOUNDING SIX ──────────────────────────────────────

cinematic: 50, 8, 4, 20, 0
wait: 1.5s

year: "1957"
wait: 300ms

bubble: "March 25, 1957 — six nations sign the Treaty of Rome. The Germany that joins is West Germany only. The eastern half remains behind the Iron Curtain.", #003fa3
wait: 5.5s
remove: last

france: #003fa3, pulse
wait: 280ms
region: Nordrhein-Westfalen, Germany, #003fa3
wait: 35ms
region: Bayern, Germany, #003fa3
wait: 35ms
region: Baden-Württemberg, Germany, #003fa3
wait: 35ms
region: Niedersachsen, Germany, #003fa3
wait: 35ms
region: Hessen, Germany, #003fa3
wait: 35ms
region: Rheinland-Pfalz, Germany, #003fa3
wait: 35ms
region: Saarland, Germany, #003fa3
wait: 35ms
region: Schleswig-Holstein, Germany, #003fa3
wait: 35ms
region: Hamburg, Germany, #003fa3
wait: 35ms
region: Bremen, Germany, #003fa3
wait: 280ms
italy: #003fa3, pulse
wait: 280ms
belgium: #003fa3, pulse
wait: 280ms
netherlands: #003fa3, pulse
wait: 280ms
luxembourg: #003fa3, pulse
wait: 1s

bubble: "One market, open borders, shared institutions — built so war between them becomes structurally impossible.", #003fa3
wait: 5s
remove: last

legend: "Founding Six — 1957", #003fa3

# ── 1973: THE DOOR OPENS ────────────────────────────────────────

year: "1973"
wait: 300ms

fly: 55, 1, 4.5
wait: 1.5s

bubble: "De Gaulle vetoed British membership twice. After his resignation, the door finally opens.", white
wait: 5s
remove: last

united kingdom: #1a62c8, fade
wait: 350ms
ireland: #1a62c8, fade
wait: 350ms
denmark: #1a62c8, fade
wait: 700ms

bubble: "Britain, Ireland, and Denmark join — the EEC's first enlargement.", #1a62c8
wait: 4s
remove: last

legend: "1973 — UK, Ireland, Denmark", #1a62c8

# ── 1981: GREECE ────────────────────────────────────────────────

year: "1981"
wait: 300ms

fly: 38, 24, 5.5
wait: 1.5s

bubble: "Three dictatorships crumbled in two years — Portugal in April 1974, Greece that July, Spain after Franco's death in November 1975.", white
wait: 5.5s
remove: last

greece: #2c82e0, fade
wait: 700ms

bubble: "Greece joins in 1981 — the first of the three to accede, bringing the Community to the Aegean.", #2c82e0
wait: 4.5s
remove: last

legend: "1981 — Greece", #2c82e0

# ── 1986: SPAIN & PORTUGAL ──────────────────────────────────────

year: "1986"
wait: 300ms

fly: 39, -4, 4.5
wait: 1.5s

spain: #3591e8, fade
wait: 400ms
portugal: #3591e8, fade
wait: 700ms

bubble: "Spain and Portugal complete the southern enlargement in 1986. All three former dictatorships now inside the Union.", #3591e8
wait: 5s
remove: last

legend: "1986 — Spain, Portugal", #3591e8

# ── 1990: GERMAN REUNIFICATION ──────────────────────────────────

year: "1990"
wait: 300ms

fly: 51, 11, 5.0
wait: 1.5s

bubble: "The Berlin Wall fell on November 9, 1989. Within a year, Germany was whole again.", white
wait: 5s
remove: last

region: Brandenburg, Germany, #003fa3
wait: 50ms
region: Mecklenburg-Vorpommern, Germany, #003fa3
wait: 50ms
region: Sachsen, Germany, #003fa3
wait: 50ms
region: Sachsen-Anhalt, Germany, #003fa3
wait: 50ms
region: Thüringen, Germany, #003fa3
wait: 700ms

bubble: "Five eastern states join the Federal Republic. The EU gains 16 million new citizens at once, with no new accession vote required.", #003fa3
wait: 5.5s
remove: last

unrename: Germany
germany: #003fa3, pulse
wait: 500ms
clearRegions: Germany
wait: 500ms

# ── 1995: COLD WAR NEUTRALS ─────────────────────────────────────

year: "1995"
wait: 300ms

fly: 55, 17, 2.9
wait: 1.5s

bubble: "Austria, Finland, and Sweden stayed neutral throughout the Cold War. With the Soviet Union gone, there is nothing left to be neutral about.", white
wait: 6s
remove: last

austria: #3fa0f0, fade
wait: 350ms
finland: #3fa0f0, fade
wait: 350ms
sweden: #3fa0f0, fade
wait: 700ms

bubble: "Three Cold War neutrals join. The EU reaches the Arctic.", #3fa0f0
wait: 4s
remove: last

legend: "1995 — Austria, Finland, Sweden", #3fa0f0

# ── 2004: THE BIG BANG ──────────────────────────────────────────

year: "2004", highlight
wait: 300ms

fly: 47, 22, 3.1
wait: 1.5s

bubble: "May 1, 2004 — ten countries join in a single day. The largest expansion in EU history.", #5abdf8
wait: 4.5s
remove: last

poland: #5abdf8, pulse
wait: 130ms
czechia: #5abdf8, pulse
wait: 130ms
hungary: #5abdf8, pulse
wait: 130ms
slovakia: #5abdf8, pulse
wait: 130ms
slovenia: #5abdf8, pulse
wait: 130ms
estonia: #5abdf8, pulse
wait: 130ms
latvia: #5abdf8, pulse
wait: 130ms
lithuania: #5abdf8, pulse
wait: 130ms
malta: #5abdf8, pulse
wait: 130ms
cyprus: #5abdf8, pulse
wait: 700ms

bubble: "Nearly 75 million new citizens overnight. Countries behind the Iron Curtain just 15 years ago.", #5abdf8
wait: 5s
remove: last

legend: "2004 — Big Bang (10 states)", #5abdf8

# ── 2007: ROMANIA & BULGARIA ────────────────────────────────────

year: "2007"
wait: 300ms

fly: 44, 28, 4.0
wait: 1.5s

bubble: "Romania and Bulgaria join in 2007, bringing the EU to the Black Sea — former Warsaw Pact members, now full EU citizens.", white
wait: 5.5s
remove: last

romania: #6dc7fc, pulse
wait: 350ms
bulgaria: #6dc7fc, pulse
wait: 700ms

bubble: "Countries that were behind the Iron Curtain just 18 years earlier.", #6dc7fc
wait: 4s
remove: last

legend: "2007 — Romania, Bulgaria", #6dc7fc

# ── 2013: CROATIA ───────────────────────────────────────────────

year: "2013"
wait: 300ms

fly: 45, 16, 6.0
wait: 1.5s

croatia: #80d0ff, pulse
wait: 700ms

bubble: "Croatia in 2013 adds nearly the entire eastern Adriatic coastline — the EU's last enlargement to date.", #80d0ff
wait: 5s
remove: last

legend: "2013 — Croatia", #80d0ff

# ── PEAK: 28 MEMBERS ────────────────────────────────────────────

fly: 50, 15, 3.5
wait: 1.5s

year: "2013"
wait: 300ms

bubble: "28 member states. More than 500 million people. The world's largest trading bloc — built in 56 years from six countries and one treaty.", #003fa3
wait: 6s
remove: last

# ── 2020: BREXIT ────────────────────────────────────────────────

year: "2016 — Jun 23", highlight
wait: 300ms

zoom: United Kingdom
wait: 1.5s

bubble: "51.9% vote Leave. Britain triggers Article 50 — the exit clause no one thought would ever be used.", red
wait: 5.5s
remove: last

united kingdom: red, sweep
wait: 1s

bubble: "January 31, 2020 — 47 years of membership ends.", red
wait: 4.5s
remove: last

legend: "2020 — Brexit", red

# ── 2022: UKRAINE — INVASION AND EU CANDIDACY ───────────────────

year: "2022", highlight
wait: 300ms

fly: 49, 32, 5.0
wait: 1.5s

ukraine: #f59e0b, fade
wait: 700ms

bubble: "February 24, 2022. Russia launches a full-scale invasion of Ukraine — the largest land war in Europe since 1945.", red
wait: 5.5s
remove: last

attack: 52.0 30.0, 50.5 30.4, red, 0.4, 2
wait: 200ms
attack: 50.0 39.5, 49.2 36.5, red, 0.1, 2
wait: 200ms
attack: 48.5 40.0, 48.0 37.5, red, 0.0, 1.5
wait: 200ms
attack: 45.5 34.0, 46.8 33.0, red, -0.3, 1.5
wait: 1.5s

bubble: "Forces advance from the north toward Kyiv, from the east toward Kharkiv and Donbas, and northward from occupied Crimea.", red
wait: 5s
remove: last

remove: arrows
wait: 300ms

region: Crimea, Ukraine, red, occupied
wait: 100ms
region: Sevastopol, Ukraine, red, occupied
wait: 200ms
region: Donetsk, Ukraine, red, occupied
wait: 150ms
region: Luhansk, Ukraine, red, occupied
wait: 150ms
region: Zaporizhzhia, Ukraine, red, occupied
wait: 150ms
region: Kherson, Ukraine, red, occupied
wait: 700ms

bubble: "Russia illegally annexes Crimea and Sevastopol (seized in 2014), Donetsk, Luhansk, Zaporizhzhia, and Kherson. Ukraine loses 20% of its territory.", red
wait: 6s
remove: last

bubble: "Ukraine applied for EU membership four days after the invasion began. Candidate status was granted in June 2022 — the fastest application in EU history.", #f59e0b
wait: 5.5s
remove: last

legend: "Candidate — Ukraine", #f59e0b

# ── TODAY: OTHER CANDIDATES ─────────────────────────────────────

year: "Today"
wait: 300ms

fly: 44, 22, 4.0
wait: 1.5s

bubble: "Eight more countries hold official candidate status — the Western Balkans, the South Caucasus, and the world's longest-waiting applicant.", goldenrod
wait: 5.5s
remove: last

albania: goldenrod, fade
wait: 130ms
north macedonia: goldenrod, fade
wait: 130ms
montenegro: goldenrod, fade
wait: 130ms
serbia: goldenrod, fade
wait: 130ms
bosnia and herzegovina: goldenrod, fade
wait: 130ms
moldova: goldenrod, fade
wait: 130ms
georgia: goldenrod, fade
wait: 700ms

fly: 39, 33, 4.5
wait: 1.5s

turkey: goldenrod, fade
wait: 700ms

bubble: "Turkey has been an official EU candidate since December 1999 — the longest of any country. Accession talks opened in 2005 but have been effectively frozen since 2018.", goldenrod
wait: 6.5s
remove: last

fly: 50, 20, 3.5
wait: 1.5s

bubble: "Albania, North Macedonia, Montenegro, Serbia, Bosnia, Moldova, Georgia, and Turkey — eight candidates, each waiting for the moment that once came for 27 others.", goldenrod
wait: 7s
remove: last

legend: "Other candidates", goldenrod

# ── EPILOGUE ────────────────────────────────────────────────────

fly: 50, 20, 3.5
wait: 2s

bubble: "27 members. Nine candidates. A union that began with six countries and a hope that Europe would never again destroy itself.", #003fa3
wait: 7s
remove: last

wait: 2s`
    }

};
