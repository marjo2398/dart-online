# Weryfikacja WWW — etapy 1–3


## Etap 3 — 29.10.2026, nowe lokalne fixture

Definicje [METRICS v1](METRICS.md) zapisano przed obliczeniami i oczekiwaniami testów. Oczekiwania ręczne, nie generowane kodem metryk: Ala w trzech legach40/6,40/1,100/9 →180/16, AVG3=33,75 (nie średnia średnich); first-nine100/9×3=33⅓, pokrycie1/3;3 checkouty/4 jawne próby=75%,3/6 wizyt z możliwością=50%, pokrycie prób4/6. Bust Bartka za60 przy40 zużywa jedną faktyczną lotkę i daje0 pkt. Oddzielne checkouty w1/2/3 lotkach, double-in S20 przed otwarciem nie odejmuje pkt, zużywa lotkę; przekroczenie granicy9 wewnątrz sumy pozostaje nieznane.

| Kontrola | Wynik | Zakres |
|---|---|---|
| `node backendtests/analysis.mjs` | 9 grup PASS | Ręczne mianowniki/first-nine/dwa checkout %, brak vs0, pasma/double, długości1/2/3, double-in, granica9, preview/korekta/wycofanie/retry, statusy/admin/lock/reopen, gość/profil/archiwum, stary delete/new-game, konflikty scalania i alias bez zmiany uczestników, sprzęt/snapshot/filtr właściciela, CSV/JSON zgodny z filtrem/Polskie znaki/cytowanie/formuły/brak sekretów, oba DST Warszawy, keyset i nowy mecz, odmowy ról. Wymuszony błąd po zmianie aliasu cofa całość; identyczny retry zapisuje raz. Sprzeczne próby checkoutu cofają również rzut. |
| `node backendtests/migration-profiles.mjs` | PASS | Rzeczywisty schematv5 z48b55f2: gracze/mecze/wizyty/lotki/komendy/audyt/wersje/decyzje/urządzenia/szablony/sekwencje identyczne w dawnych polach; stare próby/cele/poziomy nieznane; powtórzenie no-op; błąd po dodaniu kolumn cofa całą migrację do5; integralność/FK i skorygowana częściowa wizyta zachowane. |
| `node backendtests/analysis-scale.mjs` | PASS |1200 zakończonych501 i6000 wizyt: niezależne601200pkt/10800lotek, AVG3 i first-nine167; ostatnie10:5010pkt; dwie strony1200..1181 i1180..1161, plan używa idx_games_rules_date. Lokalnie0,251s, peak30MiB PHP. To pomiar fixture laptopa, bez wniosku o wydajności hostingu. |
| Regresja API / operacji / formatów |19/19 /12 /13 grup PASS | Zmieniono wspólny schemat/adnotacje/cofanie i replay kontekstu, dlatego wykonano ukierunkowaną regresję etapów1–2, w tym kamerę, transakcje i idempotencję. Zmieniono oczekiwanie schematu6 i jawnej blokady player-delete. |
| Migracje v3/v4→v6; klient WWW | PASS;9 kontroli PASS | Zachowane starsze kontrole z porównaniem wszystkich dawnych kolumn; nowe kolumny usuwane tylko z porównania do dawnego fixture. Bez osłabiania dawnych oczekiwań. |
| TypeScript/Vite, składnia wszystkich6 modułów PHP | PASS | Bez nowych/aktualizowanych zależności. PHP8.5.12 lokalnie; osobnego wykonania na7.4 nie było. Paczka nie zawiera config.local.php ani lokalnej bazy. |
| Przepływ przeglądarki / rzeczywisty download | PASS | Gość→trwały profil z tym samym ID, preferencja double, mecz501 do1; extended180(0 prób), quick0, extended180(0 prób), quick0, extended141(1 próba)/3 lotki: AVG167. Korekta141→131: aktywny mecz, AVG163,67, dawny checkout/wygrana znikają. Quick0 i rzeczywiste D5 z celem D5/próbą:501/10, AVG150,3, first-nine163,67. Archiwum ukrywa w nowej grze, raport/historia zachowane. CSV pobrany przez UI,501/10 i oba checkout %100 oraz50 zgodne z widokiem. Zmiana nazwy zachowuje ID/mecz; preview/scalenie aliasu nie podwaja danych, widok odświeża. Okres A bez danych, B:1 mecz/10lotek/150,3/100%/50%. |

Wizualnie sprawdzono raport i tabelę porównania. Raport ma przycisk przeglądarkowego druku i arkusz izolujący sam raport, bez biblioteki PDF. Fizycznego wydruku nie wykonano. Brak nowej APK, testów Androida, telefonu i fizycznej kamery; uprawnienia/stare żądania sprawdzono w API i kodzie OnlineModels/OnlineRepository/OnlineViewModel. Nie używano bazy ani sekretów produkcji, nie wykonywano audytu całego repo i nie powtarzano zaliczonych kontroli bez nowej zmiany.
## Etap 2 — 29.10.2026, wyłącznie lokalne fixture

