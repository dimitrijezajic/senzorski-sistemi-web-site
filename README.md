# ITSenzori

Sajt za predmet **Informacione tehnologije u senzorskim sistemima** (FTN Čačak).
Prikazuje merenja senzora: učitavanje CSV-a, grafik, statistiku i tabelu.

## Struktura

```
ITSenzori/
├── index.html        # stranica
├── styles.css        # izgled
├── script.js         # logika (CSV, grafik, statistika)
├── data/
│   └── merenja.csv   # tvoja merenja (učitavaju se automatski)
└── img/              # slike (dodaj sam)
    ├── firma1.jpg
    ├── firma2.jpg
    ├── data.jpg      # EasySense
    ├── ftn.png
    ├── insta.png
    └── pdf.png
```

## Šta da izmeniš

1. **index.html** — svoje ime i indeks (u `<title>` i u podnožju), nazive i linkove firmi,
   i ID YouTube videa (deo posle `/embed/`).
2. **data/merenja.csv** — zameni svojim CSV-om sa data logger-a. Format: prvi red = nazivi
   kolona, drugi red = jedinice, zatim redovi sa vrednostima. Prva kolona je x-osa (vreme).
   Kolona `Comment` se automatski preskače.
3. **img/** — ubaci svoje slike pod tim imenima. Ako neka fali, sajt radi normalno
   (kartica pokaže gradijent umesto slike).

## Objava na GitHub Pages

1. Napravi javni repozitorijum `ITSenzori`.
2. Otpremi sve fajlove (Add file → Upload files).
3. Settings → Pages → Source: grana `main`, folder `/root` → Save.
4. Link: `https://<tvoj-nalog>.github.io/ITSenzori/`

## Napravljeno drugačije od uzora

Bez Bootstrap-a i jQuery-ja; drugi fontovi i boje; drag & drop upload; kartice sa
statistikom (min/max/prosek); grafik na Chart.js v4; dugmad za preuzimanje CSV-a i grafika
kao slike; traka napretka skrolovanja i animirani talas u zaglavlju.
# senzorski-sistemi-web-site
