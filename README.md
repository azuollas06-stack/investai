# InvestAI

Kasdienė Baltijos akcijų rinkos apžvalga lietuvių kalba, su pirminiais šaltiniais ir pažymėtu patikimumu.

## Kaip veikia

- Statinė svetainė (HTML + CSS + JS, be build žingsnio), talpinama nemokamai GitHub Pages.
- Turinys laikomas JSON failuose `data/`. Svetainė juos nuskaito naršyklėje.
- Kasdien po biržos uždarymo automatinė užduotis paruošia naują `data/digests/YYYY-MM-DD.json` ir atnaujina `data/index.json` (taisyklės: [TURINIO_GIDAS.md](TURINIO_GIDAS.md)).

## Struktūra

```
index.html            naujausia apžvalga (arba ?d=YYYY-MM-DD)
archyvas.html         visos apžvalgos
apie.html             apie projektą ir principai
assets/               stiliai, JS, ikona
data/index.json       apžvalgų sąrašas
data/digests/*.json   dienos apžvalgos
manifest.webmanifest  leidžia „įdiegti“ svetainę telefone (PWA)
```

## Peržiūra savo kompiuteryje

```
python3 -m http.server 8000
```
ir atidaryti http://localhost:8000

## Toliau

- [ ] Dienos akcijų kainų lentelė (labiausiai kilusios / kritusios)
- [ ] Nuosavas domenas
- [ ] El. pašto prenumerata
- [ ] Puslapiai pagal įmonę
