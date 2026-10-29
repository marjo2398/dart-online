# Doprecyzowanie WWW1.2.0/schema8 — 29.10.2026

APK1.2.0 nadal korzysta z kontraktu v1 poniżej. Import wymaga uwierzytelnionego APK/operatora; publiczna rola przeglądarki go nie wykonuje. Usunięto logowanie wyłącznie z WWW. games.import_mode zapisuje jawne share: shared jest wspólną grą serwera, archive historią tylko do odczytu. Dawna decyzja jest odzyskiwana z audytu; brak dowodu daje unknown/tylko odczyt. Zachowano origin/local IDs, mapowania, komendy/UUID, rewizje i dawne odpowiedzi. [Migracja/dostęp](PUBLIC_ACCESS.md). Bez wdrożenia produkcji.

---

# Kontrakt lokalnej gry i synchronizacji — v1

Obowiązuje dla natywnego APK1.1.0 i API/schema7. Wdrożenia produkcyjnego nie wykonano. WWW etapy1–3 pozostają zachowane; etap4 anulowano. Nie ma serwera PHP w APK ani nowego transportu LAN.

## Własność i zgodność zasad

`dart-lens-x01/1` oznacza konfigurację formats1 i operacje2: config z `version=1`, scoring(start,in,out), match(unit,target), legs_per_set, deciding(win_by_two,extra_pairs), final_set oraz starters(method,player,leg_rotation,set_rotation,decider). Reguły i domyślne wartości odpowiadają `formats.php`/`operations.php`; telefon wykonuje czysty Kotlin `X01Rules`/`LocalGameEngine`. Random ma trwale zapisany wynik, bull-off wskazuje człowiek.

39 wspólnych scenariuszy ma ręcznie określone oczekiwania stanu/błędów. Pliki `contracts-x01-v1.json` i Android `app/src/test/resources/x01-v1-cases.json` muszą być identyczne. PHP: `backendtests/rules-contract.php`; Kotlin: `X01ContractTest`. Oczekiwań nie uzyskano przez uruchomienie któregokolwiek silnika. To dowód dla tych scenariuszy, nie formalny dowód wszystkich możliwych wejść.

Telefon prowadzi wyłącznie `local`. Sieć nie przełącza właściciela. `transferring` blokuje lokalne zmiany, `online`/`archive` oznacza potwierdzone przyjęcie przez serwer; kopia telefonu jest tylko do odczytu. Nie ma automatycznego scalania równoległych kopii ani automatycznego przejścia online→lokalny.

## Nowe endpointy

Klient używa HTTPS, `X-Dart-Formats: 1`, `X-Dart-Operations: 2`. HTTP jest dopuszczone wyłącznie przez jawną testową instancję klienta na loopback. Istniejące endpointy i ID nie są zastępowane.

| Endpoint | Autoryzacja / zachowanie |
|---|---|
| POST `app-authorize` | Body: password, device_name, join_id(UUID); opcjonalnie device_id i previous_token do odnowienia tej samej tożsamości. PIN/hasło weryfikowane tym samym hashem/rate-limit jak panel, bez utrwalania PIN-u. Zwraca token i device. Jawna autoryzacja PIN-em daje natywne uprawnienia admina (`native_admin`), nie import profilu. Odnowienie zachowuje aktora/token, więc utrata odpowiedzi nie osieroca komendy. |
| GET `sync-capabilities` | Wymaga ważnego aktora; zwraca rules_contract, formats1, operations2, schema7. APK sprawdza kontrakt przed zamrożeniem gry. |
| POST `local-game-import` | Globalny uprawniony operator/admin ze score; zwykła kamera/widz i dostęp przypisany do innego meczu nie importują. Zwykły mechanizm command_id/expected_revision=0, deduplikacja i transakcja runCommand. |
| POST `profile-create` | Administrator; pełne utworzenie pól nowego profilu w tej samej transakcji i ledgerze. `profile-save` może jawnie zachować/zmienić archived z kontrolą profile_revision. Dawne endpointy nadal działają. |

