# 🇵🇱 Żandarmeria Wojskowa RP — ŻW BOT

Pierwsza kompletna wersja projektu bota Discord dla realistycznego serwera Żandarmerii Wojskowej RP.

## Co jest już zbudowane
- automatyczna struktura serwera;
- osobne stopnie wojskowe i stanowiska funkcyjne;
- piony i jednostki ŻW;
- numery służbowe `ŻW-0001`;
- trwała baza danych `data/zw-data.json`;
- karty służbowe;
- awanse, degradacje i status służby;
- rekrutacja i formularz podania;
- egzamin kandydata;
- logi podań, egzaminów, wejść/wyjść i zmian kadrowych;
- kanały dowództwa i logów chronione przed obywatelami;
- automatyczna rola `👤 Obywatel` po wejściu.

## Separacja widoczności

### 👤 Obywatel
Widoczne są wyłącznie:
- `🇵🇱 INFORMACJE DLA OBYWATELI`;
- `🎓 REKRUTACJA — PUBLICZNA`.

Obywatel nie widzi służby, kadr, jednostek, pionów, dowództwa, logów ani wewnętrznych podań.

### 🎓 Kandydat ŻW
Po nadaniu roli kandydat otrzymuje dostęp do prywatnej strefy rekrutacji i egzaminu oraz do materiałów przeznaczonych dla kandydatów.

### 🛡️ Żołnierz ŻW
Dostęp do służby, kadr, szkoleń, jednostek i pionów.

### 👑 Dowództwo
Dodatkowo: gabinet, narady, dokumenty dowództwa i logi.

## Uruchomienie

1. Node.js 20+.
2. `npm install`
3. Skopiuj `env.example` do `.env`.
4. Uzupełnij `TOKEN`, `CLIENT_ID`, `GUILD_ID`.
5. `npm start`

Bot potrzebuje uprawnień do zarządzania kanałami, rolami i wiadomościami. Rola `🤖 ŻW BOT` musi być wyżej od ról, którymi bot ma zarządzać.

## Zachowane wcześniejsze pliki

Poprzednie pliki projektu nie zostały usunięte. `src/index.js` oraz `src/index-v1.js` pozostają w repozytorium. Aktualnie `npm start` uruchamia `src/index-v2.js`.

Projekt jest przeznaczony do fikcyjnego RP i nie jest oficjalnym systemem Żandarmerii Wojskowej.
