# Stan projektu — Dart Online

> Dokument startowy dla kolejnych modyfikacji. Najpierw przeczytaj ten plik, potem sprawdź tylko pliki związane z planowaną zmianą. Pełny audyt jest potrzebny dopiero wtedy, gdy kod, wdrożenie lub opis poniżej przestaną się zgadzać.

## Metryka stanu

| Pole | Wartość |
|---|---|
| Ostatnia aktualizacja opisu | 2026-08-23 |
| Repozytorium | `marjo2398/dart-online` |
| Stała gałąź | `main` — po sprzątaniu jedyna gałąź |
| Bazowy commit kodu | `6fbbee5` — `Fix PHP 7.4 transaction compatibility` |
| Produkcja | `https://host749284.xce.pl/dart/` |
| Katalog produkcyjny | `public_html/dart` |
| Hosting | Hostido, LiteSpeed, PHP 7.4, PDO SQLite |
| Frontend | React 19, TypeScript 5.8, Vite 6, własny CSS, Lucide React |
| Backend | Jednoplikowe API PHP + SQLite |
| Testy automatyczne | Brak |
| CI | Brak |

Bazowy commit oznacza ostatnią zmianę kodu przed dodaniem tego dokumentu. Późniejsze commity dokumentacyjne mogą mieć inny hash bez zmiany działania aplikacji.

## Najważniejsze zasady dla kolejnego Codexa

1. Nie wykonuj pełnego audytu przy każdej małej zmianie. Zacznij od tego pliku, `git status`, ostatnich commitów i modułu, którego dotyczy zadanie.
2. Nie zapisuj w repozytorium PIN-u, hasła, hasha produkcyjnego, pliku `config.local.php` ani plików SQLite.
3. Na Hostido dotykaj wyłącznie `public_html/dart` oraz kopii tego projektu poza `public_html`. Inne projekty na koncie są osobne i nie wolno ich zmieniać.
4. Nie zmieniaj globalnej wersji PHP domeny. Kod Darta ma pozostać zgodny z PHP 7.4, bo zmiana wersji może wpłynąć na inne strony.
5. Przy aktualizacji zachowaj produkcyjne `api/config.local.php` i cały `api/data/`.
6. Po każdej zmianie zaktualizuj w tym pliku: datę, bazowy commit, stan wdrożenia, wykonane testy i znane ograniczenia.

## Co jest obecnie potwierdzone

| Element | Stan | Sposób potwierdzenia |
|---|---|---|
| Kod na `main` | ✅ | GitHub pokazuje commit `6fbbee5` |
| Wydanie na Hostido | ✅ | pliki są w `public_html/dart` |
| Publiczny frontend | ✅ | otwiera ekran logowania bez komunikatu błędu |
| Start API | ✅ | żądanie sesji zwraca poprawną odpowiedź dla frontendu |
| Konfiguracja produkcyjna | ✅ | serwerowy `config.local.php` zawiera poprawny hash PHP; sekret nie jest w Git |
| SQLite | ✅ | istnieje `api/data/dart-online.sqlite` i chroniący katalog `.htaccess` |
| Inicjalizacja/migracja schematu | ✅ | zachodzi przed odpowiedzią `session`; czysty ekran logowania potwierdza przejście tej ścieżki |
| HTTPS i bezpieczne cookie | ✅ konfiguracja | produkcja działa po HTTPS, `secure_cookie` jest włączone |
| Logowanie prawidłowym PIN-em | ⬜ nietestowane | zgodnie z poleceniem nie wykonywano logowania |
| Operacje zawodników i meczów | ⬜ nietestowane | nie tworzono ani nie kasowano danych produkcyjnych |
| Głos, mikrofon i widok mobilny | ⬜ nietestowane | zależne od urządzenia/przeglądarki |
| Testy automatyczne/build po finalnych poprawkach | ⬜ niewykonywane | zgodnie z poleceniem nie uruchamiano testów |

