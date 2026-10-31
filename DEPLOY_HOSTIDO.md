# Aktualizacja1.3.0 / schema9 — procedura31.10.2026

Serwer przed publikacją nowego APK. Sprawdzone przed wdrożeniem: właściwy kanoniczny public_html/dart-lens-app/public, schema8, integrity=ok, OpenSSL. Nowa paczka node tools/package-release.mjs zawiera komplet9 modułów PHP (także pairing.php), index i hashowane JS/CSS, api/.htaccess i api/data/.htaccess:14 plików aplikacji. Nie kopiuj jedynie diffu backendu. PHP7.4+ wymaga PDO SQLite i OpenSSL; docelowe CLI8.4 potwierdzono.

W oknie zapisu: zachowaj dokładny główny .htaccess z izolacją; krótki503, spójny backup SQLite3::backup i kopia kodu do nowego prywatnego katalogu poza public_html. Kopii aktywnej bazy nie zastępuje Copy-Item/cp samego pliku. Najpierw migracja8→9 na kopii i porównanie wszystkich starych kolumn/wierszy, potem instalacja assets/API i migracja produkcji, index.html ostatni, przywrócenie identycznego .htaccess. Config/PIN, device-secret, baza i wcześniejsze assets bez podmiany. Nie ruszaj TLS/globalnego PHP ani innych domen. Nowe tabele parowania są addytywne; historia/UUID/tokeny pozostają.

Backup przechowuje kod, spójną bazę i konfigurację/sekret prywatnie. Automatyczny rollback w tym oknie zachowuje niedoszłą bazę/WAL/SHM osobno i przywraca spójną poprzednią parę kod+baza. Po otwarciu ruchu i nowych zapisach nie przywracaj dawnej bazy bez oceny utraty tych nowych danych. Zachowaj stare assets i no-cache HTML/API; poproś o odświeżenie starej karty. Nie ma service workera.

Smoke: publiczny start/zasoby/API1.3.0 schema9, stare profile/mecze, PIN → role → revoke/re-pair → rozstrzygnięcie komendy bez replay → korekta/zakończenie → drugi klient/raport, config/SQLite/WAL/SHM/klucz/logi403/404. Wyłącznie oznaczone dane testowe: na koniec anulowanie/wyłączenie ze statystyk, archiwizacja profili i cofnięcie testowych urządzeń; audyt zachowany. Wynik, świeżą ścieżkę backupu i SHA wydania wpisujemy po wykonaniu w PROJECT_STATE i RELEASE_1_3_0.

Poniżej zachowano poprzednie wydania i podstawową procedurę backupu; aktualną liczbę modułów/schemat definiuje sekcja powyżej.

---

# Wdrożono1.2.1 — 30.10.2026

Aktualny wynik i dokładny backup: PROJECT_STATE.md. Backup CLI akceptuje kanoniczne dart-lens-app/public/api oraz historyczne dart/api, zachowując wszystkie pozostałe kontrole. Test-backup8 PASS. ZIP ma jawne separatory / i sprawdzony odczyt Linux; do następnego wdrożenia wybieraj Dart-Lens-WWW-1.2.1-portable-20261030.zip z Releases. Poniższa procedura nadal obowiązuje przy kolejnej aktualizacji.

---

# Zestaw1.2.1 — bez wdrożenia hostingu

Aktualna paczka i para APK: [RELEASE_1_2_1](docs/RELEASE_1_2_1.md). Wersja1.2.1 zachowuje poniższą procedurę schema8, spójnego backupu i rollbacku. GitHub push/merge oraz publikacja artefaktów nie oznaczają wgrania plików na hosting.

---

# Aktualizacja WWW1.2.0/schema8 — przygotowana lokalnie 29.10.2026

Nie wykonano wdrożenia. Jedyny cel to https://dartlens.host749284.xce.pl/ i ostatnio potwierdzony katalog /home/host749284/domains/dartlens.host749284.xce.pl/public_html/dart-lens-app/public. Przed przyszłym wgraniem potwierdź go w SSH/DirectAdmin. Nie uruchamiaj dawnego /dart/ ani MySQL.