`local-game-import` zawiera:
- command_id(UUID), expected_revision=0, contract=`dart-lens-x01/1`;
- origin_id(UUID instalacji), local_game_id(UUID), share(boolean), config, created_at;
- players[2]: trwały lokalny id, nazwa i dostępne pola profilu;
- mappings[2]: `mode=new` z odrębną nazwą albo `mode=existing` z server_id i profile_revision. Samo podobieństwo nazwy nie mapuje osoby. Opcjonalne update_profile=true wymaga admina, jawnej zgody i bieżącej wersji; nie reaktywuje archiwalnego profilu;
- commands: rzeczywiste action/body, UUID, ciągłe expected_revision oraz recorded_at dla dostępnej rzeczywistej daty; bez fikcyjnego rozbijania sum;
- expected_state: pozycje1/2, scores/darts/legs/sets/current/winner/starter/leg/set/phase/status/paused/confirmed z telefonu.

Dozwolone replay: dart-create, visit-create, remaining-create, visit-undo, history-correct, starter-select, game-pause/resume, game-adjudicate, result-confirm/reopen. `history-correct` przechodzi przez obecny correctionPlan/applyCorrection; serwer mapuje realne ID wizyt/lotek i sprawdza prawa każdej operacji. Lokalne pozycje graczy1/2 są mapowane na niezmieniane globalne server_id.

Serwer w jednym BEGIN IMMEDIATE tworzy/wiąże profile, odtwarza historię istniejącym silnikiem, porównuje expected_state i zapisuje wynik importu, mapy, audyt i ledger. Rozbieżność kończy się422/rules-replay-mismatch i rollbackiem całości. Lokalny opis dat i źródeł jest zachowany; data zatwierdzenia nie przesuwa rzeczywistej daty zakończenia. Nieznane pola, cele i próby pozostają NULL.

Odpowiedź: local_game_id, command_id, game_id, players(local_id/server_id/profile_revision), owner=server, snapshot. Atomowy zapis telefonu potwierdza właściciela i mapy; potem odczytuje świeży stan. Powtórna odpowiedź ledgeru może być historyczna i nie zastępuje nowego GET.

## Powtórzenia i konflikty

Unikalne `(origin_id,local_game_id)` oraz hash kanonicznej treści chronią przed drugim meczem także przy innym command_id/aktorze. Ten sam payload zwraca to samo przyjęcie; inna historia409/import-conflict i nie nadpisuje korekt/archiwizacji. Wynik/statystyki liczone są z jednego game_id. Telefon liczy zachowaną kopię raz; nie dokłada jej jako drugiego meczu do cache serwera.

409/profile-conflict wymaga odświeżenia i ponownego wyboru wersji/tożsamości. Archived/merged profil jest odrzucany, nie reaktywowany starszą kopią. Nowy profil można utworzyć z odrębną nazwą albo anulować import. Lokalne pola istniejącej osoby domyślnie nie nadpisują serwera. Profil sam w sobie nie przyznaje ról ani operatora.

Timeout, utrata procesu i401/403 zachowują zamrożony payload/UUID/środowisko. APK ponawia tę samą operację po autoryzacji. Niepewna komenda online również zachowuje ID/treść i przypisanie do aktora/serwera; wylogowanie/zmiana środowiska są blokowane. Potwierdzone błędy walidacji importu mogą odblokować lokalną grę, bo transakcja niczego nie przyjęła.

Granice jednego importu:3000 komend,2MiB JSON; sprawdzane przed przekazaniem. Lokalna gra nie ma tego limitu liczby komend i pozostaje dostępna z eksportem. Odpowiedzi klienta do4MiB; duże analizy wymagają filtrów. Zegary zapisów są walidowane, błędny zegar nie powoduje czyszczenia danych.

## Migracja i współpraca

Schema7 dodaje devices.native_admin (stare urządzenia=0), local_imports i local_profile_links. Nie przepisuje starych ID, komend, odpowiedzi, profili ani ról. Migracja jest powtarzalna, blokowana transakcyjnie i odrzuca kolidujące częściowe tabele; stare bazy testuje `migration-offline.mjs` z kodu v6/2a03c9c i wstrzykniętym błędem.

Kody `device-code-create`/`device-join`, camera-select i observation-create/review pozostają wspólnym protokołem. Natywny admin może wystawić kod w APK; role i uprawnienia są nadal sprawdzane na serwerze. Jeden aktywny punktujący telefon-kamera dla wspólnego meczu; bez wideo, fuzji i LAN. Samo wybranie ekranu kamery nie nadaje roli.

[Instrukcja APK](../../dart-lens/docs/ONLINE_QUICK_START.md) · [mapa ekranów i ograniczenia](../../dart-lens/docs/OFFLINE_PLAY.md) · [API](API.md)