Ważne: zielony ekran logowania potwierdza łańcuch `frontend → PHP → konfiguracja → sesja → SQLite → migracja → JSON`, ale nie potwierdza poprawności logowania ani funkcji po zalogowaniu.

## Architektura i przepływ danych

1. Przeglądarka ładuje statyczny frontend React z `/dart/`.
2. `src/api.ts` wywołuje `./api/index.php?action=...` i zawsze oczekuje JSON.
3. PHP ładuje konfigurację, uruchamia sesję, otwiera SQLite i wykonuje migracje.
4. Po zalogowaniu wszystkie operacje modyfikujące wymagają sesji oraz tokenu CSRF.
5. Serwer zapisuje wizytę w transakcji, przelicza statystyki i zwraca pełny snapshot meczu.
6. Frontend zastępuje lokalny stan snapshotem z serwera. Backend jest źródłem prawdy.

### Mapa plików

| Plik | Odpowiedzialność |
|---|---|
| `src/App.tsx` | logowanie, panel, zawodnicy, aktywne mecze, historia, wybór parametrów gry |
| `src/components/DartGame.tsx` | ekran meczu, wizyty, bust/checkout, undo, mikrofon, głos sędziego |
| `src/api.ts` | klient HTTP, token CSRF, walidacja odpowiedzi i komunikaty błędów |
| `src/types.ts` | kontrakty danych frontendu |
| `src/index.css` | cały wygląd i responsywność; breakpointy 960 i 680 px |
| `public/api/index.php` | konfiguracja, sesja, migracje, logika meczu, statystyki i wszystkie endpointy |
| `public/api/config.example.php` | bezpieczny wzór konfiguracji; bez sekretów |
| `public/api/.htaccess` | blokada pobierania konfiguracji i cache API |
| `public/api/data/.htaccess` | całkowita blokada dostępu HTTP do bazy |
| `public/.htaccess` | brak listowania katalogów i nagłówki bezpieczeństwa |
| `vite.config.ts` | build względny, proxy lokalne oraz usuwanie prywatnych danych z `dist` |
| `DEPLOY_HOSTIDO.md` | procedura budowania, konfiguracji, wdrażania i kopii danych |

## Funkcje użytkowe

### Logowanie i sesja

- jeden wspólny PIN lub hasło administratora;
- jawny sekret nie jest przechowywany w kodzie ani bazie;
- produkcja przechowuje wyłącznie hash wygenerowany przez PHP;
- sesja ma cookie `HttpOnly`, `Secure` i `SameSite=Strict`;
- po poprawnym logowaniu identyfikator sesji jest regenerowany;
- sesja ma twarde wygaśnięcie; domyślnie po 43 200 sekundach, czyli 12 godzinach;
- wylogowanie czyści dane sesji i cookie;
- po wygaśnięciu lub błędzie CSRF frontend wraca do ekranu logowania;
- pięć nieudanych prób w 15 minut z jednego hasha IP uruchamia limit 429;
- nieudane logowanie ma dodatkowe opóźnienie 250 ms.

Na PHP 7.4 używaj hasha wygenerowanego funkcją `password_hash()` na PHP. Hash bcrypt z prefiksem `$2b$` może nie przejść walidacji `password_get_info()`; produkcyjny format PHP używa `$2y$`.

### Zawodnicy

- dodawanie zawodnika;
- nazwa od 1 do 40 znaków;
- usuwanie wielokrotnych spacji z nazwy;
- blokada znaków sterujących;
- unikalność nazwy bez rozróżniania wielkości liter;
- usunięcie zawodnika usuwa także wszystkie jego mecze i wizyty;
- po usunięciu wszystkie statystyki pozostałych zawodników są odbudowywane.

### Tworzenie i przechowywanie meczów

