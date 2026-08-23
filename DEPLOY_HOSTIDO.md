# Wdrożenie na Hostido

Instrukcja zakłada zwykły hosting LiteSpeed/PHP i adres `https://twoja-domena.pl/dart/`. Aplikacja nie wymaga procesu Node.js na serwerze ani `mod_rewrite`.

## 1. Środowisko PHP

Aplikacja obsługuje PHP 7.4 lub nowszy. Upewnij się, że dostępne jest `PDO SQLite` (`pdo_sqlite`). Włącz certyfikat SSL i przekierowanie ruchu na HTTPS — produkcyjna sesja używa ciasteczka `Secure`.

## 2. Budowanie lokalne

```bash
npm install
npm run build
```

Do wdrożenia służy zawartość `dist/`. Backend z `public/api/` jest kopiowany do `dist/api/`. Prywatny `config.local.php` i lokalna baza są celowo usuwane z wyniku budowania.

## 3. Wgranie plików

1. W katalogu WWW domeny utwórz `dart`.
2. Wgraj **zawartość** `dist/` bez dodatkowego poziomu katalogu. Powinny istnieć:

   ```text
   public_html/dart/index.html
   public_html/dart/api/index.php
   public_html/dart/api/data/.htaccess
   ```

3. Zachowaj pliki `.htaccess`; klient FTP może domyślnie ukrywać pliki zaczynające się kropką.

## 4. Konfiguracja tylko na serwerze

Wygeneruj lokalnie hash:

```bash
read -s -p "PIN lub hasło: " DART_SETUP_PASSWORD; echo
export DART_SETUP_PASSWORD
php -r 'echo password_hash(getenv("DART_SETUP_PASSWORD"), PASSWORD_DEFAULT), PHP_EOL;'
unset DART_SETUP_PASSWORD
```

W `public_html/dart/api/` utwórz ręcznie `config.local.php`:

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

`public_html/dart/api/data/` musi być zapisywalny dla PHP. Zacznij od `770`; na hostingu współdzielonym może być potrzebne `775`. Nie ustawiaj `777`, jeśli konfiguracja konta tego nie wymaga.

Przy pierwszym żądaniu API utworzy bazę, pliki WAL i schemat. Bez zapisywalnego katalogu aplikacja pokaże kontrolowany błąd. `.htaccess` blokuje pobieranie konfiguracji i katalogu danych przez HTTP.

## 6. Pierwsze uruchomienie

Otwórz adres z końcowym ukośnikiem:

```text
https://twoja-domena.pl/dart/
```

Zaloguj się, dodaj dwóch zawodników i rozpocznij mecz. Mikrofon wymaga HTTPS, zgody przeglądarki i wsparcia Web Speech API; wyniki zawsze można wpisywać ręcznie.

## Aktualizacja

Wgrywaj nową zawartość `dist/`, ale nie usuwaj z serwera:

- `api/config.local.php`;
- `api/data/dart-online.sqlite`;
- `api/data/dart-online.sqlite-wal` i `api/data/dart-online.sqlite-shm`, jeśli istnieją.

API migruje schemat automatycznie. Przed aktualizacją wykonaj kopię całego `api/data/` oraz `api/config.local.php` poza katalogiem publicznym. Kopię SQLite najlepiej robić bez aktywnych użytkowników i obejmować jednocześnie `.sqlite`, `-wal` i `-shm`.

## Typowe problemy

- **„API nie jest jeszcze skonfigurowane”** — brakuje `api/config.local.php` lub prawidłowego `password_hash`.
- **„PDO SQLite niedostępne”** — włącz `pdo_sqlite` albo zmień wersję PHP w panelu.
- **„Katalog api/data nie jest zapisywalny”** — popraw właściciela lub uprawnienia.
- **Logowanie wraca do formularza** — sprawdź HTTPS, `secure_cookie => true` i obsługę ciasteczek.
- **Mikrofon jest nieaktywny** — brak Web Speech API albo zgody na mikrofon.
