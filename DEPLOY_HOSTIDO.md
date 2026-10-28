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

Zaloguj się, dodaj dwóch zawodników i rozpocznij mecz. Mikrofon wymaga HTTPS, zgody przeglądarki i wsparcia Web Speech API; wyniki zawsze można wpisywać ręcznie.

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
4. Wgraj selektywnie `dist/index.html`, nowe pliki `dist/assets/`, `dist/api/index.php`, `dist/api/sync.php`, `dist/api/.htaccess` i `dist/api/data/.htaccess`. Najpierw zasoby, następnie komplet backendu, na końcu `index.html`. Nie uruchamiaj synchronizacji z usuwaniem plików. Nie zastępuj katalogu `api/data/` pustym katalogiem z paczki. Zachowaj stare zasoby na czas otwartych sesji.
5. **Zachowaj bez zmian** produkcyjne `api/config.local.php`, cały `api/data/` (SQLite, WAL, SHM oraz `device-secret.bin`) i pozostałe pliki prywatne. Nie wgrywaj lokalnej bazy testowej, konfiguracji, sekretów, narzędzi CLI ani `backendtests/`. Sekret urządzeń jest potrzebny do zachowania powtarzalnego dołączenia urządzenia; nie generuj go ponownie podczas aktualizacji.
6. Pierwsze żądanie API wykonuje migrację schematu w transakcji. Sprawdź HTTPS, logowanie, istniejących graczy/identyfikatory/mecze/statystyki i zasoby JS/CSS. W odrębnym meczu testowym sprawdź WWW/APK: ręczny zapis, cofnięcie, korektę i zgodny stan dwóch klientów. Zweryfikuj odmowę pobrania konfiguracji, SQLite i sekretu przez HTTP. Zapisz osobno wynik wdrożenia i rzeczywistych prób telefonu — lokalny test API ich nie zastępuje.

W razie błędu przerwij zapisy i zachowaj log bez tokenów/hasła. Samo cofnięcie plików PHP nie cofa schematu bazy. Odtworzenie wykonuj w przerwie bez procesów korzystających z SQLite: odłóż obecną bazę wraz z WAL/SHM do osobnego prywatnego katalogu, odtwórz spójny zestaw z ukończonej kopii i zgodny kod. Nie łącz odtworzonej bazy ze starym WAL/SHM. Odtworzenie starszej kopii pomija późniejsze zapisy — przed nim sprawdź zakres utraty i uzyskaj decyzję właściciela.

Lokalna kontrola narzędzia kopii (na odrębnych bazach testowych): `php -d extension=pdo_sqlite -d extension=sqlite3 tools/test-backup.php`. Na Windows ustaw dodatkowo `extension_dir` właściwego PHP.

## Typowe problemy

- **„API nie jest jeszcze skonfigurowane”** — brakuje `api/config.local.php` lub prawidłowego `password_hash`.
- **„PDO SQLite niedostępne”** — sprawdź `pdo_sqlite` dla tej aplikacji z administratorem hostingu; nie zmieniaj globalnej wersji PHP domeny.
- **„Katalog api/data nie jest zapisywalny”** — popraw właściciela lub uprawnienia.
- **Logowanie wraca do formularza** — sprawdź HTTPS, `secure_cookie => true` i obsługę ciasteczek.
- **Mikrofon jest nieaktywny** — brak Web Speech API albo zgody na mikrofon.