Paczka powstaje przez node tools/package-release.mjs po commicie, z czystego drzewa. Ścieżka .tools/artifacts/www-1.2.0-public-20261029-<commit>/, manifest release-manifest.json i ZIP obok. Manifest zawiera SHA256 każdego pliku, wersję1.2.0, schema8, source_commit i rzeczywistą listę zmian od188658a. W paczce public/ zawiera gotowy frontend oraz **komplet8 modułów PHP**, również formats/operations/profiles/analysis/offline z poprzednich etapów. Zmiany od188658a nie są pełną listą plików potrzebnych starszej produkcji.

public/ nie zawiera głównego .htaccess, config.local.php ani bazy. Główny produkcyjny .htaccess z open_basedir/DirectoryIndex/CacheLookup off pozostaje zachowany. Wgraj api/.htaccess i api/data/.htaccess z paczki; nie zastępuj całego api/data. private-tools/backup.php przenieś wyłącznie do prywatnego katalogu do CLI, poza public_html.

Migracja do8 wykona wcześniejsze migracje oraz addytywne web_request_limits/games.import_mode. Istniejące ID, poświadczenia, historia/UUID i odpowiedzi zostają. Dawne tryby importu są odzyskiwane z audytu; brak dowodu daje unknown/tylko odczyt. Uruchom migrację na odrębnej kopii i sprawdź integralność przed docelowym ruchem. **Zachowaj** produkcyjny config (także hash PIN-u potrzebny APK), SQLite/WAL/SHM i device-secret.bin. Spójną kopię wykonuje opisane niżej prywatne backup.php, nie zwykłe kopiowanie aktywnego SQLite.

W przerwie zapisu: najpierw nowe assets, następnie jednocześnie pełny komplet backendu, na końcu index.html. Nie używaj synchronizacji usuwającej pliki. Zachowaj wcześniejsze zasoby dla otwartych kart; po aktualizacji poproś o odświeżenie. Nowy index ma wskazywać wyłącznie nowe hashowane pliki. Dla index.html/API utrzymaj brak cache; nie dodawaj service workera. Stare zasoby można usuwać dopiero po zamknięciu dawnych sesji, osobnym kontrolowanym krokiem.

Po wdrożeniu sprawdź: świeża karta bez cookies → publiczny start; dotychczasowi gracze/stare mecze; ręczny mecz i zgodność dwóch klientów; korekta/cofnięcie/pauza/checkout/lock; odświeżenie i wygaśnięcie sesji bez PIN-u; parowanie, odmowy widza/kamery i aktualna APK. Kontroluj HTTP JS/CSS/API, 403/404 dla config/kopii config, SQLite/WAL/SHM/device-secret, logów i kopii. Bazy/sekrety nie mogą trafić do publicznego ZIP ani pod HTTP. Testowy mecz nie może zastąpić danych historycznych. Wynik produkcyjny zapisuj dopiero po rzeczywistym wykonaniu tych prób.

Rollback: zatrzymaj zapisy i zachowaj bieżący stan prywatnie. Przywróć zgodny poprzedni kod oraz **spójną** kopię sprzed migracji, bez mieszania jej ze starym WAL/SHM. Samo cofnięcie PHP nie cofa schematu ani późniejszych wyników. Jeżeli po migracji powstały nowe zapisy, decyzja o przywróceniu starej kopii wymaga sprawdzenia utraty tych danych. Prywatna kopia poprzedniego wydania i manifest backupu są warunkiem wdrożenia.

[Publiczny model](docs/PUBLIC_ACCESS.md) · [testy/ograniczenia](docs/WEB_UPGRADE.md). Instrukcja niżej zachowuje procedurę spójnej kopii; dawne polecenia logowania dotyczą starszego wydania.

---

# Wdrożenie na Hostido

Docelowy panel to `https://dartlens.host749284.xce.pl/`, PHP/SQLite. Wdrożenie obejmuje wyłącznie potwierdzony katalog `public_html/dart-lens-app/public` i prywatne kopie tego projektu poza `public_html`. Nie zmieniaj innych stron ani globalnej wersji PHP domeny. Aplikacja nie wymaga procesu Node.js na serwerze ani `mod_rewrite`. Ta instrukcja nie jest potwierdzeniem wdrożenia; aktualny wynik zapisujemy w `PROJECT_STATE.md`.

## 1. Środowisko PHP

Aplikacja obsługuje PHP 7.4 lub nowszy. Upewnij się, że dostępne jest `PDO SQLite` (`pdo_sqlite`). Włącz certyfikat SSL i przekierowanie ruchu na HTTPS — produkcyjna sesja używa ciasteczka `Secure`.

