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

# WWW1.2.0 — publiczny upgrade do APK1.2.0, 29.10.2026

Na feature/public-web-apk-20261029 od188658a zaktualizowano istniejące WWW/API. APK1.2.0/code13 (Android de8facb, kod c77797d) bez zmian, przebudowy i instalacji. Cudze dopiski TASK i audyt w dart-lens zachowano. Jeden produkt, etap4 organizacji nadal anulowany.

Publiczny start, jawna rola public i techniczne CSRF z jednokrotnym odnowieniem; tokeny/role urządzeń, rewizje i stare UUID zachowane. Nawigacja, proste ustawienia, dwa wyniki, klawiatura i menu dotychczasowych funkcji. Schema8 dodaje liczniki żądań i import_mode; archiwum/nieznany tryb nie dostają sterowania. Gra lokalna pozostaje na telefonie do jawnego przekazania.

Testy: public-access9, API19, formaty13, operacje12, analiza9, klientTS/HTTP, v7→v8/rollback i dawne migracje PASS. OfflinePhpIntegrationTest i X01ContractTest 2/2 bez skip,39 scenariuszy zasad. Porównano rzeczywiste klasy APK/statystyki serwera dla3 zbiorów. Potwierdzono błąd lokalnego licznika remisów APK przy przerwaniu; nie zmieniano definicji WWW. Szczegóły w docs/WEB_UPGRADE.md i docs/TESTING.md.

Przeglądarka/lokalne API: nowa karta bez logowania, utworzenie301, presety/fizyczna klawiatura/CLR/OK/dwuklik, dwie karty i anulowanie szkicu, korekta60→40, częściowa wizyta/pauza/reload/wznowienie, wymuszone wygaśnięcie sesji podczas zapisu, checkout/zatwierdzenie/lock, raport i pobrany CSV. Screenshoty: .tools/public-web-20261029/screenshots/; CSV obok. Lint/build/PHP8.5 PASS.

Build: dist/. Paczka: .tools/artifacts/www-1.2.0-public-20261029-<commit>/ i ZIP obok. release-manifest.json podaje dokładny commit, pliki i SHA256. public/ aktualizuje istniejące wdrożenie; private-tools/ zawiera wyłącznie narzędzie kopii do prywatnego CLI. Bez bazy, config.local.php i sekretów.

Bez deploy/push/merge i zapisów produkcyjnych. Jedyna domena/ostatnia potwierdzona ścieżka pozostają w DEPLOY_HOSTIDO.md; operator potwierdza je przed przyszłym wdrożeniem. Paczka zawiera wszystkie moduły API, również ze wcześniejszych lokalnych etapów, ponieważ produkcja może nadal mieć starszy kod.

hardware_verified=false. Nie wykonano telefonu/kamery/renderu APK, PHP7.4, Apache/LiteSpeed ani prób produkcji. LocalStatistics APK wymaga osobnej poprawki licznika remisów po przerwaniu. [Macierz/dowody](docs/WEB_UPGRADE.md), [publiczny model](docs/PUBLIC_ACCESS.md), [wdrożenie](DEPLOY_HOSTIDO.md). Poniżej historia.

---

# Publikacja GitHub — 29.10.2026

Na wyraźne polecenie użytkownika wypchnięto feature/apk-integration-20261025 i połączono z main przez fast-forward. Zdalny main zawiera18bb0c4 (kontrakt i bezpieczny import offline), poprzednie etapy1–3 oraz ich historię. Bez force push, resetu i nadpisania cudzych commitów. Gałąź roboczą zachowano. Android również opublikowany w main swojego repo.

Nie uruchomiono wdrożenia produkcji; rozszerzenia API/schema7 nadal wymagają odrębnego zlecenia wdrożenia. Użytkownik potwierdził instalację APK1.1.0 i będzie przekazywał wyniki prób. Nie ma jeszcze potwierdzenia gry na urządzeniu ani produkcyjnej synchronizacji; hardware_verified=false. Poniżej historia wcześniejszego stanu lokalnego i testów.

---
# Rozszerzenie APK offline — 29.10.2026, wyłącznie lokalnie

Zachowano ukończone WWW etapy1–3 (bazowy commit2a03c9c); etap4 organizacji rozgrywek anulowany. Priorytetem jest natywne APK1.1.0/code12 z samodzielną grą offline. [Mapa WWW→APK](../dart-lens/docs/OFFLINE_PLAY.md), [kontrakt synchronizacji](docs/OFFLINE_SYNC.md).