- dokładnie dwóch różnych, istniejących zawodników;
- wyniki startowe: 301, 501, 701 lub 901;
- formaty: do 1, 2, 3 albo 5 wygranych legów;
- odpowiedniki: BO1, BO3, BO5 i BO9;
- pierwszy leg zaczyna zawodnik 1;
- starter kolejnych legów zmienia się naprzemiennie;
- aktywny mecz można opuścić do panelu i wznowić później;
- stan po wznowieniu jest odtwarzany z zapisanych wizyt, a nie z pamięci przeglądarki;
- lista aktywnych meczów jest trwała;
- historia pokazuje 50 ostatnich zakończonych meczów;
- zakończony mecz można otworzyć ponownie;
- każdy mecz można usunąć po potwierdzeniu; jego wizyty znikają, a statystyki są przeliczane.

### Wprowadzanie wyniku

- ręczny wynik całej wizyty od 0 do 180;
- zwykła wizyta automatycznie zapisuje trzy lotki;
- backend sprawdza, czy wynik jest możliwy z legalnych pól tarczy i podanej liczby lotek;
- po zejściu dokładnie do zera interfejs pyta, czy ostatnia lotka trafiła double;
- checkout musi matematycznie kończyć się podwójnym polem albo bullem 50;
- przy checkoutcie wybiera się faktyczną liczbę użytych lotek: 1, 2 lub 3;
- wynik poniżej zera, pozostawienie 1 albo zejście do zera bez double oznacza bust;
- przy buście wynik wizyty nie jest odejmowany (`applied_score = 0`);
- przy buście również zapisuje się faktyczną liczbę użytych lotek: 1, 2 lub 3;
- kolejność zawodników jest sprawdzana po stronie serwera;
- zapis meczu zakończonego lub ruch niewłaściwego zawodnika zwraca konflikt 409;
- po konflikcie frontend próbuje pobrać świeży snapshot;
- przyciski i operacje są blokowane na czas żądania, aby ograniczyć podwójny zapis.

### Double-out, legi i zakończenie

- każdy leg wymaga checkoutu na double;
- po checkoucie zwiększa się liczba legów zawodnika;
- jeśli wymagany próg nie został osiągnięty, tworzony jest kolejny leg z pełnym wynikiem startowym;
- po osiągnięciu wymaganej liczby legów zwycięzca, czas zakończenia i statystyki zapisują się w tej samej transakcji;
- frontend pokazuje baner zwycięzcy i blokuje dalsze wizyty;
- endpoint `game-finish` istnieje jako ścieżka naprawcza/zgodności, ale obecny frontend go nie wywołuje; normalnie mecz kończy `visit-create`.

### Cofanie

- można cofnąć ostatnią wizytę aktywnego meczu;
- można cofnąć checkout kończący leg;
- można cofnąć wizytę kończącą cały mecz;
- cofnięcie usuwa ostatni rekord wizyty;
- cofnięcie czyści `winner_id` i `finished_at`, więc zakończony mecz wraca do aktywnych;
- stan punktów, kolejka, legi i starter są ponownie wyliczane z historii;
- wszystkie statystyki globalne są odbudowywane po cofnięciu.

### Ekran meczu

- aktualny wynik i aktywny zawodnik;
- wynik legów;
- średnia trzyrzutowa w bieżącym meczu;
- najwyższa wizyta;
- liczba lotek w aktualnym legu;
- suma zdobytych punktów;
- trzy ostatnie wizyty każdego zawodnika w bieżącym legu;
- oznaczenia `BUST` i `CHECK`;
- komunikaty sędziego dla bustu, checkoutu, 180, pozostawionego bulla 50 i prostych double;
- automatyczne ustawianie kursora w polu wyniku, gdy można rzucać.

### Głos i mikrofon