| Kontrola | Wynik | Zakres |
|---|---|---|
| `node backendtests/operations.mjs` | 12 grup PASS | Suma/pola/pozostało, nieosiągalne i niejednoznaczne wpisy, legalność przed bust/checkout, double-in i master, sugestie wg lotek, wcześniejsza suma z zachowaniem ID, anulowany podgląd, stara rewizja, zmiana zwycięzcy lega/seta/meczu, jawny inactive fragment, hold/break, pauza w częściowej wizycie, stare APK i kamera, osobne decyzje/statystyki, lock/reopen, odmowy uprawnień, rewanż/retry. Wymuszony błąd ledgeru po przeliczeniu korekty cofa wszystkie zmiany/archiwum, retry tego samego UUID przechodzi raz. |
| `node backendtests/migration-operations.mjs` | PASS | Rzeczywisty fixture v4 z commitu96bd061: wszystkie stare pola/tabele, remis bez automatycznego zatwierdzenia, częściowa wizyta i wycofana lotka, prawa operatora, sekwencje ID, dwie migracje, integralność/FK, wymuszony błąd po przebudowie visits cofa migrację do v4. |
| `node backendtests/migration.mjs` | PASS | v3→v5: zachowane dane, wynik bez finished_at, komendy/audyt/urządzenia, ID i statystyki, powtórzenie i rollback. |
| `node backendtests/integration.mjs` | 19/19 PASS | Regresja starego kontraktu i kamery, rewizje/deduplikacja, dwa niezależne procesy PHP, rollback i restart. Powtórzona z powodu zmiany projekcji, schematu i walidacji sum. |
| `node backendtests/formats.mjs` | 13 grup PASS | Formatowy silnik etapu1 po migracji i zmianie zapisu/cofania, również sety/decidery/bull-off. |
| `node backendtests/web-client.mjs` | 9 kontroli PASS | Ponowienie po utracie odpowiedzi, pamięć operacji, blokada drugiego zapisu, konflikt i stara odpowiedź sesji. |
| TypeScript, Vite, PHP `-l` | PASS | Bez nowych zależności; PHP8.5.12 lokalnie, składnia docelowo7.4, bez osobnego wykonania na7.4. |
| Dwie karty WWW na osobnej bazie | PASS | Mecz20 → suma z Enter/Backspace → „pozostało” z potwierdzonym zerem → podgląd/anulowanie i korekta6→8 → druga karta usuwa szkic → pojedyncza lotka → pauza, blokada drugiej karty i reload z częściową wizytą → wznowienie → sugestiaD5 przy2 lotkach → koniec → zatwierdzenie i blokada cofania w obu → uzasadnione otwarcie i odblokowanie. Osobno rewanż ze zmianą stron, Escape dialogu bez zapisu, walkower bez gry. |

Nie wykonywano testów Androida, fizycznego telefonu, aparatu ani produkcyjnej gry. To testy HTTP/SQLite i WWW. Starszy APK sprawdzono po rzeczywistym kodzie OnlineModels/OnlineRepository/OnlineViewModel i żądaniach bez nowych nagłówków. Nie deklarujemy gotowości sprzętowej. Nie powtarzano audytu repo, backupów bez zmian ani testów po zakończeniu wystarczającej kontroli.

## Zachowane dowody etapu 1 — 28.10.2026

Wszystkie bazy są nowymi fixture w katalogach tymczasowych. Testy nie czytają lokalnego ani produkcyjnego config/danych. `DART_TEST_PHP` wskazuje interpreter z PDO SQLite; domyślnie portable PHP sąsiedniego dart-lens. Na tym stanowisku PHP 8.5.12; kod zachowuje składnię PHP 7.4, lecz nie uruchamiano go na PHP 7.4.

| Kontrola | Wynik | Zakres |
|---|---|---|
| `node backendtests/integration.mjs` | 19/19 PASS | Migracja v2, dawne formaty i sumy, lotki, częściowe wizyty, korekta/undo, rewizje, deduplikacja, role, kamera z decyzją operatora, konkurencja dwóch procesów PHP, rollback ledgeru, restart |
| `node backendtests/formats.mjs` | 13 grup PASS | Legi/sety/remis, zakończenia i undo, przewaga/limit/sudden death, ostatni set, rotacje i trwały los/bull-off, wejście/wyjście i bull, szablony, walidacja zakresów, blokady starego klienta (w tym cache/status), zakres statystyk, restart i integralność SQLite |
| `node backendtests/migration.mjs` | PASS | Fixture rzeczywistego v3 z a7f7f06: wszystkie stare pola/tabele, statystyki, zakończony mecz, częściowa wizyta, nieaktywne lotki, komendy/audyt, urządzenia, sekwencja usuniętych ID; dwa przebiegi migracji; wymuszony błąd cofa zmianę schematu i przywraca FK |
| `node backendtests/web-client.mjs` | PASS, 9 kontroli | Rzeczywisty klient TS, utrata odpowiedzi, blokada drugiego zapisu, identyczny retry po reload, konflikt rewizji, błąd pamięci i stara odpowiedź 401 po nowym logowaniu |
| `npm run lint`, `npm run build`, PHP `-l` | PASS | TypeScript, Vite, składnia PHP; wynik dist bez konfiguracji i danych |
| Lokalna przeglądarka WWW | PASS | Logowanie na fixture, konfiguracja setów, zapis/ulubiony/ponowne użycie szablonu, pełny mecz setowy, undo zakończenia, odświeżenie i wznowienie; sprawdzenie tablicy |

Regresję rozszerzono z powodu zmiany silnika wyniku i schematu; nie wykonywano ponownie audytu całego projektu, backupów bez zmian ani testów Androida. Kontrakt APK sprawdzono po kodzie `OnlineModels.kt`, `OnlineScreen.kt`, `OnlineRepository.kt` i żądaniami HTTP bez nagłówka formatów. To nie jest próba telefonu.

Przed ewentualnym wdrożeniem wykonać prywatną kopię SQLite wraz z konfiguracją i kluczem urządzeń, skontrolować migrację na jej odrębnej kopii i dopiero wykonać autoryzowane wdrożenie. W tym zleceniu nie wykonano wdrożenia ani zapisu danych produkcyjnych. Fizyczne APK1.0.1, parowanie/kamera i pilot pozostają NIE WYKONANO według `../../dart-lens/docs/DEVICE_TESTS.md`.
