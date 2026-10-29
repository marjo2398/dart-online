# Publiczne WWW — Dart Lens 1.2.0, 29.10.2026

WWW i APK są jednym produktem. To aktualizacja istniejącego React/Vite + PHP/SQLite w `dart-online`, bez nowego panelu i bez etapu 4 organizacji rozgrywek. Produkcja nie została zmieniona.

## Wejście i uprawnienia

Strona otwiera aplikację bez PIN-u, konta, parowania przeglądarki i sekretnego linku. Gracze, notatki profili, historia i statystyki są wspólne. Publiczny operator może tworzyć/prowadzić mecze, poprawiać historię z podglądem, pauzować, rozstrzygać/zatwierdzać/otwierać wynik, zarządzać szablonami, archiwizować profile, eksportować i wystawiać/cofać kody urządzeń. Nie ma osobowych kont ani potwierdzonej tożsamości operatora.

`public.php` definiuje rolę `public`, aktora ledgeru `public-web` i jawną listę `PUBLIC_WEB_COMMANDS`. Nie jest to rola urządzenia ani serwerowy administrator hostingu. Publiczne WWW nie publikuje obserwacji kamery i nie korzysta z `local-game-import`. Brak endpointów konfiguracji hostingu, odczytu sekretów, SQL ani usuwania kopii. `player-delete` nadal odmawia kasowania; mecz z historią również jest chroniony.

## Sesja techniczna, CSRF i ponowienia

- GET `public-session` → `{access:'public', authenticated:false, csrf_token, expires_at}`. `authenticated:false` oznacza brak uwierzytelnienia osoby, a nie zakaz korzystania z panelu.
- Cookie jest HttpOnly, Secure na HTTPS, SameSite=Strict. Sesja przechowuje oddzielne `web_csrf_token` i `web_expires_at`; zachowano nazwę/czas sesji z konfiguracji serwera.
- WWW wysyła `X-Dart-Client: public-web`, `X-Dart-Formats: 1`, `X-Dart-Operations: 2`. Ten jawny wybór roli jest informacją o publicznym kliencie, nie sekretem ani dowodem uwierzytelnienia.
- Każdy zapis z cookies wymaga ważnego CSRF. Odczyty publiczne nie wymagają aktywnej sesji. Po odrzuceniu CSRF klient odnawia sesję i ponawia dokładnie to samo body/UUID **najwyżej raz**. Nie ma przekierowania do logowania.
- Błąd sieci, 408/429/5xx, nieczytelna odpowiedź oraz odmowa 401/403 zachowują nierozstrzygniętą komendę i blokują nowe zapisy. Kolejne ponowienie jest jawne. Nie zmienia UUID ani rewizji; konflikt 409 wymaga nowej decyzji po odświeżeniu.
- Ledger `public-web` pozostaje ten sam po wygaśnięciu cookie i w innych kartach. Poprzedni wspólny aktor `administrator` jest sprawdzany wyłącznie przy identycznym starym UUID/body. Oryginalny audyt i odpowiedź nie są przepisywane. To odzyskanie dawnych zapisów WWW, nie nadanie tożsamości urządzenia.
- Dawne cookies admina nie blokują nowego WWW. Endpointy `session/login/logout` i ich dawny kontrakt pozostają dla kompatybilności; nowy frontend ich nie używa do wejścia.

## Urządzenia

APK zachowuje `app-authorize` z PIN-em/hasłem, własne Bearer tokeny i `native_admin`. Kody `device-code-create/device-join`, zakres meczu, jawne prawa operatora, kamera/widz, wygaśnięcie i unieważnianie pozostają sprawdzane po stronie serwera. Istniejące granty nie są rozszerzane.

Każdy jawnie przesłany Authorization, także pusty lub błędny, jest walidowany i odrzucany przed publiczną ścieżką. Brak fallbacku do WWW dla błędnego urządzenia. Publiczny aktor ma w audycie `role=public`, `device_id=null`, `declared_name=null`; nie wskazuje gracza, właściciela APK ani sędziego. Kamera tylko proponuje; akceptacja/korekta człowieka pozostaje osobną komendą z rewizją i kontekstem.

## Limity i pliki prywatne

Publiczny IP ma oddzielne limity na stałą minutę: 600 odczytów, 180 POST i 8 eksportów. Są współdzielone przez karty za tym samym NAT. 429 zawiera `Retry-After`. Tabela liczników nie zawiera surowych adresów IP; wygasłe wpisy są usuwane po dobie. Dotychczasowe limity prób PIN-u i parowania pozostają.

JSON do 32 KiB, natywny import do 2 MiB/3000 operacji; walidacja, transakcje, rewizje i idempotencja są zachowane. Eksport stosuje dotychczasową whitelistę, neutralizację formuł CSV i limit częstotliwości. Dane są renderowane jako tekst React, zapytania używają parametrów SQL.

`api/.htaccess` blokuje konfiguracje i ich kopie, SQLite/WAL/SHM, sekret urządzeń oraz typowe kopie/logi. `api/data/.htaccess` blokuje cały katalog danych. Paczka zawiera wyłącznie pliki z jawnej listy, bez lokalnej konfiguracji, bazy, logów, sekretów i testów. Produkcyjny główny `.htaccess` z `open_basedir` pozostaje zachowany; jego działania nie potwierdza lokalny serwer PHP.

## Migracja i pochodzenie meczu

Schema8 addytywnie dodaje `web_request_limits` i nullable `games.import_mode`. Zachowuje wszystkie istniejące ID, profile, dane punktowania, komendy/odpowiedzi, audyt i poświadczenia.

`game.origin` (także w listach i raportach) ma `{kind:'server'|'android', mode:null|'shared'|'archive'|'unknown', read_only:boolean}`. Nowe importy zapisują rzeczywiste `share`; dawne odzyskują decyzję z istniejącego audytu. Brak dowodu daje `unknown` i tylko odczyt. Archiwum nie dostaje praw sterowania; backend odmawia jego edycji (`409 archive-read-only`). Zwykły serwerowy mecz i jawne `shared` prowadzi serwer. Mecz pozostający na telefonie nie jest automatycznie wysyłany.

[Porównanie i weryfikacja](WEB_UPGRADE.md) · [synchronizacja](OFFLINE_SYNC.md) · [wdrożenie i kopia SQLite](../DEPLOY_HOSTIDO.md)