- TTS przeglądarki odczytuje komunikaty w języku polskim;
- głos sędziego można włączyć lub wyłączyć;
- rozpoznawanie mowy używa Web Speech API i języka `pl-PL`;
- nasłuchiwanie ciągłe próbuje się automatycznie wznowić po zakończeniu przez przeglądarkę;
- rozpoznawane są cyfry i podstawowe polskie liczebniki do 180;
- `pudło`/`pudlo` oznacza 0;
- przykładowe komendy: `wynik 60`, `wynik sto osiemdziesiąt`, `cofnij`, `dalej`, `następny`;
- `dalej` i `następny` zapisują wizytę 0;
- mikrofon wymaga HTTPS, zgody użytkownika i wsparcia przeglądarki;
- brak wsparcia nie blokuje ręcznego wpisywania wyników.

## API

Wszystkie odpowiedzi mają jeden z formatów:

```json
{"ok": true, "data": {}}
```

albo:

```json
{"ok": false, "error": {"code": "kod", "message": "opis", "details": {}}}
```

| Metoda | `action` | Sesja/CSRF | Zastosowanie |
|---|---|---|---|
| GET | `session` | bez logowania | odczyt stanu sesji |
| POST | `login` | bez istniejącej sesji | logowanie PIN-em/hasłem |
| POST | `logout` | sesja + CSRF | wylogowanie |
| GET | `dashboard` | sesja | zawodnicy, aktywne mecze i historia |
| GET | `game&id=...` | sesja | pełny snapshot pojedynczego meczu |
| POST | `player-create` | sesja + CSRF | dodanie zawodnika |
| POST | `player-delete` | sesja + CSRF | usunięcie zawodnika i jego danych |
| POST | `game-create` | sesja + CSRF | utworzenie meczu |
| POST | `visit-create` | sesja + CSRF | zapis wizyty, lega lub końca meczu |
| POST | `visit-undo` | sesja + CSRF | cofnięcie ostatniej wizyty |
| POST | `game-finish` | sesja + CSRF | domknięcie już rozegranego meczu; obecny UI nie używa |
| POST | `game-delete` | sesja + CSRF | usunięcie meczu i przeliczenie statystyk |

### Ochrona API

- akceptowany jest tylko właściwy GET/POST dla danej operacji;
- POST wymaga `Content-Type: application/json`;
- maksymalny body requestu to 32 768 bajtów;
- JSON jest dekodowany z wyjątkami i musi być obiektem;
- wszystkie parametry są ponownie walidowane na backendzie;
- operacje zapisu działają w transakcjach z rollbackiem;
- token CSRF jest porównywany przez `hash_equals`;
- komunikaty nie ujawniają treści wyjątków produkcyjnych;
- błędy techniczne trafiają do logu PHP;
- katalogi nie mają listowania;
- konfiguracja i baza są zablokowane przez `.htaccess`;
- API wysyła `no-store`, `nosniff` i `Referrer-Policy: same-origin`.

## Model danych SQLite

| Tabela | Rola | Najważniejsze pola |
|---|---|---|
| `schema_meta` | wersja schematu | `key`, `value` |
| `players` | zawodnicy i wyliczone statystyki | nazwa, W/L, punkty, lotki, progi, checkout, najlepszy leg |
| `games` | parametry i wynik meczu | gracze, zwycięzca, format, wynik startowy, daty |
| `visits` | niezmienna historia wizyt | leg, kolejność, zawodnik, wynik zadeklarowany/zastosowany, lotki, bust/checkout |
| `login_attempts` | limit prób logowania | hash IP i czas próby |

Włączone ustawienia SQLite:

- `foreign_keys = ON`;
- `journal_mode = WAL`;
- `busy_timeout = 5000`;
- `synchronous = NORMAL`;
- wyjątki PDO i fetch jako tablice asocjacyjne.

Schemat ma wersję 2. Migracja potrafi przenieść dane ze starej tabeli `throws` do `visits`, odtworzyć legi i zwycięzców, przebudować statystyki, a następnie usunąć starą tabelę w transakcji.

## Statystyki

