# 🇵🇱 Żandarmeria Wojskowa RP — ŻW BOT

System Discord dla realistycznego serwera Żandarmerii Wojskowej RP.

## Funkcje
- automatyczne tworzenie struktury serwera;
- osobne role stopni wojskowych i stanowisk funkcyjnych;
- role pionów ŻW i statusów służby;
- system numerów służbowych ŻW-0001;
- karty służbowe;
- awanse i degradacje;
- status służby;
- panel rekrutacyjny;
- podania kandydatów;
- egzamin kandydata;
- wyniki egzaminów;
- kanały jednostek i pionów;
- kanały dowództwa i logów.

## Widoczność
Serwer jest rozdzielony na strefy:

### 👤 Obywatel
Obywatel otrzymuje rolę `👤 Obywatel` i widzi wyłącznie kategorię `🇵🇱 INFORMACJE DLA OBYWATELI` oraz publiczny panel rekrutacyjny.

### 🎓 Kandydat ŻW
Po rozpoczęciu rekrutacji kandydat powinien otrzymać rolę `🎓 Kandydat ŻW`. Kanały rekrutacyjne i egzaminacyjne są przeznaczone dla kandydatów oraz kadry.

### 🛡️ Kadra
Kadra ma dostęp do kanałów służbowych, kadr, szkoleń, jednostek i pionów.

### 👑 Dowództwo
Dowództwo ma dodatkowy dostęp do dokumentów dowództwa i logów.

## Uruchomienie
1. Zainstaluj Node.js 20+.
2. Wykonaj `npm install`.
3. Skopiuj `.env.example` do `.env`.
4. Uzupełnij `TOKEN`, `CLIENT_ID` i `GUILD_ID`.
5. Bot musi mieć na serwerze uprawnienia do zarządzania kanałami, rolami i wiadomościami.
6. Rola `ŻW BOT` musi znajdować się wyżej niż role, którymi bot ma zarządzać.
7. Uruchom `npm start`.

## Ważne
To projekt RP. Nazewnictwo i procesy można dostosować do regulaminu konkretnego serwera bez udawania, że bot jest oficjalnym systemem Żandarmerii Wojskowej.
