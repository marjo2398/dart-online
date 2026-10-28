# Weryfikacja etapu 1 WWW — 28.10.2026

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