| Statystyka | Sposób obliczenia |
|---|---|
| Średnia | `total_points / total_darts_thrown * 3` |
| Rozegrane | zakończone mecze, w których zawodnik był graczem 1 lub 2 |
| Wygrane | zakończone mecze z zawodnikiem jako `winner_id` |
| 100–139 | liczba wizyt z `applied_score` w tym przedziale |
| 140–179 | liczba wizyt z `applied_score` w tym przedziale |
| 180 | liczba wizyt z `applied_score = 180` |
| Najwyższa | maksymalny `applied_score` |
| Najwyższy checkout | maksymalny `applied_score` z `is_checkout = 1` |
| Najlepszy leg | najmniejsza suma `darts_used` zawodnika w wygranym przez niego legu |

Bust ma `applied_score = 0`, ale jego faktyczne `darts_used` liczą się do średniej. To celowe.

Statystyki są przebudowywane po migracji, każdej wizycie, cofnięciu, zakończeniu, usunięciu meczu i usunięciu zawodnika. Dzięki temu operacje kasowania nie pozostawiają starych sum.

## Co fizycznie wprowadzono po audycie

### Główna przebudowa — commit `d9da853`, PR #5

- usunięto niedziałający backend Node/Express oraz pliki `server.ts` i `src/db.ts`;
- zastąpiono backend przez PHP + SQLite dostosowane do zwykłego Hostido;
- usunięto pozostałości AI Studio/Gemini i zależność `@google/genai`;
- usunięto sekrety i nieużywany plik `.env.example`;
- dodano sesję, hash hasła, CSRF, limit logowania i walidację API;
- dodano transakcje i pełną odbudowę statystyk;
- naprawiono zakończenie meczu i zapis zwycięzcy;
- naprawiono usuwanie meczu/zawodnika tak, aby przeliczało statystyki;
- przebudowano frontend tak, aby czekał na odpowiedź serwera i pokazywał błędy;
- dodano blokadę równoległych kliknięć oraz resynchronizację po konflikcie 409;
- zapis bustu i checkoutu przechowuje faktyczną liczbę lotek;
- dodano trwałe wygaśnięcie sesji;
- dodano historię, aktywne mecze, wznowienie i usuwanie;
- dodano `.htaccess`, konfigurację przykładową i instrukcję Hostido;
- build usuwa prywatną konfigurację i lokalną bazę z `dist`;
- zależności zostały uproszczone do Reacta, ikon i narzędzi buildu;
- dodano pełny responsywny interfejs i obsługę błędów.

### Zgodność Hostido PHP 7.4 — commity `cfcb8c3` i `6fbbee5`

- `str_starts_with()` zastąpiono zgodnym `strpos()`;
- `catch (JsonException)` uzupełniono o zmienną wyjątku wymaganą przez PHP 7.4;
- usunięto typ zwrotny `mixed`, który PHP 7.4 interpretował jak nazwę klasy;
- dokumentacja wymaga teraz PHP 7.4+, nie PHP 8.1+;
- produkcyjny hash poprawiono do formatu rozpoznawanego przez PHP 7.4;
- po poprawkach publiczny ekran logowania ładuje się bez błędu serwera.

### Porządek wdrożeniowy

- nowa aplikacja działa wyłącznie pod `/dart/`;
- poprzedni katalog `dartAI` został zarchiwizowany zamiast usunięty;
- kopie projektu znajdują się poza `public_html`;
- stare, scalone gałęzie GitHuba zostały usunięte; pozostawiono `main`;
- pozostałe projekty, katalogi i domeny na Hostido nie były modyfikowane.

## Czego nie zrobiono

- nie ma testów jednostkowych, integracyjnych ani end-to-end;
- nie ma konfiguracji CI/GitHub Actions;
- nie wykonano logowania do produkcji po wdrożeniu;
- nie wykonano produkcyjnego meczu próbnego;
- nie sprawdzono głosu i mikrofonu na docelowym urządzeniu;
- nie sprawdzono układu na rzeczywistym telefonie;
- nie wykonano aktualnego `npm audit` po ostatecznym lockfile;
- nie sprawdzono zachowania pod równoległym obciążeniem wielu kart/użytkowników;
- nie ma osobnych kont, ról ani dziennika administracyjnego — poprawny wspólny PIN daje pełny dostęp, również do kasowania danych;
- backup bazy jest ręczny; nie ma automatycznego harmonogramu kopii.