Dodano API/schema7: app-authorize (jawny PIN i native_admin, stare granty bez rozszerzenia), sync-capabilities, atomowy/idempotentny local-game-import przez istniejący silnik/runCommand/audyt, trwałe mapy osób i konflikt rewizji, pełne profile-create oraz jawne archived w profile-save. Replay zachowuje faktyczne pola/adnotacje/datę wizyt i zakończenia, porównuje stan telefonu, nie wymyśla lotek z sum. Jeden origin/local match = jeden serwerowy game_id i statystyki. Phone local→transferring→potwierdzone online/archive; serwer prowadzi dalszy wspólny mecz.

Weryfikacja:39 ręcznie określonych wspólnych scenariuszy zasad PHP i Kotlin PASS; rzeczywisty klient APK/HTTP/PHP8.5.12/SQLite→drugi klient, utracone ACK i restart importu, rollback błędu ostatniego INSERT/retry, jedna kopia, role widza/kamery403, propozycja→operator→wynik, utrata/odnowienie dostępu bez podwójnego rzutu, stara propozycja po zmianie kontekstu, konflikt profilu/archiwizacja i zachowanie dat PASS. Migracje dawnych baz do7, w tym v6 z2a03c9c, zachowują stare dane/ID/poświadczenia/granty/komendy; powtórzenie i wstrzyknięty rollback PASS. Regresje API19/19, formaty13, operacje12, analiza9, klient WWW9; TypeScript i Vite PASS. Bez nowego testu skali, benchmarku hostingu i prób urządzeń.

Nie zmieniono produkcyjnej konfiguracji, PIN-u, bazy ani TLS. Nie wdrożono nowych modułów, nie wykonano push/merge. Lokalna gałąź pozostaje feature/apk-integration-20261025. Nowe online wymaga osobno autoryzowanego wdrożenia schema7 na https://dartlens.host749284.xce.pl/; lokalny test nie dowodzi działania produkcji. Stare MySQL i /dart/ nie są celem wdrożenia. PHP7.4 i Androida nie wykonywano jako środowisk serwera/sprzętu. Limit importu3000 operacji/2MiB opisano jawnie; nie ogranicza samej lokalnej gry.

Poniżej historia etapów WWW i wcześniejszej konsolidacji.

---

# Dart Online — stan 29.10.2026

## Etap 3 WWW — wykonany lokalnie, bez wdrożenia

Profile/goście, edycja/preferencje, archiwizacja/przywrócenie i chronione kasowanie. Podgląd i transakcyjne aliasy duplikatów, blokada wspólnych/aktywnych meczów; stare ID uczestników pozostają.

Analiza metrics v1 z obowiązujących danych: ważone średnie/first-nine z pokryciem, dwa checkout %, przedziały/sektory, legi/hold/break/decidery, H2H, okresy/ostatnie10/50/100 legów i źródła rekordów. Filtry zasad/statusów, Europe/Warsaw/DST, stabilne strony, CSV/JSON i druk. Opcjonalne próby/cele/pochodzenie, sprzęt i warunki; stare braki pozostają nieznane. [Definicje](docs/METRICS.md), [instrukcja](docs/PROFILES_ANALYSIS.md).

SQLite v6 addytywnie zachowuje dane/ID/poświadczenia/historię; powtórzenie i rollback PASS. Bez cache/usług/zależności. APK nie kasuje historii ani nie wybiera archiwalnych do nowej gry; widzi ich w dawnym meczu. Nowe profile/eksport admin-only, granty bez rozszerzeń.

Testy: analiza9 grup, rzeczywiste v5(48b55f2)→v6 i starsze migracje, API19/19, operacje12, formaty13, klient9, lint/build/PHP PASS.1200 meczów/6000 wizyt: sumy/okna/strony/indeks zgodne, lokalnie0,251s/30MiB (nie hosting). WWW: profil→mecz→korekta→przeliczenie→archiwum→CSV, nazwa/alias i dwa okresy PASS. [Testy i ograniczenia](docs/TESTING.md).

