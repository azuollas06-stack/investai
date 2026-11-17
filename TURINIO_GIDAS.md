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
- **Žymos (`tags`) – privalomos įmonių įrašams:** pirmoji žyma visada yra biržos simbolis be biržos prefikso (pvz., `IGN1L`, `LHV1T`, `NVDA`). Pagal ją „Mano portfelis“ puslapis parodo vartotojui, kad apžvalgoje minimas jo turimas aktyvas. Jei įmonė turi tik obligacijas, pirmoji žyma – įmonės pavadinimas (pvz., `Civinity`).

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

---

# „Kodėl kilo / krito?“ paaiškinimai (`data/explain.json`)

Kasdienė užduotis, be apžvalgos, atnaujina paaiškinimus, kodėl keitėsi populiarių aktyvų kainos. Jie rodomi portfelio pozicijų kortelėse ir aktyvų puslapiuose.

## Ką aprėpti kiekvieną dieną

1. **Būtinai** – aktyvai iš `data/assets.json`, kurie per paskutines 1–5 prekybos dienas pajudėjo bent ~5 % (akcijos) arba ~8 % (kriptovaliutos), arba turėjo svarbią naujieną (rezultatai, prognozių keitimas, vadovų pasikeitimai, sandoriai, teisinės problemos).
2. Pirmenybė: JAV didžiosios ir populiarios mažmeninių investuotojų akcijos (NVDA, AAPL, MSFT, TSLA, PLTR, RKLB, IONQ ir pan.), Europos gynybos akcijos (RHM, Saab, Leonardo ir kt.), Baltijos akcijos (IGN1L, LHV1T, TEL1L ir kt.), BTC, ETH.
3. Kasdien atnaujinti 5–12 paaiškinimų. Kokybė svarbiau nei kiekis.
4. Įrašus, senesnius nei 21 diena, ištrinti.

## Struktūra

Raktas – tikslus `s` simbolis iš `data/assets.json` (pvz., `NASDAQ:NVDA`, `XETR:RHM`). Jei aktyvo sąraše nėra, jį pirmiausia pridėti į `data/assets.json` (su sektoriumi, šalimi, tipu).

```json
"NASDAQ:NVDA": {
  "date": "YYYY-MM-DD",
  "direction": "up | down | mixed",
  "move": "Trumpas pokytis, pvz. „≈ −35 % nuo spalio 6 d. piko“ arba „+12 % per savaitę“",
  "headline": "Viena eilutė – pagrindinė priežastis",
  "points": ["2–4 faktai su datomis ir skaičiais, savais žodžiais"],
  "context": "Neprivaloma: kas artėja (rezultatų data, renginys) arba kaip įprastai svyruoja",
  "status": "primary | media | unverified",
  "sources": [{ "name": "Šaltinis: tema", "url": "https://...", "published": "YYYY-MM-DD" }]
}
```

## Taisyklės

- Kiekvienas skaičius ir data – iš šaltinio; bent 2 šaltiniai, jei įmanoma – vienas pirminis (bendrovės pranešimas, SEC, biržos pranešimas).
- **Jokių prognozių ir rekomendacijų.** Nerašyti „gera proga pirkti“, „verta parduoti“, „turėtų atsigauti“. Analitikų tikslines kainas galima minėti tik kaip faktą su šaltiniu.
- Jei priežastis neaiški – taip ir parašyti („aiškios priežasties šaltiniuose nerasta; krito kartu su visu sektoriumi“) ir `status: "unverified"`.
- Jautrias asmenines detales (pvz., vadovų privatus gyvenimas) minėti tik tiek, kiek būtina, neutraliai.
- `move` ir procentai turi atitikti šaltinių duomenis; jei skaičiuoji pats (pvz., nuo piko), naudok šaltinių kainas.

---

# Naujienos ir įvykiai (`data/news.json`)

Puslapis `naujienos.html`, pradžios puslapio blokas „Naujienos ir įvykiai“ ir aktyvo puslapio nuorodos ima duomenis iš `data/news.json`. Kasdienė užduotis jį atnaujina kartu su apžvalga.

## Struktūra

```json
{
  "updated": "YYYY-MM-DD",
  "events": [
    { "date": "YYYY-MM-DD", "kind": "ipo | earnings | macro | company | bonds | dividend", "title": "Trumpai, kas vyks", "symbols": ["NASDAQ:NVDA"], "url": "https://šaltinis" }
  ],
  "stories": [
    {
      "id": "trumpas-id-be-tarpu",
      "date": "YYYY-MM-DD",
      "kind": "ipo | earnings | macro | company | bonds | dividend",
      "title": "Antraštė",
      "symbols": ["NASDAQ:NVDA"],
      "lead": "2–3 sakiniai: kas nutiko ar nutiks",
      "facts": ["3–6 faktai su skaičiais, savais žodžiais"],
      "pro": [{ "who": "Kas taip mano", "text": "Jų argumentas savais žodžiais", "source": "Leidinys" }],
      "con": [{ "who": "Kas taip mano", "text": "Jų argumentas savais žodžiais", "source": "Leidinys" }],
      "disclosure": "Neprivaloma – interesų konflikto atskleidimas",
      "status": "primary | media | unverified",
      "sources": [{ "name": "Šaltinis: tema", "url": "https://...", "published": "YYYY-MM-DD" }]
    }
  ]
}
```

## Taisyklės

- **Įvykiai:** tik su konkrečia data ir šaltiniu. Praėjusius įvykius, senesnius nei 14 d., pašalinti. Laikyti ~6–12 artimiausių įvykių (IPO, didžiųjų įmonių rezultatai, FED/ECB sprendimai, Baltijos įmonių susirinkimai, dividendų datos, obligacijų emisijos).
- **Istorijos:** 2–5 svarbiausios, naujausia viršuje. Senesnes nei ~10 d. pašalinti, nebent tema vis dar aktuali.
- **Nuomonės:** `pro` ir `con` – abi pusės, kiekviena su konkrečiu autoriumi ar leidiniu. Savais žodžiais, citatos – ne ilgesnės nei kelios žodžių. InvestAI pats nevertina.
- **Jokių rekomendacijų** („pirkti“, „verta“, „gera proga“) ir kainų prognozių.
- **Anthropic interesų konfliktas:** turinį rengia Claude (Anthropic modelis). Bet kuriai istorijai apie Anthropic (pvz., ANT akcijas) privalomas laukas `disclosure`; pateikti tik faktus ir subalansuotas trečiųjų šalių nuomones, be jokio savo vertinimo, ir vienodai detaliai abi puses.
- Jei istorijos aktyvo nėra `data/assets.json`, jį pridėti (kaip ir paaiškinimams).
