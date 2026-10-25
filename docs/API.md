# Dart Online API — integracja natywna v3

Punkt wejścia pozostaje `api/index.php?action=...`, względem katalogu panelu (produkcja `/dart/`). PHP 7.4+, SQLite; standardowe HTTPS. Odpowiedzi `{ok:true,data:...}` / `{ok:false,error:{code,message,details?}}` i `Cache-Control: no-store`.

## Dostęp

WWW zachowuje `session`, `login {password}`, `logout`, cookie HttpOnly/Secure/SameSite=Strict i `X-CSRF-Token`. APK używa `Authorization: Bearer <token>`; nie potrzebuje cookie/CSRF. Nie wolno przekazywać tokenu w URL ani logach. Każdy odczyt i zapis ponownie sprawdza ważność/uprawnienia; również przed wydaniem odpowiedzi na powtórzoną komendę.

`device` ma `{id:string, name:string, role:'operator'|'viewer'|'camera', game_id:number|null, expires_at:number, revoked:boolean}`. Wygaśnięcie to Unix seconds. Tryb interfejsu APK jest niezależny od uprawnienia. Operator może prowadzić grę i pełnić funkcję aktywnej kamery; kamera może jedynie czytać przypisany mecz i publikować obserwacje. Widz tylko odczytuje. Operator bez przypisanego meczu korzysta ze wspólnej listy graczy i może tworzyć mecze/graczy. Usuwanie danych i zarządzanie dostępami pozostaje administratorowi WWW.

- POST `device-code-create`: `{command_id,expected_revision:0,role,game_id:null|number,expires_hours:1..168}` → `{code,expires_at,role,game_id}`. Administrator, kod jednorazowy ważny 10 minut. Kamera/widz wymagają `game_id`.
- POST `device-join`: `{code,device_name,join_id:UUID}` → `{token,device}`. Bez sesji, limit prób. Powtórzenie dokładnie tej samej treści i `join_id` odzyskuje identyczne poświadczenie po utracie odpowiedzi, dopóki dostęp jest ważny. Inna treść pod `join_id` jest odrzucana. Nie generować nowego `join_id` przy retry.
- GET `device-self` → `{device}`.
- GET `devices` → `{devices:Device[]}` (administrator).
- POST `device-revoke`: `{command_id,expected_revision:0,device_id}` (administrator). Cofnięcie wyłącza aktywną kamerę, zwiększa rewizję jej meczu i unieważnia obserwacje.

QR niesie wyłącznie tekst JSON `{ "type":"dart-online-pair", "version":1, "base_url":"https://host749284.xce.pl/dart/", "code":"..." }`; kod można też wpisać ręcznie. Wydanie nowego kodu wymaga zalogowanego administratora; po wygaśnięciu/cofnięciu urządzenie paruje się ponownie.

## Komendy i synchronizacja

Każdy POST modyfikujący dane poza login/logout/device-join wymaga `command_id` UUID i całkowitego `expected_revision >= 0`. Operacje meczu mają jego aktualną monotoniczną rewizję; katalogowe i utworzenie meczu używają 0. Wszystkie zapisy przechodzą przez tę samą transakcję SQLite `BEGIN IMMEDIATE`: autoryzacja, odczyt deduplikacji i porównanie kanonicznej treści, sprawdzenie rewizji, zmiana stanu/audyt/statystyk, zapis odpowiedzi komendy, COMMIT. Zmieniona treść tego samego klucza daje `409 command-payload-conflict`. Konflikt rewizji daje `409 revision-conflict`; nie ponawiać starej operacji z nową rewizją bez decyzji człowieka.

GET `command-status&command_id=UUID` → `{status:'unknown'}` lub `{status:'saved',result:...}` dla własnej tożsamości. Wynik zapisanej komendy może być historycznym snapshotem, dlatego po odzyskaniu potwierdzenia pobiera się `game`. Przy nieznanym wyniku można bezpiecznie wysłać dokładnie tę samą komendę. Nie tworzyć nowego UUID. Klient rozróżnia oczekuje/zapisana/odrzucona/wynik nieznany, nie nalicza wyniku optymistycznie.