## 2. Budowanie lokalne

```bash
npm ci
npm run lint
npm run build
```

Do wdrożenia służy zawartość `dist/`. Backend z `public/api/` jest kopiowany do `dist/api/`. Prywatny `config.local.php` i lokalna baza są celowo usuwane z wyniku budowania.

## 3. Wgranie plików

1. Potwierdź DocumentRoot subdomeny: `/home/host749284/domains/dartlens.host749284.xce.pl/public_html/dart-lens-app/public`. Nie twórz drugiej instalacji w dawnym `/dart/`.
2. Wgraj **zawartość** `dist/` bez dodatkowego poziomu katalogu. Powinny istnieć:

   ```text
   public_html/dart-lens-app/public/index.html
   public_html/dart-lens-app/public/api/index.php
   public_html/dart-lens-app/public/api/data/.htaccess
   ```

3. Zachowaj pliki `.htaccess`; klient FTP może domyślnie ukrywać pliki zaczynające się kropką. Produkcyjny główny `.htaccess` zawiera własne `open_basedir` ograniczone do `dart-lens-app`, `DirectoryIndex index.html` i `CacheLookup off`. Nie zastępuj go ogólnym plikiem z `dist/`. Nie zmieniaj globalnej izolacji PHP.

## 4. Konfiguracja tylko na serwerze

Wygeneruj lokalnie hash:

```bash
read -s -p "PIN lub hasło: " DART_SETUP_PASSWORD; echo
export DART_SETUP_PASSWORD
php -r 'echo password_hash(getenv("DART_SETUP_PASSWORD"), PASSWORD_DEFAULT), PHP_EOL;'
unset DART_SETUP_PASSWORD
```

Poniższa konfiguracja dotyczy nowej, pustej instalacji. Przy aktualizacji zachowaj istniejący PIN i plik bez zmian. W `public_html/dart-lens-app/public/api/` plik `config.local.php` ma postać:

```php
<?php

declare(strict_types=1);

return [
    'password_hash' => 'TUTAJ_WKLEJ_WYGENEROWANY_HASH',
    'secure_cookie' => true,
    'session_name' => 'dart_online_session',
    'session_lifetime' => 43200,
];
```

Nie wpisuj jawnego PIN-u/hasła. Plik ma pozostać wyłącznie na serwerze i nie może trafić do Git ani paczki `dist`.

## 5. Uprawnienia bazy

`public_html/dart-lens-app/public/api/data/` musi być zapisywalny dla PHP. Zacznij od `770`; na hostingu współdzielonym może być potrzebne `775`. Nie ustawiaj `777`, jeśli konfiguracja konta tego nie wymaga.

Przy pierwszym żądaniu API utworzy bazę, pliki WAL i schemat. Bez zapisywalnego katalogu aplikacja pokaże kontrolowany błąd. `.htaccess` blokuje pobieranie konfiguracji i katalogu danych przez HTTP.

## 6. Pierwsze uruchomienie

Otwórz adres z końcowym ukośnikiem:

```text
https://dartlens.host749284.xce.pl/
```

Aplikacja otworzy się bez logowania. Dodaj dwóch zawodników i rozpocznij mecz. Mikrofon wymaga HTTPS, zgody przeglądarki i wsparcia Web Speech API; wyniki zawsze można wpisywać ręcznie.

## Aktualizacja istniejącego panelu i kopia przed migracją

1. Potwierdź rzeczywisty katalog domeny i `api` w DirectAdmin/SSH; nie wyprowadzaj ścieżki wyłącznie z adresu URL. Umów przerwę w grze na wdrożenie. Zachowaj poza katalogiem publicznym także poprzednie pliki aplikacji do ewentualnego wycofania kodu.
2. Skopiuj `tools/backup.php` do prywatnego katalogu konta. Uruchom **CLI**, nie przez HTTP, przed wgraniem nowego backendu i pierwszym żądaniem uruchamiającym migrację. Katalog nadrzędny kopii musi już istnieć; katalog docelowy musi być nowy. Przykład wymaga podstawienia wcześniej potwierdzonych ścieżek:

   ```bash
   php /potwierdzona/sciezka/prywatna/backup.php \
     --api-dir=/potwierdzona/sciezka/public_html/dart-lens-app/public/api \
     --public-root=/potwierdzona/sciezka/public_html \
     --destination=/potwierdzona/sciezka/prywatna/kopie/dart-YYYYMMDD-HHMMSS
   ```

   Potrzebne `pdo_sqlite` i `SQLite3::backup()` albo SQLite ≥3.27 z `VACUUM INTO`. Skrypt blokuje zapisy na czas wykonania spójnego obrazu, kopiuje zatwierdzone dane również z WAL, zachowuje `config.local.php` i istniejący `data/device-secret.bin`. Weryfikuje `integrity_check` i liczby rekordów, zapisuje SHA-256 oraz metodę w `backup-manifest.json`. Źródła nie są modyfikowane. Nie zastępuj tego kopiowaniem aktywnych plików `.sqlite`, `-wal`, `-shm` oddzielnie.

