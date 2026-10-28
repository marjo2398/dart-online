# Weryfikacja WWW — etapy 1–2

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