GET `dashboard` zachowuje `{players,active_games,history}`; urządzenie przypisane do meczu dostaje tylko ten mecz i jego zawodników. GET `game&id=N` daje zgodny snapshot. Polling wybranego meczu 0,5–1 s, timeout, backoff, anulowanie/ignorowanie odpowiedzi starego meczu/sesji i brak nakładających się polli. Brak sieci blokuje nowe zapisy i oznacza ostatni stan jako nieaktualny.

## Snapshot

Dotychczasowe `game`, `players`, `visits`, `can_undo` pozostają. Dodane:

- `game.revision:number`, `game.active_camera_id:string|null`, `game.camera_epoch:number`;
- `game.context:{revision,player_id:number|null,leg_no,visit_no,dart_no,camera_epoch}` — dokładny kontekst kolejnej lotki, bez wyliczania po stronie klientów;
- `Visit.mode:'aggregate'|'darts'`, `Visit.is_complete:boolean`;
- `partial_visit:Visit|null` (ten sam rekord znajduje się w `visits`, nie sumować drugi raz);
- `darts:[{id:string,game_id,leg_no,visit_id,visit_no,player_id,dart_no,field,source,device_id:string|null,observation_id:string|null,created_at,active:boolean}]` — aktywne lotki z dokładnymi polami; historyczne sumy nie mają zgadywanych lotek;
- `observations:[{id:string,device_id:string,game_id,revision,player_id,leg_no,visit_no,dart_no,camera_epoch,field,status:'pending'|'accepted'|'rejected'|'stale',created_at,accepted_dart_id:string|null,accepted_revision:number|null}]` — pending i ostatnie zakończone odczyty;
- Obserwacja ma też `expires_at` (Unix seconds), 60 sekund od przyjęcia. Po tym czasie odczyt pokazuje `stale`, a zatwierdzenie jest odrzucane bez zmiany punktów. GET nie wykonuje zapisu do bazy.
- `devices:Device[]` przypisane do meczu i dostępni operatorzy mogący działać jako kamera;
- `audit:[{id:number,command_id,action,target_id:string|null,created_at}]` — ostatnie operacje; pełne oryginalne dane pozostają w bazie.

## Wynik

Dotychczasowe `player-create {name}`, `player-delete {player_id}`, `game-create {player1_id,player2_id,legs_to_win,starting_score}`, `game-delete {game_id}`, `game-finish {game_id}` pozostają z metadanymi komendy. Start 301/501/701/901, legi do 1/2/3/5, double-out.

- `visit-create {game_id,player_id,score:0..180,darts_used:1..3,double_confirmed:boolean}` → snapshot. Zwykła suma wymaga 3 lotek; bust/checkout faktycznej liczby. **Jeśli trwa częściowa wizyta lotkowa, błąd `409 partial-visit-exists`**. Należy dokończyć lotki lub jawnie je cofnąć przed wpisaniem sumy. Nigdy nie dodaje się sumy obok części już naliczonej.
- `dart-create {game_id,player_id,field}` → snapshot. `field`: S1..S20 / D1..D20 / T1..T20 / `25` / `50` / `MISS`. Natychmiast publikuje wynik częściowy. Serwer obsługuje bust (odwraca punkty całej wizyty), double-out i zmianę tury po trzech lotkach.
- `visit-undo {game_id}` → snapshot. W wizycie lotkowej cofa ostatnią lotkę, w sumarycznej całą wizytę. Undo checkoutu przywraca grę. Rewizja zawsze rośnie, oryginalne dane/audyt pozostają.
- `dart-correct {game_id,dart_id,field}` → snapshot. Jawna korekta **ostatniej aktywnej lotki**; starsze operacje trzeba najpierw jawnie cofnąć. Pierwotna lotka pozostaje w audycie, zastępująca ma nowy identyfikator.
- `visit-correct {game_id,visit_id,score,darts_used,double_confirmed}` → snapshot. Korekta ostatniej wizyty sumarycznej, z zapisem oryginału. Nie dopisuje nowej wizyty do statystyk.

