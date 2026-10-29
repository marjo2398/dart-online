# Publiczny panel istniejącej aplikacji — 29.10.2026

public.php dodaje rolę public/bootstrap CSRF niezależne od Bearer/legacy login. Allowlistowane komendy nadal przechodzą runCommand, transakcję, rewizję i audyt. Liczniki żądań są oddzielnymi krótkimi transakcjami, bez zmiany wyniku. Schema8 zachowuje dane, odzyskuje import_mode z jawnego audytu i blokuje edycję archiwum/nieznanego trybu. [Szczegóły](PUBLIC_ACCESS.md).

React nadal renderuje istniejące komponenty/snapshot. Menu przenosi funkcje, prosty konfigurator tworzy config1. Klawiatura nie ma silnika gry, presety/CLR nie zapisują bez OK. Bez PWA/offline WWW, nowego panelu i nowych zależności. Telefon zachowuje lokalną własność; urządzenia własne uwierzytelnianie.

---

# APK offline i atomowy import — 29.10.2026

Telefon ma oddzielny silnik Kotlin zgodny z kontraktem `dart-lens-x01/1` i lokalny transakcyjny SQLite. PHP pozostaje silnikiem wspólnego meczu online; nie jest przenoszone do APK.39 ręcznie określonych scenariuszy uruchamia Kotlin i PHP. `offline.php` dodaje schema7, jawny natywny dostęp PIN i import przez istniejący runCommand/ledger/audyt; nie zastępuje replayFormat/evaluateDarts ani ukończonych etapów WWW.

Unikalny origin/local game, frozen payload i porównanie stanu replay dają jednego właściciela i jeden wynik/statystyki. Tabele profili i identyfikatory serwera zostają. Mapowania są jawne, istniejące profile chroni rewizja, a import nie przydziela ról. Szczegóły: [OFFLINE_SYNC](OFFLINE_SYNC.md). Produkcyjnych sekretów, konfiguracji i danych nie zmieniono.

---

# WWW i serwer wyniku

## Operacje etapu 2 — schemat v5

`operations.php` rozbudowuje istniejące replay/evaluateDarts o walidację wizyty sumarycznej, stany operacyjne, decyzje/zgody, podpowiedzi i plan korekty. Nie ma drugiego silnika klienta. Korekta przelicza istniejące rekordy w kolejności; wizyty używają wspólnego evaluateAggregate, pola wspólnego evaluateDarts, a przejścia leg/set/mecz tego samego replayFormat. Podgląd ma spójny widok odczytu SQLite, nie zapisuje planu ani historii. Token SHA256 wiąże parametry i przewidywany wynik z rewizją; nie jest uprawnieniem. Zapis ponownie sprawdza prawa, rewizję i cały plan w BEGIN IMMEDIATE, archiwizuje poprzednie wersje i atomowo aktualizuje projekcję/komendę/audyt/statystyki.

Migracja v4→v5 przebudowuje visits z częściowym UNIQUE(game_id,visit_no) WHERE active=1. Inactive zachowuje fizyczne rekordy i pozwala kontynuować od wycofanego miejsca. Nowe: active, double_confirmed (dla starego double-out checkoutu fakt znany z jego flagi; straight-out nie dostaje fikcyjnego potwierdzenia double), input_mode; stany games.is_paused/decision_json/confirmed_at/stats_eligible; jawne permissions_json urządzeń/kodów, actor_context/details_json audytu, append-only record_versions i result_decisions. Zachowane stare pola/ID, sekwencje AUTOINCREMENT jako liczby całkowite, dane, statystyki i znaczenie zakończeń. Stare mecze nie są automatycznie zatwierdzane. FK wyłączone tylko na połączeniu migrującym poza transakcją, kontrolowane przed commit i przywracane po rollback. Wymuszony błąd jest testowany; ponowienie migracji nie duplikuje danych.

UUID i deduplikacja pozostają związane z dotychczasową tożsamością aktora. Bieżące prawa/zakres są sprawdzane przed deduplikacją; nowa blokada fazy dopiero po odzyskaniu wcześniej zatwierdzonej odpowiedzi. Dlatego retry przyjętego rzutu podczas późniejszej pauzy/locka niczego nie dopisuje i zwraca oryginał. Nowy rzut jest blokowany niezależnie od nagłówków klienta. `X-Dart-Operations: 2` jest deklaracją rozumienia faz, nie autoryzacją. Starsze odczyty pauzy/locka/decyzji są blokowane, dashboard je filtruje; stara komenda nie jest przepisywana. Kamera przechodzi przez te same fazy i walidację lotki; rewizja i camera_epoch pauzy/wznowienia unieważniają dawny kontekst.

Reguły formatów poniżej pozostają źródłem przejść. Operator WWW: [OPERATOR](OPERATOR.md); szczegóły kontraktu: [API](API.md).

React/Vite wyświetla snapshot i wysyła komendy. `format-preview` waliduje reguły i przygotowuje opis na serwerze. Formularz przechowuje draft, bez własnego silnika wyniku. `public/api/formats.php` zawiera walidację config v1, migrację v4, szablony, odtwarzanie meczu i przeliczenie pojedynczej wizyty. `index.php` zachowuje endpointy/sesje/SQLite i sumy wizyt; `sync.php` transakcje, uprawnienia, deduplikację, rewizje, audyt i potwierdzanie obserwacji.