## Kolejność ręcznych testów

Testuj na dwóch nowych, tymczasowych zawodnikach, aby łatwo rozpoznać oczekiwane statystyki. Przed testami skopiuj `api/config.local.php` i komplet plików SQLite (`.sqlite`, `-wal`, `-shm`, jeśli istnieją) poza `public_html`.

### 0. Bezpieczeństwo danych — najpierw

1. Zrób kopię konfiguracji i bazy.
2. Potwierdź, że działasz w `/dart/`, nie w katalogu innego projektu.
3. Otwórz aplikację w jednej karcie i sprawdź brak komunikatu błędu.

### 1. Logowanie i sesja

1. Zaloguj się poprawnym PIN-em.
2. Odśwież stronę — sesja powinna pozostać aktywna.
3. Wyloguj się — panel powinien zniknąć i wrócić formularz.
4. Zaloguj się ponownie.

Nie zaczynaj od pięciu błędnych prób, bo celowo zablokujesz swoje IP na maksymalnie 15 minut. Limit logowania testuj na końcu.

### 2. Minimalny pełny mecz — najważniejszy test

Utwórz zawodników `TEST-A` i `TEST-B`. Rozpocznij 301, BO1.

1. `TEST-A`: 180 — powinno zostać 121.
2. `TEST-B`: 60 — powinno zostać 241.
3. `TEST-A`: 120 — pozostaje 1, więc wybierz bust i faktyczną liczbę lotek, np. 2.
4. Sprawdź, że wynik `TEST-A` nadal wynosi 121 i kolejka przeszła dalej.
5. Cofnij ostatnią wizytę — powinien wrócić stan sprzed bustu i kolejka `TEST-A`.
6. `TEST-A`: 121, potwierdź double i 3 lotki — mecz powinien się zakończyć.

Oczekiwane statystyki świeżych zawodników po tym scenariuszu:

| Zawodnik | Rozegrane/Wygrane | Punkty/Lotki | AVG | Pozostałe |
|---|---:|---:|---:|---|
| `TEST-A` | 1 / 1 | 301 / 6 | 150,5 | 1×180, 1×100–139, checkout 121, najlepszy leg 6 |
| `TEST-B` | 1 / 0 | 60 / 3 | 60,0 | najwyższa 60 |

### 3. Cofnięcie zakończonego meczu

1. Otwórz zakończony mecz z historii.
2. Cofnij checkout 121.
3. Mecz powinien wrócić do aktywnych, zniknąć z historii i stracić zwycięzcę.
4. W/L, checkout i najlepszy leg powinny się cofnąć.
5. Ponownie zapisz checkout i sprawdź ponowne zakończenie.

### 4. Kasowanie i przebudowa statystyk

1. Usuń zakończony mecz testowy.
2. Statystyki obu testowych zawodników powinny wrócić do zera.
3. Utwórz drugi testowy mecz, potem usuń jednego zawodnika.
4. Powinny zniknąć jego mecze i wizyty, a statystyki przeciwnika powinny się przeliczyć.

### 5. Wznowienie i formaty — później

1. Utwórz aktywny mecz, wpisz kilka wizyt, wróć do panelu i odśwież stronę.
2. Wznów mecz i porównaj wynik, kolejkę, leg i historię wizyt.
3. Sprawdź po jednym meczu 501, 701 i 901.
4. Sprawdź BO3/BO5/BO9.
5. W meczu wielolegów potwierdź, że starter zmienia się: zawodnik 1 w nieparzystych legach, zawodnik 2 w parzystych.

### 6. Walidacja i konflikty — po rdzeniu

