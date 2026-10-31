# Wersja1.3.0 — parowanie i ustawienia aplikacji

Bieżący kod: APK1.3.0/code15 i WWW/API1.3.0/schema9. Jeden produkt: publiczne WWW bez logowania, natywna gra offline APK i własne uwierzytelnianie urządzeń online. Etap4 pozostaje anulowany. Nowe: ponowne parowanie bez utraty danych/kolejki, PIN4cyfry/5min, ustawienia lokalne, stany synchronizacji, podsumowanie i jakość statystyk. [Instrukcja](docs/PAIRING_SETTINGS.md) · [wydanie i dowody](docs/RELEASE_1_3_0.md).

WWW/API1.3.0/schema9 wdrożone; APK1.3.0/code15 opublikowane i pobrane z weryfikacją SHA. Aktualne wydanie: [APK (prywatny GitHub)](https://github.com/marjo2398/dart-party-/releases/tag/v1.3.0-internal) · [paczka WWW](https://github.com/marjo2398/dart-online/releases/tag/v1.3.0-internal). Wynik hostingu, backup i ograniczenia opisuje PROJECT_STATE.md. Nie instalowano APK; próba fizycznego telefonu/kamery pozostaje niewykonana.

---

# Produkcja WWW/API1.2.1 — 30.10.2026

Wdrożono i sprawdzono https://dartlens.host749284.xce.pl/ w potwierdzonym katalogu /home/host749284/domains/dartlens.host749284.xce.pl/public_html/dart-lens-app/public. Publiczny start bez logowania działa. Wdrożony payload: bc5a0408e3148043e5f792523b3a1e2b986afac2; późniejsze poprawki narzędzi kopii/pakowania i dokumentacji nie zmieniają tych13 plików aplikacji.

Migracja schema3→8: najpierw na kopii, następnie na produkcji. Spójny SQLite3 backup i kopia poprzedniego kodu: /home/host749284/dart-online-backups/release-1.2.1-20261030-02/ (database-before/, code-before/). integralność=ok. Wszystkie pierwotne wartości6 graczy,4 meczów,14 wizyt,2 lotek,10 komend,10 audytów i1 urządzenia zachowane także po próbach. Config/PIN, device-secret i główny .htaccess/open_basedir bez zmian; stare assets zachowano.

Rzeczywiste HTTPS: hash HTML/JS/CSS, public-session/API8, profile/historia/urządzenia, stare mecze1–4 PASS; config/SQLite/WAL/SHM/sekret403, nieistniejące kopie/logi403 lub404. Próba zapisu: CSRF, UUID/deduplikacja, stale revision, cofanie/korekta/pauza/częściowa wizyta, kamera→propozycja→korekta, odrębny operator, checkout/statystyki/zatwierdzenie/lock PASS. Kamera i widz nie zapisują; błędny token401. Były to testy HTTP kontraktu urządzeń, nie próba fizycznego APK.

Mecz kontrolny5 anulowano i wyłączono z punktowania, profile7/8 są archiwalne,3 urządzenia kontrolne odwołano. Przeglądarka: publiczny start, konfiguracja i stary mecz1 po odświeżeniu bez logowania; konsola bez błędów. Screenshoty i raporty: dart-online/.tools/deploy-20261030/. Nie instalowano APK; hardware_verified=false nadal dotyczy telefonu/kamery.

Przed wdrożeniem wykryto dwie usterki narzędzi: backup dopuszczał tylko dawny układ dart/api, ZIP Windows miał separatory\. Backup obsługuje teraz ściśle dart/api i dart-lens-app/public/api (8 testów PASS, obie metody/WAL). ZIP tworzy jawne nazwy z /; odczyt wszystkich24 plików i SHA sprawdzono linuksowym ZipArchive. Zawartość public/ jest identyczna z wydaniem. Nowa [przenośna paczka1.2.1](https://github.com/marjo2398/dart-online/releases/download/v1.2.1-internal/Dart-Lens-WWW-1.2.1-portable-20261030.zip) zastępuje pierwotny ZIP z nazwami Windows w przyszłych wdrożeniach. Nie zmieniono APK ani wersji zasad/metrics.

Etap4 anulowany. Poniżej historia wcześniejszych zleceń; stwierdzenia o braku deploy opisują stan przed30.10.2026.

---

# Wspólny stan wydania1.2.1 — 29.10.2026

WWW1.2.1/schema8 i APK1.2.1/code14 obejmują ten sam ukończony zakres wspólnych funkcji1–3; etap4 anulowany. WWW jest publiczne bez logowania; APK zachowuje offline i własne uwierzytelnianie online. Naprawiono lokalny bilans decyzji administracyjnych i rozróżnienie brakujących rekordów od zera. Pełna macierz,33 testy JVM,8 zestawów zgodności oraz granice w [dokumencie wydania](docs/RELEASE_1_2_1.md).

Wykonano push/merge przez fast-forward oraz publikację kodu i artefaktów GitHub obu repo. API GitHuba potwierdziło main i aktywne gałęzie; wszystkie artefakty pobrano i sprawdzono po SHA256. Bez deploy hostingu, zmian produkcji i instalacji telefonu; hardware_verified=false. Poniżej zachowana historia wcześniejszych zleceń.

---

# Dart Lens WWW 1.2.0 — publiczny panel, 29.10.2026

Aktualizacja istniejącego React/Vite + PHP/SQLite, przygotowana lokalnie. Strona otwiera aplikację bez PIN-u, konta, sekretnego linku ani parowania przeglądarki. Gracze i mecze są wspólne. APK1.2.0 zachowuje natywną grę offline oraz własną autoryzację urządzeń. Etap4 organizacji rozgrywek pozostaje anulowany.

Start/wznowienie, prosta konfiguracja301/501/701/BO1–5, oba wyniki obok siebie, Zdobyte/Pozostało/lotki, własna klawiatura i fizyczne skróty. Dotychczasowe korekty, analiza/eksport, szablony i połączenia są w nawigacji/menu meczu. Reguły i metrics1 nadal liczy istniejący serwer. Archiwum z APK ma oznaczenie i tylko odczyt.

- [Publiczny dostęp i CSRF](docs/PUBLIC_ACCESS.md)
- [Porównanie APK–WWW, testy i ograniczenia](docs/WEB_UPGRADE.md)
- [Wdrożenie, spójna kopia SQLite i rollback](DEPLOY_HOSTIDO.md)

`npm run lint`, `npm run build` → `dist/`. `node tools/package-release.mjs` po lokalnym commicie tworzy paczkę z manifestem w `.tools/artifacts/`. Bez deploy/push/merge. Wersje zależności zachowane. Poniżej historia wcześniejszych etapów; opisy obowiązkowego logowania WWW są historyczne.

---

# Dart Online i Dart Lens offline — aktualizacja29.10.2026

WWW etapy1–3 zachowane; etap4 organizacji rozgrywek anulowany. Nowe natywne APK1.1.0 prowadzi także samodzielne mecze offline. Udostępnienie online korzysta z nowego API/schema7, jawnego PIN-u/roli, idempotentnego replay i jednego serwerowego właściciela. [Kontrakt](docs/OFFLINE_SYNC.md) · [instrukcja APK](../dart-lens/docs/ONLINE_QUICK_START.md).

Zmiany pozostają lokalne. Nie wykonano wdrożenia, push/merge ani zmian produkcyjnych. Poniższy opis WWW zachowuje dotychczasowy zakres etapów1–3.

---

# Dart Online

Dart Online to samodzielny system sędziowski dla dwóch zawodników. Frontend jest statyczną aplikacją React/Vite, a produkcyjne API działa na PHP 7.4+ i SQLite — bez serwera Node.js, płatnego AI i usług zewnętrznych.

## Integracja z natywnym Dart Lens

Gałąź integracji dodaje wspólny wynik WWW/APK, pojedyncze lotki i częściowe wizyty, parowanie urządzeń z ograniczonym dostępem oraz propozycje jednej aktywnej kamery. Wynik zmienia wyłącznie zatwierdzona komenda operatora; obraz pozostaje na telefonie. Offline klient pokazuje nieaktualny stan i blokuje nowe zapisy. Nieznany wynik operacji odzyskuje się ponowieniem tej samej komendy, bez ponownego naliczania.

[Kontrakt API i uprawnienia](docs/API.md), [wdrożenie z kopią SQLite](DEPLOY_HOSTIDO.md), [aktualny stan weryfikacji](PROJECT_STATE.md). [Instrukcja pierwszej gry i parowania APK](../dart-lens/docs/ONLINE_QUICK_START.md) znajduje się w sąsiednim repozytorium `dart-lens` (link dla wspólnego lokalnego checkoutu). Docelowy adres to **https://dartlens.host749284.xce.pl/**. Integracja wdrożona. Zalogowana próba produkcyjna26.10 potwierdziła rzut, korektę i cofnięcie oraz zgodność dwóch kart. Próby telefonów i parowania/obserwacji kamery na produkcji pozostają do wykonania.

## Funkcje

- „Szybkie 501” (straight-in/double-out, BO3) i pełna „Własna rozgrywka” z podsumowaniem serwera;
- mecze 301/501/701/901 oraz własny wynik 2–10001, straight/double/master-in/out;
- legi lub sety: do N wygranych / best of N, osobne legi w secie, wszystkie N legów z remisem;
- przewaga 2 legów, limit dodatkowych par i sudden death, odrębne reguły ostatniego seta;
- zapisany los/bull-off, osobne rotacje setów/legów i oczekiwanie na startera decidera;
- wspólne szablony serwera: zapis, edycja, nazwa, ulubione, usunięcie i ponowne użycie;
- cofnięcie ostatniej wizyty, także checkoutu i rzutu kończącego mecz;
- pojedyncze pola, częściowe wizyty oraz korekta/cofnięcie ostatniej lotki lub wizyty sumarycznej;
- synchronizacja rewizji, deduplikacja komend i audyt zmian;
- jednorazowe kody operatora/kamery/widza, wygasanie i cofanie dostępu;
- odczyty kamery wymagające zatwierdzenia lub korekty przez operatora;
- wznowienie aktywnej gry z pełnego stanu zapisanego w SQLite;
- trwała lista zawodników, meczów, wizyt i przeliczanych statystyk;
- stronicowana historia z filtrami, profile/goście, archiwizacja i kontrolowane aliasy duplikatów;
- polskie komendy głosowe, np. „wynik 60”, „wynik sto osiemdziesiąt”, „cofnij”;
- komentarze głosowe TTS w przeglądarce;
- logowanie PIN-em lub hasłem, sesja HttpOnly/SameSite, CSRF i limit prób logowania.

Backend jest źródłem prawdy. Po zapisie wizyty i cofnięciu frontend przyjmuje cały snapshot meczu zwrócony przez API.

**Etap 2 (29.10.2026), lokalnie:** suma/pola/„pozostało”, klawiatura ekranowa i laptopa, opcjonalne zejścia, korekta wcześniejszej historii z podglądem i kontrolowanym wycofaniem, pauza, hold/break, rewanż, decyzje administracyjne, zatwierdzanie/otwieranie i jawne uprawnienia. Migracja v5 zachowuje historię. [Krótka instrukcja operatora](docs/OPERATOR.md). Starsze APK nie dostaje rozszerzeń; serwer odrzuca niedozwolone zapisy i odczyty faz. **Bez wdrożenia i nowej APK.**

Etap formatów z 28.10.2026 wykonano **lokalnie, bez wdrożenia**. APK1.0.1 obsługuje dawne formaty; serwer filtruje i blokuje nowe dla starego klienta. Master/straight-out to warianty dodatkowe. Przed otwarciem double/master-in i przy master-out wpisuj pojedyncze lotki. [Reguły i granice](docs/SPEC.md), [testy](docs/TESTING.md), [dalszy plan](docs/ROADMAP.md).

**Etap 3 (29.10.2026), lokalnie:** trwałe profile/goście, archiwizacja i aliasy duplikatów, opcjonalne deklaracje prób/celów, sprzęt/warunki, analiza meczu i profilu, okresy/ostatnie legi, stronicowana historia i bezpieczny eksport CSV/JSON. [Instrukcja profili i analizy](docs/PROFILES_ANALYSIS.md), [definicje metrics v1](docs/METRICS.md). SQLite v6, bez wdrożenia i Androida.

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

Nowa analiza metrics v1 jest liczona bez cache z obowiązujących wizyt/lotek. Dawne pola statystyczne katalogu zachowują ograniczony kontrakt APK; nowy WWW korzysta z analizy z filtrami i pokryciem. Usuwanie zawodnika oraz meczu z historią jest blokowane; domyślne operacje to archiwizacja i anulowanie.

## Kopia zapasowa

Dane znajdują się w `api/data/`. Wykonuj spójną kopię przez prywatne CLI `tools/backup.php` zgodnie z DEPLOY_HOSTIDO.md. Nie kopiuj oddzielnie aktywnego SQLite/WAL/SHM; konfiguracja i klucz urządzeń również należą do prywatnej kopii, nigdy paczki.