`games.config_json` jest niezmienną kopią reguł i ustalonego początkowego startera. `starter_results` jest bieżącą projekcją decyzji bull-off według numeru lega; każda decyzja ma również komendę i audyt. `visits` to aktualna projekcja punktów, otwarcia i granic wizyt; `darts` przechowuje rzeczywiste pola oraz wycofane lotki. Replay wizyt z konfiguracją odtwarza fazę, sety/legi, wynik i startera. Żaden klient nie dopisuje wyniku samodzielnie.

Migrowanie SQLite v3→v4 przebudowuje ograniczenia `games` metodą create/copy/drop/rename w jednej transakcji. FK wyłączane wyłącznie na tym połączeniu poza transakcją, sprawdzane przed COMMIT i ponownie włączane także po błędzie. Zachowane identyfikatory, sekwencja AUTOINCREMENT (także usunięte najwyższe ID), komendy/audyt, gracze, urządzenia i wszystkie wizyty/lotki. Nowe kolumny odwzorowują stare straight-in/double-out i naprzemienny start od gracza 1; nie odtwarzają brakujących pól lotek. Ponowienie nie duplikuje szablonów.

`X-Dart-Formats: 1` oznacza klienta rozumiejącego config v1. Bez niego lista zawiera tylko dawne formaty, a odczyt/zapis/parowanie do nowych oraz odzyskanie nieobsługiwanej odpowiedzi są blokowane. Nagłówek nie zastępuje autoryzacji. APK 1.0.1 go nie wysyła; nie zmieniano Androida. Szczegóły przyszłej obsługi: [API](API.md).

## Etap 3 — analiza źródłowej historii i schemat v6

`profiles.php` prowadzi addytywną migrację v5→v6 i profilowe mutacje w dotychczasowym command ledgerze. Nowe kolumny players: pseudonim/klub/ręka/notatka/preferencje/status gościa/archiwum/alias/profile_revision; visits: nullable recording_level/checkout_attempts/source; darts: nullable target/checkout_attempt. Dawne dane pozostają null, stare profile aktywne i niescalone. games ma opcjonalne context_kind/venue oraz rule_in/rule_out/match_unit — projekcje niezmiennej konfiguracji do indeksowanego filtrowania, zasilane migracją i game-create, nie drugi silnik reguł. Nowe profile_merges, equipment i game_equipment ze snapshotem nazwy/masy. Migracja w jednej transakcji: dodanie kolumn, projekcje reguł i indeksy albo pełny rollback. Nie przebudowuje dawnych rekordów ani ledgeru, nie zmienia poświadczeń, wyników ani znaczenia statusów. Powtórzenie to no-op.

Scalanie zachowuje oryginalne ID uczestników, wizyt i lotek; players.merged_into jest trwałym aliasem, profile_merges śladem. Canonical ID i przechodnie aliasy służą tylko kwalifikacji/łączeniu analizy. Wspólny mecz dwóch grup i dowolny aktywny mecz blokują operację. Token podglądu wiąże wersje profili, mecze/rewizje i liczby danych, a zapis przelicza go w BEGIN IMMEDIATE. Przy błędzie po zmianie aliasu transakcja wycofuje również alias i ledger; retry identycznej komendy zapisuje raz. Stare snapshoty komend pozostają identyczne.

`analysis.php` wylicza metryki bez trwałego cache z active visits i rzeczywistych active darts, w spójnym widoku WAL. Replay etapu1 dostarcza visit_contexts (remaining/opened/set/starter/phase) i rzeczywiste leg_results (długość, checkout, decider); nie ma niezależnego silnika wyniku. Analiza nie używa dawnych agregatów players. Wskazanie checkout opportunity jest wyszukaniem legalnej drogi wg wspólnych fieldQualifies, nie dowodem zamiaru. First-nine rozdziela tylko rzeczywiste pola, nigdy hipotetyczny rozkład sumy. [Definicje i kwalifikacja](METRICS.md).

Indeksy: reguły+created_at/id, osobno obie strony+created_at/id, active wizyty w meczu, active lotki w wizycie, aliasy i właściciel sprzętu. Dane do analizy pobierane grupowo po maks.300 ID zamiast zapytań na każdą wizytę. Historia ma keyset z niezmienną datą utworzenia i ID, filtrowaniem SQL oraz limitem20/100. Nowe odczyty zwalniają blokadę sesji PHP przed analizą. Nie dodano CRON, kolejki, serwera, biblioteki wykresów ani PDF. CSV/JSON mają whitelistę pól, wersję/filtry/pokrycie i nie ujawniają prywatnej części snapshotu technicznego.

Usuwanie zawodnika jest zawsze blokowane, meczu z wizytą/decyzją również. Archiwizacja nie zmienia aktywnego meczu, zaś tworzenie nowego/rewanżu wymaga aktywnych niescalonych graczy. Profile/merge/equipment/metadane i eksport są admin-only; nie nadano nowych praw istniejącym operatorom/kamerom/widzom. Metadane meczu mają tę samą rewizję i blokadę zatwierdzenia. Własne nowe deklaracje są na tych samych rekordach punktowania, transakcyjnie razem z rzutem. Korekta zmienionego rekordu zachowuje jego dawną wersję i czyści niepotwierdzone ponownie deklaracje.