3. Wymagaj kodu wyjścia 0, komunikatu `Backup verified` i manifestu `integrity_check=ok`. Nieukończona kopia pozostaje prywatna do diagnostyki; nie używaj jej do odtworzenia i nie kontynuuj migracji. Przez panel bez terminala można uruchomić identyczne polecenie jednorazowym zadaniem CRON, zachowując wynik poza katalogiem publicznym; po sprawdzeniu wyniku usuń wyłącznie własne zadanie.
4. Wgraj selektywnie zawartość public/ z przygotowanej paczki: index.html, assets, wszystkie moduły PHP oraz api/.htaccess i api/data/.htaccess. Najpierw zasoby, następnie komplet backendu, na końcu `index.html`. Nie uruchamiaj synchronizacji z usuwaniem plików. Nie zastępuj katalogu `api/data/` pustym katalogiem z paczki. Zachowaj stare zasoby na czas otwartych sesji.
5. **Zachowaj bez zmian** produkcyjne `api/config.local.php`, cały `api/data/` (SQLite, WAL, SHM oraz `device-secret.bin`) i pozostałe pliki prywatne. Nie wgrywaj lokalnej bazy testowej, konfiguracji, sekretów, narzędzi CLI ani `backendtests/`. Sekret urządzeń jest potrzebny do zachowania powtarzalnego dołączenia urządzenia; nie generuj go ponownie podczas aktualizacji.
6. Pierwsze żądanie API wykonuje migrację schematu w transakcji. Sprawdź HTTPS, wejście publiczne i odnowienie CSRF bez logowania, istniejących graczy/identyfikatory/mecze/statystyki i zasoby JS/CSS. W odrębnym meczu testowym sprawdź WWW/APK: ręczny zapis, cofnięcie, korektę i zgodny stan dwóch klientów. Zweryfikuj odmowę pobrania konfiguracji, SQLite i sekretu przez HTTP. Zapisz osobno wynik wdrożenia i rzeczywistych prób telefonu — lokalny test API ich nie zastępuje.

W razie błędu przerwij zapisy i zachowaj log bez tokenów/hasła. Samo cofnięcie plików PHP nie cofa schematu bazy. Odtworzenie wykonuj w przerwie bez procesów korzystających z SQLite: odłóż obecną bazę wraz z WAL/SHM do osobnego prywatnego katalogu, odtwórz spójny zestaw z ukończonej kopii i zgodny kod. Nie łącz odtworzonej bazy ze starym WAL/SHM. Odtworzenie starszej kopii pomija późniejsze zapisy — przed nim sprawdź zakres utraty i uzyskaj decyzję właściciela.

Lokalna kontrola narzędzia kopii (na odrębnych bazach testowych): `php -d extension=pdo_sqlite -d extension=sqlite3 tools/test-backup.php`. Na Windows ustaw dodatkowo `extension_dir` właściwego PHP.

## Typowe problemy

- **„API nie jest jeszcze skonfigurowane”** — brakuje `api/config.local.php` lub prawidłowego `password_hash`.
- **„PDO SQLite niedostępne”** — sprawdź `pdo_sqlite` dla tej aplikacji z administratorem hostingu; nie zmieniaj globalnej wersji PHP domeny.
- **„Katalog api/data nie jest zapisywalny”** — popraw właściciela lub uprawnienia.
- **Zapis nie odnawia ochrony CSRF** — sprawdź HTTPS, secure_cookie i obsługę cookies. Nowy frontend nie ma formularza logowania; widoczny formularz oznacza stare index/zasoby lub starą instalację.
- **Mikrofon jest nieaktywny** — brak Web Speech API albo zgody na mikrofon.