1. Spróbuj 181, liczby ujemnej i ułamka — zapis ma zostać odrzucony.
2. Sprawdź niemożliwe wyniki dla 1 lub 2 lotek przy buście/checkoucie.
3. Otwórz ten sam mecz w dwóch kartach i wykonaj ruchy z nieaktualnego stanu.
4. Jedna karta powinna dostać konflikt 409 i pobrać świeży snapshot.
5. Szybko kliknij zapis dwukrotnie — powinna powstać tylko jedna wizyta.

### 7. Głos i urządzenia — na końcu funkcjonalnym

1. Sprawdź Chrome/Edge na HTTPS i zaakceptuj mikrofon.
2. Użyj: `wynik 60`, `wynik sto osiemdziesiąt`, `pudło`, `cofnij`, `dalej`.
3. Sprawdź zatrzymanie i ponowne uruchomienie nasłuchiwania.
4. Włącz/wyłącz TTS sędziego.
5. Sprawdź telefon w pionie i poziomie: panel, modal double/bust, klawiaturę numeryczną, scoreboard i historię.

### 8. Zabezpieczenia — ostatnie

1. Błędny PIN i komunikat 401.
2. Piąta błędna próba w 15 minut i odpowiedź 429 z `Retry-After`.
3. POST bez CSRF i po wylogowaniu — 403/401.
4. Zły `Content-Type`, nieprawidłowy JSON i body powyżej 32 768 bajtów.
5. Próba pobrania `api/config.local.php` i pliku SQLite przez HTTP — dostęp ma być zabroniony.
6. Wygaśnięcie 12-godzinnej sesji sprawdzaj lokalnie ze skróconym czasem w prywatnej konfiguracji, nie zmieniaj produkcji tylko dla testu.

## Procedura kolejnej modyfikacji

1. `git status --short` i `git log -5 --oneline`.
2. Przeczytaj ten dokument oraz tylko pliki odpowiedzialne za zmienianą funkcję.
3. Zrób minimalny patch i nie dodawaj PHP 8-only syntax/functions.
4. Jeśli zmienia się kontrakt API, popraw równocześnie `public/api/index.php`, `src/api.ts` i `src/types.ts`.
5. Jeśli zmienia się stan meczu, zachowaj zasadę: serwer zwraca pełny snapshot, frontend go przyjmuje.
6. Przed wdrożeniem zrób kopię konfiguracji i wszystkich plików SQLite.
7. Wgraj nową zawartość `dist`, zachowując produkcyjne `config.local.php` i `api/data/`.
8. Sprawdź najpierw ekran/sesję, potem minimalny pełny mecz, potem przypadki brzegowe zgodnie z kolejnością powyżej.
9. Zaktualizuj `PROJECT_STATE.md` i dopisz dokładnie, co naprawdę sprawdzono.

## Build i wdrożenie

- `npm run build` tworzy `dist/`; nie jest testem funkcjonalnym;
- `base: './'` pozwala działać pod `/dart/`;
- backend z `public/api/` trafia do `dist/api/`;
- plugin buildu usuwa `dist/api/config.local.php` i cały lokalny `dist/api/data/`, po czym przywraca wyłącznie ochronny `.htaccess`;
- na serwerze Node.js nie jest potrzebny;
- po buildzie wgrywa się zawartość `dist/`, nie sam katalog `dist`;
- przed podmianą plików zachowaj bazę i konfigurację produkcyjną;
- kopia SQLite musi obejmować jednocześnie `.sqlite`, `-wal` i `-shm`, jeśli istnieją;
- stare wydanie archiwizuj zamiast usuwać;
- po wdrożeniu nie zmieniaj innych katalogów `public_html`.

## Kryterium „projekt działa”

Projekt można uznać za w pełni ręcznie sprawdzony dopiero po przejściu sekcji 1–4. Sam ekran logowania oznacza wyłącznie poprawny start aplikacji i API. Głos, warianty meczu, konflikty i zabezpieczenia są kolejnymi warstwami weryfikacji, nie blokują pierwszego testu rdzenia.
