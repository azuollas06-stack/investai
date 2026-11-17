# InvestAI – kasdienės apžvalgos taisyklės

Šis failas yra instrukcija kasdienei automatinei užduočiai (ir žmogui, kuris rašo apžvalgą rankiniu būdu).

## Kas daroma kiekvieną darbo dieną

1. Surenkamos tos dienos naujienos (žr. „Šaltiniai“).
2. Sukuriamas failas `data/digests/YYYY-MM-DD.json` pagal žemiau pateiktą struktūrą.
3. Į `data/index.json` įrašas pridedamas **sąrašo pradžioje**, o `latest` pakeičiamas į naują datą.
4. Patikrinama, ar JSON validus (`python3 -m json.tool failas.json`).
5. Pakeitimai įrašomi (commit) ir išsiunčiami (push) į `main` šaką. GitHub Pages svetainę atnaujina per 1–2 min.

Savaitgaliais ir Baltijos biržų nedarbo dienomis apžvalga nerengiama.

## Šaltiniai (pirmenybės tvarka)

1. **Pirminiai** (`"status": "primary"`): Nasdaq Baltic įmonių pranešimai, GlobeNewswire per Nasdaq platinami pranešimai, įmonių investuotojų puslapiai, Lietuvos banko, ECB ir FED skelbimai.
2. **Žiniasklaida** (`"status": "media"`): LRT „Biržos laikmatis“, vz.lt, ERR, LSM, BNS, Reuters ir kt.
3. **Reikia patikrinti** (`"status": "unverified"`): kai šaltinis vienas ir neaiškus, data neaiški, šaltiniai nesutaria arba skaičius nepavyko rasti originale. Tokiu atveju BŪTINAS laukas `note`, kuriame paaiškinama, kas neaišku.

## Rašymo taisyklės

- Kalba: lietuvių. Trumpai, aiškiai, be žargono (o jei jo reikia, paaiškinti).
- **Perfrazuoti savais žodžiais.** Necituoti straipsnių pastraipų. Kiekvienas teiginys turi turėti šaltinį.
- `text`: tik faktai iš šaltinio. `why`: interpretacija (kodėl tai gali būti svarbu investuotojui). Jų nemaišyti.
- **Jokių kainų prognozių, „pirk / parduok“ ar tikslinių kainų.** Nesakyti, kad akcija „kils“ ar „kris“.
- Jei nežinoma, kodėl kaina pasikeitė, taip ir parašyti: „aiškios priežasties šaltiniuose nerasta“.
- Skaičius ir datas tikrinti pirminiame šaltinyje. Abejojant: `unverified` + `note`.
- Antraštė (`title`): iki ~70 simbolių, apibendrina dieną. `lead`: 1–2 sakiniai.
- 3–8 įrašai iš viso. Kokybė svarbiau nei kiekis.

## JSON struktūra

```json
{
  "date": "YYYY-MM-DD",
  "weekday": "pirmadienis",
  "title": "Dienos antraštė",
  "lead": "1–2 sakinių santrauka.",
  "generated_at": "ISO 8601 laikas su zona",
  "prices_available": false,
  "sections": [
    {
      "id": "rinka",
      "title": "Rinkos nuotaika",
      "items": [
        {
          "headline": "Įrašo antraštė",
          "tags": ["IGN1L", "dividendai"],
          "text": "Faktai.",
          "why": "Kodėl svarbu.",
          "status": "primary | media | unverified",
          "note": "Tik jei unverified: kas neaišku.",
          "sources": [
            { "name": "Šaltinio pavadinimas", "url": "https://...", "type": "primary | media", "published": "ISO laikas" }
          ]
        }
      ]
    },
    { "id": "imones", "title": "Įmonių naujienos", "items": [] }
  ],
  "calendar": [
    { "date": "YYYY-MM-DD", "text": "Įvykis", "url": "https://..." }
  ]
}
```

Sekcijų `id`: `rinka` (bendra nuotaika, indeksai, makro), `imones` (įmonių pranešimai), pasirinktinai `obligacijos` (naujos emisijos, platinimai). `calendar`: tik būsimos datos, artimiausios 3–4 savaitės.