Gałąź feature/apk-integration-20261025, bazowe etapy1/2:96bd061/48b55f2. Bez deploy/push/merge i produkcyjnych danych. Android72ca997 i cudze TASK/audyt bez zmian. PHP8.5.12 lokalnie; bez wykonania na7.4, prób telefonu/kamery i fizycznego wydruku. Następne: odbiór lokalny; wdrożenie i przyszły Android wymagają osobnego zlecenia.

## Etap 2 WWW — wykonany lokalnie, bez wdrożenia

Trzy sposoby wpisywania: suma/pola/„pozostało”, klawiatura ekranowa i laptopa, popularne wartości, opcjonalne checkouty wg lotek i preferowanego double. Zachowane głos i komendy; wskazówki zejścia można wyłączyć. Serwer sprawdza również legalność sekwencji przed bust/checkout, bez wymyślania pól.

Korekta wcześniejszej sumy/lotki: podgląd bez zapisu, token/rewizja, deterministyczny replay z zachowaniem ID/graczy/legów lub jawne wycofanie sprzecznego fragmentu. Inactive i wersje/audyt zachowują historię. Pauza/wznowienie chronią częściową wizytę i unieważniają kamerę. Hold/break, osobny idempotentny rewanż. Poddanie/walkower/przerwanie/anulowanie mają osobne decyzje i jawny wpływ na statystyki, bez fikcyjnych legów. Wynik rozstrzygnięty wymaga zatwierdzenia; po nim lock, ponowne otwarcie z prawem i uzasadnieniem.

Migracja SQLitev5 zachowuje stare mecze/dane/ID/statusy i dotychczasowe prawa urządzeń, bez automatycznego zatwierdzania. Prawa history/pause/adjudicate/confirm/reopen przydzielane jawnie; PIN oznacza sesję admina, nie osobę. Backend blokuje niedozwolone zapisy starego APK, zachowując UUID/treść i pierwotne odpowiedzi retry. APK1.0.1 bez zmian; nowa obsługa formatów/faz wymaga osobnego Androida.

Weryfikacja: operacje12 grup, API19/19, formaty13 grup, migracjev3/v4→v5 z powtórzeniem/rollbackiem, klient WWW9 kontroli, TypeScript/build/PHP PASS. Dwie karty: korekta i unieważnienie szkicu, pauza/reload częściowej wizyty, wznowienie, koniec, lock i otwarcie; dodatkowo rewanż/Escape/walkower. [Testy](docs/TESTING.md), [instrukcja operatora](docs/OPERATOR.md), [API](docs/API.md).

Gałąź `feature/apk-integration-20261025`; etap1:96bd061. Ostatni zapisany stan produkcji: konsolidacja a7f7f06 poniżej; w tym etapie bez deploy/push/merge i zapisów produkcyjnych. Android72ca997 i cudze TASK/audyt niezmienione. Następne: osobna decyzja o etapie3 WWW, wdrożeniu i przyszłym Androidzie; próby telefonów nadal oczekujące.

## Etap 1 WWW — wykonany lokalnie, bez wdrożenia

Szybkie 501 BO3 i własny X01 2–10001 (w tym301/501/701/901); straight/double/master-in/out; legi/sety do N lub BO, wszystkie N legów z remisem; przewaga2, limit par/sudden death, osobny ostatni set. Trwałe losowanie i bull-off, rotacje setów/legów, oczekiwanie na startera decidera. Szablony SQLite z edycją/nazwą/ulubionymi/usunięciem; mecze mają własny config v1.

PHP prowadzi wynik i przejścia; cofnięcie/korekta odtwarza otwarcie, leg/set/mecz i startera. Kamera nadal wymaga decyzji operatora. Migracja SQLitev4 zachowuje dane, historię i sekwencje ID; ponowienie bez zmian, błąd cofa migrację. Sumy przed double/master-in i przy master-out wymagają pojedynczych pól. Globalne statystyki jawnie ograniczone do dawnych formatów.

APK1.0.1 bez zmian: serwer zachowuje dawny kontrakt i blokuje nowe formaty przy braku nagłówka obsługi. Obsługa setów/remisu/faz/bull-off w Androidzie wymaga osobnego zadania, bez nowej APK w tym etapie. [SPEC](docs/SPEC.md), [API](docs/API.md), [TASK](TASK.md).

