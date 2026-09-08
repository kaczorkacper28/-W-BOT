# 🇵🇱 Żandarmeria Wojskowa RP — ŻW BOT

System RP dla Discorda. Bot korzysta z istniejących kanałów i ról — nie tworzy całej struktury serwera automatycznie.

## Rekrutacja — 3 etapy

1. **👤 Osoba z ulicy → 📋 Podanie publiczne**
   - podstawowe dane RP;
   - doświadczenie;
   - motywacja;
   - dyspozycyjność;
   - decyzja kadry: przyjęcie lub odrzucenie;
   - po przyjęciu nadawana jest istniejąca rola `🎓 Kandydat ŻW` / `Kandydat`.

2. **🎓 Kandydat → 📝 Rekrutacja kandydata**
   - osobny zestaw pytań;
   - automatyczne liczenie wyniku;
   - minimum 70%;
   - przy niezaliczeniu można podejść ponownie;
   - po zaliczeniu odblokowuje się etap końcowy.

3. **🏁 Egzamin końcowy kandydata**
   - osobny zestaw pytań;
   - minimum 70%;
   - wynik zapisuje się w bazie;
   - wynik trafia do kanału wyników rekrutacji.

## System służbowy

- 📄 raporty;
- 📝 meldunki;
- 📜 rozkazy;
- ⬆️ awanse;
- ⬇️ degradacje;
- ➕ plusy;
- ➖ minusy;
- ⚠️ postępowania;
- 🏅 wyróżnienia;
- 🎓 szkolenia;
- 📋 kwalifikacje;
- 🪖 karta funkcjonariusza;
- 🟢 rozpoczęcie i 🔴 zakończenie służby;
- 📊 statystyki;
- 🆘 prywatne tickety pomocy.

## Tickety

Panel pomocy może zostać opublikowany w istniejącym `kontakt`. Ticket jest prywatny dla zgłaszającego i uprawnionej kadry. Bot nie tworzy kategorii ani kanałów organizacyjnych — wymaga istniejącej kategorii ticketów/rekrutacji.

## Uruchomienie

1. Node.js 20+.
2. `npm install`.
3. Uzupełnij `.env`: `TOKEN`, `CLIENT_ID`, `GUILD_ID`, opcjonalnie `STAFF_ROLE_IDS`.
4. `npm start`.

Aktualny entrypoint: `src/zw-system-v2.js`.

Projekt jest przeznaczony do fikcyjnego RP i nie jest oficjalnym systemem Żandarmerii Wojskowej.