Statystyki liczą wyłącznie bieżące projekcje wizyt (także częściową); szczegółowe lotki i audyt nie dodają drugich punktów. Po zamknięciu/buście/undo/korekcie projekcje i statystyki aktualizują się atomowo. Szczegóły lotek nie są odtwarzane z dawnych sum.

## Kamera i obserwacje

- `camera-select {game_id,device_id:string|null}` — administrator/operator; wybiera jedno urządzenie z rolą operator lub camera. Zmienia rewizję i `camera_epoch`, unieważnia pending starego kontekstu. Kamera sama nie przejmuje roli aktywnej.
- `observation-create {game_id,observation_id:UUID,player_id,leg_no,visit_no,dart_no,camera_epoch,field}` + command metadata. Aktywna kamera/operator o właściwej tożsamości, kontekst dokładnie zgodny ze snapshotem. Zwraca snapshot; nie zmienia punktów ani rewizji meczu. Obraz pozostaje na telefonie.
- `observation-review {game_id,observation_id,decision:'accept'|'reject',field?}` — administrator/operator. Przy accept `field` może poprawić odczyt, w przeciwnym razie używany jest odczyt. Jedna transakcja dopisuje dokładnie jedną lotkę i statusaccepted z `accepted_dart_id`/`accepted_revision`. Reject nie zmienia punktów ani rewizji. Odczytu nie można zatwierdzić dwa razy z różnych ekranów.
- GET `observation-status&game_id=N&observation_id=UUID` → pojedynczy obiekt obserwacji (przydatne po reconnect).

Każda operacja wyniku, cofnięcie, korekta lub zmiana kamery unieważnia pozostałe pending. Kamera nie odtwarza dawnych odczytów po reconnect. Dalsze uzbrojenie wymaga potwierdzenia własnego observation_id, accepted_dart_id i dokładnie odpowiadającej rewizji; późniejsza rewizja zatrzymuje cykl. Nie ma autonomicznej akceptacji ani fuzji A/B online.

Jedno urządzenie nie może być aktywną kamerą dwóch meczów. Przed wyborem w innym meczu operator wyłącza je w poprzednim przez `camera-select` z `device_id:null` i aktualną rewizją. Kamera z wygasłym dostępem nie może publikować, a jej dawnych propozycji nie można zatwierdzić.

## Przechowywanie i kopia

Poświadczenia urządzeń są w SQLite wyłącznie jako SHA-256. Odzyskanie identycznego tokenu po ponowieniu parowania używa HMAC i losowego klucza `api/data/device-secret.bin` (32 bajty, prawa 600). Klucz jest chroniony tą samą blokadą HTTP co SQLite i należy do kopii danych, nigdy do paczki ani Git. Nie usuwać go przy wdrożeniu. Zmiana klucza uniemożliwia odzyskanie poprzedniego wyniku parowania; istniejące tokeny nadal sprawdzane są według hasha. Kody jednorazowe mają 48 bitów entropii i limit 30 prób parowania / 15 minut / IP. Odpowiedź komendy wystawienia kodu jest zapamiętana w prywatnym ledgerze dla bezpiecznego retry; sam kod wygasa po 10 minutach.

Migrowanie schematu v2 → v3 zachowuje identyfikatory i historyczne sumy. `visits` to aktualna projekcja punktów/statystyk, `darts` zachowuje również wycofane szczegóły, a `audit.original` przechowuje poprzedni snapshot i `target_id` operacji. Oryginał cofniętej/korygowanej sumy pozostaje w audycie; nie generuje się dla niego wymyślonych pól tarczy. Każdy zapis i jego odpowiedź są jedną transakcją `BEGIN IMMEDIATE`; spójny snapshot GET korzysta z jednego widoku odczytu WAL.

## Test kontraktu

`node backendtests/integration.mjs` uruchamia dwa niezależne procesy PHP i osobną rzeczywistą bazę SQLite w nowym katalogu tymczasowym. Ustaw `DART_TEST_PHP` na lokalny interpreter z PDO SQLite; domyślny adres portable runtime dotyczy stanowiska tego projektu. Testy nigdy nie odczytują produkcyjnego config ani danych.
