# Wspólne wydanie Dart Lens1.3.0 — 31.10.2026

APK1.3.0/code15, WWW/API1.3.0/schema9. Pakiet pl.dartlens i certyfikat poprzedniego wydania pozostają; aktualizacja bez czyszczenia danych. Reguły x01/1, operations2 i metrics1 pozostają. Etap4 anulowany.

Naprawiono ponowne parowanie po cofnięciu i zachowanie niepewnej komendy pod poprzednią tożsamością. Dodano4-cyfrowy jednorazowy PIN na5min, lokalne ustawienia aplikacji, czytelne stany synchronizacji, tabelę podsumowania i wskaźniki jakości statystyk. Kontrakt i instrukcja: [PAIRING_SETTINGS](PAIRING_SETTINGS.md).

Serwer wdrażamy przed publikacją APK. Zachowujemy SQLite, config/PIN, device-secret i ochronę katalogów. Migracja8→9 jest addytywna; dwie nowe tabele parowania i indeksy, bez zmiany istniejących danych i tokenów. Stare12-hex kody do swojego terminu; starsze aktywne urządzenia nadal działają. Odnowienie nieaktywnego dostępu hasłem wymaga nowego klienta i nigdy nie wskrzesza starego tokenu.

Źródłowy commit binarium, źródło WWW, sumy i rozmiary są w manifestach wydania. Wynik rzeczywistego wdrożenia i publikacji uzupełniamy po ich wykonaniu; same buildy nie oznaczają produkcji. Nie instalowano APK na telefonie; hardware_verified=false.

## Sprawdzenia lokalne

- Android release:36 testów,0 błędów/0 pominiętych (OnlineRepository11, localplay25); w tym rzeczywisty OnlineApi → PHP/SQLite i zachowana lokalna baza. Lint release:0 błędów,18 ostrzeżeń,1 hint.
- API:5 nowych grup parowania (także komenda przy limicie32KiB odzyskana w ograniczonej kopercie64KiB), migracja8→9 z powtórzeniem i wymuszonym rollbackiem;9 grup publicznego dostępu,19 istniejących testów urządzeń i4 grupy klienta TypeScript/HTTP PASS.
- Statystyki:16 porównań (8 zestawów, obaj gracze) rzeczywistych skompilowanych klas Kotlin z importem i PHP; AVG/first-nine, decyzje/remis/anulowanie, próbka i oba mianowniki checkoutu zgodne.
- WWW: lint/build PASS, lokalna przeglądarka z PHP, trwałość preferencji po reload, PIN/TTL/zwartość checkboxów, podsumowanie bez zatwierdzania i pomiar braku poszerzania strony na390px. Zrzuty ustawień/parowania w .tools/release-1.3.0-20261031/. Zrzutu samego raportu narzędzie IAB nie zapisało; dane i szerokość sprawdzono w rzeczywistym DOM. Nie jest to test sprzętowy APK.
- Hosting preflight tylko do odczytu: kanoniczny public_html/dart-lens-app/public, schema8, integrity=ok, OpenSSL dostępny.