Weryfikacja lokalna: regresja API19/19, nowe formaty13 grup PASS, migracja pełnego fixturev3/ponowienie/rollback PASS, klient WWW9 kontroli PASS, TypeScript/Vite i składnia PHP PASS. Przeglądarka: zapis i użycie szablonu, pełny mecz setowy, undo końca, reload/wznowienie. [Zakres i ograniczenia testów](docs/TESTING.md). To nie są próby fizycznego telefonu ani kamery.

Gałąź `feature/apk-integration-20261025`. Brak push/merge/wdrożenia i zapisów produkcyjnych. Produkcja nadal odpowiada stanowi konsolidacji poniżej (kod bazowy a7f7f06). Cudze TASK/audyt w dart-lens zachowane bez zmian. Następne decyzje: osobna autoryzacja wdrożenia; testy telefonów P0/P1 nadal oczekują.

## Jedna wersja panelu

Decyzja użytkownika: ten backend PHP/SQLite i WWW ma działać pod https://dartlens.host749284.xce.pl/. Przełączenie wykonano 27.10.2026 o 22:06 CET. Dotychczasowy https://host749284.xce.pl/dart/ przekierowuje HTTP302 na domenę docelową, a jego API zwraca410 z informacją o aktualizacji APK. Nie łączymy SQLite ze starym MySQL i nie uruchamiamy drugiej niezależnej bazy.

Docelowy katalog: `/home/host749284/domains/dartlens.host749284.xce.pl/public_html/dart-lens-app/public`. Konfiguracja/PIN i cała baza zachowane: integralność kopii i bazy docelowej OK, zgodność liczby rekordów wszystkich tabel, 6 graczy/2 mecze/14 wizyt. Sparowanych urządzeń było0; klucz urządzeń nie był jeszcze utworzony. Stary panel MySQL przeniesiono do prywatnego archiwum. Lokalne źródła MySQL są w sąsiednim `dart-lens/archive/online-mysql-20261024/`.

Kod integracji: wspólni gracze/mecze, pojedyncze lotki i wizyty, korekta/cofnięcie, rewizje, deduplikacja, audyt, ograniczone dostępy urządzeń i propozycje jednej aktywnej kamery. Tylko operator zatwierdza punkty. Brak internetu blokuje nowe zapisy. [Kontrakt API](docs/API.md), [wdrożenie](DEPLOY_HOSTIDO.md).

## Dowody i ograniczenia

Poprzednia weryfikacja kodu: API 19/19, klient WWW 9 kontroli, kopie SQLite 6/6, TypeScript/Vite PASS. Zalogowana próba 26.10 na starym adresie: mecz testowy #2, S20 → korekta D20 → cofnięcie; dwie karty i audyt zgodne. Oryginalny mecz i gracze zachowani. To dowód sprzed przełączenia domeny.

APK 1.0.1/kod11 przygotowane w sąsiednim `dart-lens`, z migracją dokładnego starego adresu i zachowaniem oczekujących komend. Build/lint/pakowanie PASS, Android 301 PASS/1 pominięty test PHP. Aktualizacja telefonu, aparat, parowanie na docelowym HTTPS i pilot gry nadal niepotwierdzone.

Po weryfikacji migracji: próby P0/P1, następnie co najmniej 200 opisanych rzutów i 30 minut gry według `dart-lens/docs/DEVICE_TESTS.md`. Wyniki sprzętowe oddzielać od testów kodu. Brak automatycznego punktowania, skanera QR i fuzji kilku kamer online.

Historia: [stan przed konsolidacją](archive/history/PROJECT_STATE-before-consolidation-20261027.md). Gałąź lokalna `feature/apk-integration-20261025`; brak push/merge. Załączniki Work i inne czaty nie synchronizują automatycznie lokalnych plików.

Kontrola po przeniesieniu: HTTPS200 dla strony, zasobów JS/CSS i API session; config/SQLite/sekret403; stare API MySQL404. Przeglądarka potwierdziła przekierowanie i ekran logowania pod nową domeną. Nie wykonano nowej zalogowanej gry po zmianie domeny. Jednorazowy CRON usunięty, lista pusta.

Archiwum serwera: /home/host749284/dart-online-backups/canonical-20261026 (wykonane27.10), zawiera dart-online-before, legacy-mysql-app, legacy-mysql.sql i manifest. MySQL10tabel wyeksportowane, baza nieusunięta; własne open_basedir zachowane. Historia przygotowanej nazwy katalogu nie zmienia daty wykonania.
