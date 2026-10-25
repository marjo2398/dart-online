# Dart Online

Dart Online to samodzielny system sędziowski dla dwóch zawodników. Frontend jest statyczną aplikacją React/Vite, a produkcyjne API działa na PHP 7.4+ i SQLite — bez serwera Node.js, płatnego AI i usług zewnętrznych.

## Integracja z natywnym Dart Lens

Gałąź integracji dodaje wspólny wynik WWW/APK, pojedyncze lotki i częściowe wizyty, parowanie urządzeń z ograniczonym dostępem oraz propozycje jednej aktywnej kamery. Wynik zmienia wyłącznie zatwierdzona komenda operatora; obraz pozostaje na telefonie. Offline klient pokazuje nieaktualny stan i blokuje nowe zapisy. Nieznany wynik operacji odzyskuje się ponowieniem tej samej komendy, bez ponownego naliczania.

[Kontrakt API i uprawnienia](docs/API.md), [wdrożenie z kopią SQLite](DEPLOY_HOSTIDO.md), [aktualny stan weryfikacji](PROJECT_STATE.md). [Instrukcja pierwszej gry i parowania APK](../dart-lens/docs/ONLINE_QUICK_START.md) znajduje się w sąsiednim repozytorium `dart-lens` (link dla wspólnego lokalnego checkoutu). Docelowy adres to **https://host749284.xce.pl/dart/**. Wdrożenie integracji nadal trwa; testy lokalne nie potwierdzają działania wydania na produkcji ani telefonach.

## Funkcje

- mecze 301, 501, 701 i 901;
- formaty do 1, 2, 3 albo 5 wygranych legów;
- double-out, bust i naprzemienne rozpoczynanie legów;
- cofnięcie ostatniej wizyty, także checkoutu i rzutu kończącego mecz;
- pojedyncze pola, częściowe wizyty oraz korekta/cofnięcie ostatniej lotki lub wizyty sumarycznej;
- synchronizacja rewizji, deduplikacja komend i audyt zmian;
- jednorazowe kody operatora/kamery/widza, wygasanie i cofanie dostępu;
- odczyty kamery wymagające zatwierdzenia lub korekty przez operatora;
- wznowienie aktywnej gry z pełnego stanu zapisanego w SQLite;
- trwała lista zawodników, meczów, wizyt i przeliczanych statystyk;
- historia 50 ostatnich zakończonych meczów;
- polskie komendy głosowe, np. „wynik 60”, „wynik sto osiemdziesiąt”, „cofnij”;
- komentarze głosowe TTS w przeglądarce;
- logowanie PIN-em lub hasłem, sesja HttpOnly/SameSite, CSRF i limit prób logowania.

Backend jest źródłem prawdy. Po zapisie wizyty i cofnięciu frontend przyjmuje cały snapshot meczu zwrócony przez API.

## Wymagania lokalne

- Node.js z npm;
- PHP 7.4 lub nowszy;
- rozszerzenie PHP `pdo_sqlite`;
- nowoczesna przeglądarka. Rozpoznawanie mowy zależy od wsparcia Web Speech API.

## Konfiguracja API

1. Skopiuj `public/api/config.example.php` jako `public/api/config.local.php`.
2. Wygeneruj hash PIN-u lub hasła, nie zapisując jawnego sekretu w repozytorium:

   ```bash
   read -s -p "PIN lub hasło: " DART_SETUP_PASSWORD; echo
   export DART_SETUP_PASSWORD
   php -r 'echo password_hash(getenv("DART_SETUP_PASSWORD"), PASSWORD_DEFAULT), PHP_EOL;'
   unset DART_SETUP_PASSWORD
   ```

3. Wklej wynik do `password_hash` w `config.local.php`.
4. Przy lokalnym HTTP ustaw `secure_cookie` na `false`. Na produkcji pozostaw `true` i używaj wyłącznie HTTPS.

`config.local.php` i baza są ignorowane przez Git. Proces budowania dodatkowo usuwa lokalną konfigurację i lokalne pliki SQLite z `dist`, aby nie trafiły do paczki wdrożeniowej.

## Uruchomienie lokalne

Zainstaluj zależności:

```bash
npm install
```

W pierwszym terminalu uruchom PHP z katalogiem `public` jako document root:

```bash
php -S 127.0.0.1:8080 -t public
```

W drugim terminalu uruchom Vite:

```bash
npm run dev
```

Otwórz adres podany przez Vite. Konfiguracja deweloperska przekazuje `/api` do `127.0.0.1:8080`. Baza utworzy się automatycznie jako `public/api/data/dart-online.sqlite`.

## Budowanie

```bash
npm run build
```

Gotowa aplikacja znajduje się w `dist/`. Vite używa `base: './'`, więc zawartość katalogu można wdrożyć bez przebudowy pod ścieżką taką jak `/dart/`.

Szczegółowa instrukcja: [DEPLOY_HOSTIDO.md](DEPLOY_HOSTIDO.md).

## API i dane

Wszystkie wywołania trafiają do `api/index.php?action=...`; API nie wymaga `mod_rewrite`. Przy pierwszym poprawnie skonfigurowanym uruchomieniu tworzy lub migruje schemat. Włączane są `foreign_keys`, `WAL` i `busy_timeout`.

Każda wizyta przechowuje numer lega, kolejność, zawodnika, wynik zadeklarowany i faktycznie odjęty, faktyczną liczbę lotek oraz flagi bust/checkout. API weryfikuje też, czy zadeklarowany wynik jest matematycznie możliwy z podanej liczby legalnych lotek.

Statystyki globalne są przebudowywane po zapisaniu lub cofnięciu wizyty, zakończeniu oraz usunięciu meczu lub zawodnika. Usunięcie danych nie pozostawia zawyżonych wyników przeciwnika.

## Kopia zapasowa

Dane znajdują się w `api/data/`. Pobierz razem plik `.sqlite` oraz ewentualne pliki `-wal` i `-shm`, najlepiej gdy nikt nie używa aplikacji. Nie umieszczaj ich w repozytorium ani publicznej paczce wdrożeniowej.
