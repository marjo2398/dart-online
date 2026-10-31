# API1.3.0 / schema9 — 31.10.2026

Aktualny kontrakt parowania i ustawień: [PAIRING_SETTINGS](PAIRING_SETTINGS.md). Nagłówki formats1/operations2, publiczny CSRF, uprawnienia, rewizje i idempotencja pozostają. `sync-capabilities` dodaje version1.3.0, schema9, pairing{digits:4,ttl_seconds:300,recovery:1}, apk_url.

`device-code-create`: opcjonalny pairing_session UUID wystawcy; nowa odpowiedź code jako4cyfrowy string, pairing_id, expires_at/server_time(epoch sekundy), role/game_id. TTL300s. Nie przesyłaj PIN-u jako liczby. `device-join` nadal bez starego Bearera; obsługuje4cyfry i istniejący12-hex kod do jego terminu. Próby:8/min i30/15min/IP; generowanie12/min/IP lub wystawca. Transakcja atomowo zużywa grant. Aktywne tokeny nie zmieniają się.

`device-self`/inne Bearer:401 device-revoked, device-expired lub invalid-device-token; żaden nie przechodzi do publicznego aktora. publicDevice dodaje access_status (authorized/expired/revoked), niezależny od obecności online. `app-authorize` z dowodem nieaktywnego tokenu wymaga X-Dart-Recovery:1 (stary klient409 client-update-required), tworzy nowy ID/token, nie reaktywuje starego.

`POST command-recover` wymaga ważnego nowego Bearera, previous_device_id UUID, previous_token, action i command (dokładna oryginalna komenda z UUID/revision). Nie jest to replay ani nowa komenda punktująca. Pod blokadą ponownie weryfikuje nowy dostęp, dowód starego nieaktywnego dostępu i aktualne uprawnienia/zakres action+game_id. Zgodność payload_hash jest obowiązkowa. Zwraca status saved/not-saved, command_id, replayed:false, result (oryginalny wynik lub null). Brak uprawnień403 pozostawia kolejkę; konflikt UUID/treści409. Dowodu/tokenów nie logować i nie eksportować do diagnostyki. Koperta recovery ma limit64KiB (pozostałe zwykłe komendy nadal32KiB, import2MiB), aby zmieścić niezmienioną pełną komendę oraz dowód. Zwykłe ponowienie pod nowym aktorem nie jest bezpiecznym zamiennikiem tego endpointu.

Migracja8→9: pairing_codes (HMAC PIN-u, wystawca, scope, TTL, zużycie) oraz pairing_generations (limity); istniejące device_codes/urządzenia/komendy/historyczne konfiguracje bez zmian. Nowe wyniki generowania w commands.result są AES-256-GCM; command-status i deduplikacja odszyfrowują odpowiedź. Prywatny device-secret i config są zachowane. Wymagane PDO SQLite i OpenSSL. Test rollbacku wstrzykuje błąd przy schema9 i sprawdza brak częściowych tabel.

Poniższa dokumentacja szczegółowa opisuje wcześniejsze kontrakty bazowe; nowy PIN i cofnięcie dostępu definiuje ta sekcja.

---

# Aktualny dostęp WWW — 29.10.2026, WWW1.2.0/schema8

GET public-session zwraca access=public, authenticated=false, csrf_token i expires_at bez uwierzytelnienia osoby. Publiczna rola, allowlista komend, jednokrotne odnowienie CSRF, limity i audyt: [PUBLIC_ACCESS](PUBLIC_ACCESS.md). Dawniejsze admin-only opisy poniżej zachowują ograniczenia urządzeń; publiczne WWW ma teraz jawne prawa panelu aplikacji, bez hostingu/bazy/sekretów.

Każde Authorization musi przejść walidację niezależnie od X-Dart-Client. APK nadal dart-lens-x01/1, formats1/operations2 i własne tokeny/PIN/parowanie. sync-capabilities.schema=8; analiza/eksport nadal reprezentacja schema_version6/metrics_version1. Dawne session/login/logout pozostają zgodne, nowy frontend nie używa ich do wejścia.

Snapshot/lista/raport addytywnie: game.origin (podsumowanie: origin), kind server/android, mode null/shared/archive/unknown, read_only. Archiwum odmawia edycji409 archive-read-only i ma puste permissions. Stare odpowiedzi ledgeru nie są przepisywane — po retry pobierz świeży game. [Wyniki upgrade](WEB_UPGRADE.md).

---

# Rozszerzenie APK offline — 29.10.2026

Bieżący schemat7, format1/operacje2 oraz wersjonowane zasady `dart-lens-x01/1`. Dodano app-authorize, sync-capabilities, local-game-import i profile-create; profile-save zachowuje kontrolę wersji także przy jawnej archiwizacji. Pełny kontrakt, role, retry, daty, atomowe przekazanie właściciela i limity: [OFFLINE_SYNC](OFFLINE_SYNC.md). Istniejące operacje poniżej pozostają aktualne. Nie wdrożono tej zmiany na produkcję.

---

# Dart Online API — formaty v1, operacje v2, metrics v1 (SQLite v6)

## Prowadzenie gry — etap 2, lokalnie 29.10.2026

Nowy WWW wysyła jednocześnie `X-Dart-Formats: 1` i `X-Dart-Operations: 2`. Drugi nagłówek deklaruje rozumienie faz, nie nadaje praw. Brak ops2 blokuje nowe operacje (poza odzyskaniem już przyjętej odpowiedzi). Odczyt pauzy, decyzji administracyjnej i zatwierdzonego wyniku zwraca starszemu klientowi `409 client-update-required`; dashboard filtruje takie mecze. Każda próba nowego rzutu/akceptacji kamery podczas pauzy daje `409 game-paused`, a po zatwierdzeniu `409 result-locked`, niezależnie od nagłówków. Po decyzji administracyjnej korekta/punktowanie wymaga `result-reopen` (`409 decision-closed`).

Metadane mutacji pozostają `{command_id:UUID,expected_revision}`. Retry tej samej zaakceptowanej komendy zwraca pierwotną odpowiedź przed kontrolą nowej fazy, bez nowego rzutu; ważność aktora/praw i treść UUID nadal są sprawdzane. Nie zmieniono UUID ani treści komend APK1.0.1. Przyszły Android musi poza config/setami obsługiwać phase/operation_state/decision/confirmed_at, prawa, błędy faz i unieważnianie szkiców/podglądów. Sam nagłówek nie wystarczy. Android/APK nie zmieniono ani nie budowano.

- POST `remaining-create {game_id,player_id,remaining:0..starting_score,darts_used:1..3,double_confirmed:boolean,zero_visit_confirmed?:boolean}` + metadane → snapshot. Serwer wylicza sumę. Niezmieniony stan wymaga jawnego `zero_visit_confirmed:true` dla rzeczywistej wizyty za 0 (`422 ambiguous-remaining`); bust trzeba podać jako faktyczną sumę/pola. Wzrost stanu/odjęcie >180/bust udający pozostały stan:422 invalid-remaining. Zachowane blokady częściowej wizyty, wejścia i master-out. Suma i „Pozostało” sprawdzają legalną sekwencję: nie można deklarować lotek po wcześniejszym bust/checkout (`422 impossible-visit-sequence`). Nie zapisuje się hipotetycznego rozkładu sumy na pola.
- GET `checkout-hints&game_id=N&preferred_double=D16` → `{revision,remaining,darts_left,routes:string[][],message}`; preferencja opcjonalna D1–D20/50. Do pięciu legalnych dróg, uwzględniających otwarcie/wyjście i lotki w ręce. Brak zapisu celów, pól i prób na double. Preferencja porządkuje propozycje, nie gwarantuje optymalnej taktyki.
- POST `history-preview {game_id,expected_revision,kind:'visit'|'dart',visit_id?|dart_id?,score?,darts_used?,double_confirmed?,field?,reason,withdraw_dependent:boolean}` → `{preview_token,can_apply,original,proposed,conflicts,withdrawn_visits,withdrawn_darts}`. Dla visit tylko rzeczywista wizyta aggregate i nowa suma/liczba/potwierdzenie double; dla dart UUID aktywnej lotki i nowe pole. Wymaga prawa history, auth/CSRF jak POST i ops2, **bez command_id i bez zapisu**. proposed jest projekcją gry/graczy/wizyt/leg_results, nie potwierdzeniem zapisu ani pełnym snapshotem urządzeń. Konflikt podaje konkretne ID i przyczynę. `withdraw_dependent:true` pozwala zaplanować wycofanie od pierwszego nielegalnego zapisu; nie przenosi rzutów między graczami/legami.
- POST `history-apply` z identycznymi parametrami, `preview_token` i metadanymi → snapshot. Serwer ponownie tworzy plan w transakcji. Zmieniona rewizja:409 revision-conflict; inny token/parametry:409 preview-invalid; brak zgody na sprzeczny dalszy przebieg:409 dependent-history-conflict. Legalne ID i przypisania pozostają, wycofany fragment pozostaje inactive, a wcześniejsze wersje w record_versions. reason jest wymagane (1–1000 bajtów UTF-8).
- POST `game-pause {game_id}` / `game-resume {game_id}` + metadane → snapshot. Prawo pause, aktywny mecz; konflikt fazy:409 invalid-phase. Zmieniają rewizję i camera_epoch, unieważniają pending obserwacji. Pauza blokuje zapisy punktujące/akceptację kamery. Korekty/cofnięcie, kamera/dostępy i decyzje administracyjne pozostają dozwolone z właściwymi prawami.
- POST `game-adjudicate {game_id,kind:'surrender'|'walkover'|'interrupted'|'cancelled',reason,winner_id?,award?:{player1:0..99,player2:0..99}}` + metadane → snapshot. Prawo adjudicate. Dla surrender/walkover wymagany zwycięzca meczu; opcjonalny award musi go wskazywać, jednostkę legs/sets ustala konfiguracja. Dla interrupted/cancelled winner/award są zabronione. Decyzja jest osobna od faktycznych wizyt, legów i setów; wynik pozostaje do zatwierdzenia.
- POST `result-confirm {game_id,reason}` + metadane → snapshot. Prawo confirm; wyłącznie rozstrzygnięty, niezatwierdzony mecz. Blokuje zwykłe zmiany, cofanie i usunięcie, także poprzez usunięcie zawodnika.
- POST `result-reopen {game_id,reason}` + metadane → snapshot. Prawo reopen, wymagane uzasadnienie. Zdejmuje bieżące zatwierdzenie i ewentualną decyzję administracyjną; zachowuje historię i odtwarza faktyczny przebieg. Jeśli nadal kończy on mecz, stan jest resolved i można go poprawić, potem zatwierdzić ponownie.
- POST `game-rematch {game_id,swap_sides:boolean,starter_method:'fixed'|'random'|'bull_off',starter_player:1|2}` + aktualne metadane źródłowego meczu → snapshot **nowego** meczu. Osobne ID i historia, kopia config, nowy zapis początku. Wymaga score oraz nieograniczonego do pojedynczego meczu operatora lub admina WWW. Retry nie tworzy następnego meczu, źródło zachowuje rewizję.

Snapshot dodaje `game.operation_state:playing|awaiting_starter|paused|resolved|confirmed`, `is_paused`, `confirmed_at`, `decision:null|{kind,winner_id,award,reason}`, `stats_eligible`. `game.status` zachowuje active/finished; `result` obejmuje też rodzaje decyzji. `phase` nadal opisuje reguły decidera/przewagi; nie zastępuje operation_state. Nie wnioskuj zamknięcia z samego winner_id. `leg_results:[{leg_no,set_no,winner_id,starter_id,kind:hold|break|unknown}]` odnosi wynik do faktycznego zapisanego startera.

Nowe: `Visit.double_confirmed`, `Visit.input_mode:score|remaining`, `permissions:string[]`, `withdrawn_visits`, `withdrawn_darts`, `record_versions:[{record_type,record_id,original,reason,revision,created_at}]`, `result_decisions:[{action,reason,actor_context,result_json,revision,created_at}]`. active visits/darts nadal są bieżącą projekcją; wycofanych danych nie sumować. `audit` zachowuje dotychczasowy oryginał; w bazie dodatkowo `actor_context` i `details_json` z faktycznym wejściem. Hash sesji/ID urządzenia/rola i deklarowana nazwa nie stanowią potwierdzonej tożsamości człowieka. Nie zapisuje się nowych sekretów ani sugestii checkout jako zamiaru.

`device-code-create` przyjmuje opcjonalne `permissions:['score','correct_last','history','pause','adjudicate','confirm','reopen']` dla operatora. Brak pola zachowuje score/correct_last; kamera/widz wymagają pustego zestawu. W Device dochodzi permissions. Istniejące granty NULL oznaczają dotychczasowe prawa, bez rozszerzenia. Korekta historii, pauza, decyzje, zatwierdzenie i ponowne otwarcie mają oddzielne kontrole serwera; odmowa:403 permission-required (dotychczasowe odmowy roli/zakresu pozostają). Wspólny PIN daje admina, bez osobowych kont.

Statystyki globalne wymagają równocześnie legacy_compatible=1, stats_eligible=1 i aktywnych wizyt. Walkower/interrupted/cancelled wyłączają cały mecz; surrender liczy rzeczywiste punkty/lotki i bilans meczu tylko jeśli odbyły się rzuty. Decyzje nie tworzą checkoutów ani legów. Średnia faktycznego przebiegu w snapshot pozostaje widoczna z oznaczeniem wyłączenia. [Migracja v5](ARCHITECTURE.md), [obsługa](OPERATOR.md), [testy](TESTING.md).

Punkt wejścia pozostaje `api/index.php?action=...`, względem katalogu panelu (docelowa domena `https://dartlens.host749284.xce.pl/`). PHP 7.4+, SQLite; standardowe HTTPS. Odpowiedzi `{ok:true,data:...}` / `{ok:false,error:{code,message,details?}}` i `Cache-Control: no-store`. Rozbudowa formatów z 28.10.2026 jest lokalna, bez wdrożenia.

## Formaty meczu — rozszerzenie kompatybilne

Klient rozumiejący nowe reguły wysyła `X-Dart-Formats: 1` we wszystkich żądaniach, także device-join i odczytach/statusach. Bez tego nagłówka dashboard filtruje nieobsługiwane mecze, a bezpośredni odczyt/zapis/parowanie do nich zwraca `409 client-update-required`. Kontrola obejmuje także ponowienie zapisanej komendy i odzyskanie cache game-create przez command-status. Nie zmieniono uprawnień/CSRF ani wymagań metadanych komendy.

APK1.0.1 czyta `legs_to_win`, globalne `legs` i `status`, oblicza BO=2*legs_to_win−1, nie odczytuje config/setów/remisu/faz. Nie wysyła nagłówka formatów. Dlatego nie otrzymuje nowych meczów zamiast ignorowanego pola unsupported. Bez zmian APK działa dawny kontrakt: 301/501/701/901, do 1/2/3/5 legów, straight-in/double-out, gracz 1 i naprzemienny start. Taki sam format utworzony w nowym WWW pozostaje kompatybilny. Inne konfiguracje są ograniczone do WWW.

Przed dodaniem nagłówka do przyszłego Androida trzeba zmienić `OnlineModels.kt`/`OnlineScreen.kt`/`OnlineViewModel.kt` i obsługę komend: renderować sety i legi seta, remis i fazy, start/otwarcie, null current_player przy oczekiwaniu, blokady sum przez aggregate_allowed i decyzję starter-select. Samo dopisanie nagłówka byłoby błędem. Nie przygotowano nowej APK.

POST `game-create` przyjmuje albo dotychczasowe pola, albo `{player1_id,player2_id,config}` (nie oba). Każdy mecz kopiuje własne reguły; nie ma endpointu zmieniającego je w trakcie. Przykład config:

```json
{
  "version": 1,
  "scoring": {"start":501,"in":"straight","out":"double"},
  "match": {"unit":"sets","target":3},
  "legs_per_set": 3,
  "deciding": {"win_by_two":false,"extra_pairs":null},
  "final_set": {"target":3,"win_by_two":true,"extra_pairs":2},
  "starters": {"method":"fixed","player":1,"leg_rotation":"alternate","set_rotation":"alternate","decider":"bull_off"}
}
```

Wartości i precyzyjne reguły: [SPEC](SPEC.md). `start`:2–10001, `in/out`:straight/double/master, `unit`:legs/sets/fixed, `target` i `legs_per_set`:1–99, `extra_pairs`:null lub 0–50. `final_set`:null lub obiekt powyżej; tylko dla setów. `method`:fixed/random/bull_off, `player`:pozycja 1/2 (nie ID; wynik random zapisuje serwer), rotacje alternate/same, decider rotation/initial/bull_off. Przechowuj wyłącznie target: BO N przelicz na (N+1)/2 i wymagaj całkowitego wyniku. Pola best_of/to_win w match są odrzucane. fixed zabrania przewagi i specjalnego decidera; final_set jest w nim niedozwolony.

- POST `format-preview {config}` → `{config,description,legacy_compatible}`. Autoryzacja i CSRF jak pozostałe POST; operacja tylko waliduje, nie używa command_id/rewizji i nie tworzy komendy/audytu.
- POST `starter-select {game_id,player_id}` + metadane i aktualna rewizja → snapshot. Wyłącznie oczekiwanie na rzeczywisty bull-off decidera; podaj ID gracza meczu. Zmienia rewizję, audyt i unieważnia propozycje kamery. Powtórzenie tej samej komendy jest bezpieczne. Wynik początkowego bull-off przekazujesz jako starters.player przy tworzeniu meczu.
- GET `dashboard` dla nowego klienta zawiera dodatkowo `templates` i `statistics_scope`.
- POST `template-save {name,config,favorite,template_id?,template_revision?}` + metadane z expected_revision:0 → `{templates}`. Administrator WWW. Bez ID tworzy nowy, z ID edytuje przy zgodnej template_revision, zwiększanej po edycji. Konflikt/usunięcie:409 template-conflict. Nazwa 1–120 bajtów UTF-8.
- POST `template-delete {template_id,template_revision}` + metadane z expected_revision:0 → `{templates}`. Usunięcie nie zmienia meczów. Ulubiony jest bool. Szablony startowe są wspólne i edytowalne; zasiewane tylko podczas migracji, nie wracają po usunięciu.

Nowy snapshot dodaje `game.config`, `format_version:1`, `format_description`, `legacy_compatible`, `result:null|win|draw`, `current_set`, `leg_in_set`, `set_starter_id`, `phase:regular|decider|advantage|sudden_death|awaiting_starter|finished`, `is_decider`, `is_sudden_death`, `aggregate_allowed`. `status:finished` obejmuje remis z winner_id:null; nie wnioskuj zakończenia wyłącznie z winner_id. `max_legs` może być null przy przewadze; dla setów odnosi się do aktualnego seta. Przy oczekiwaniu current_player_id i leg_starter_id są null. Gracze mają `sets`, `set_legs`, `opened` oraz dotychczasowe globalne `legs`. Visit ma `opened_after`. Dashboard summary zawiera config, format_description, legacy_compatible i result.

Single dart i potwierdzona obserwacja używają tych samych reguł wejścia/wyjścia. Suma przed otwarciem double/master-in oraz każda suma przy master-out daje `422 individual-darts-required`; należy wpisać faktyczne pojedyncze pola, także pudła. Przy straight-out zero kończy bez double_confirmed, a 1 nie jest bust. Double-out zachowuje obowiązkowe potwierdzenie. Bust wycofuje punkty całej wizyty i otwarcie z niej. Cofnięcie zamknięcia odtwarza leg/set/mecz i startera; cofnięcie granicy prowadzącej do przyszłego decidera usuwa jego decyzję bull-off.

Globalne pola Player.* liczą wyłącznie legacy_compatible=1, z jawnym opisem statistics_scope. Pozostałe formaty mają statystyki w snapshotach poszczególnych meczów; nie są mieszane w katalogu. Przejście v3→v4 i idempotencja/rollback: [ARCHITECTURE](ARCHITECTURE.md), dowody: [TESTING](TESTING.md).

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

Punkty i średnie aktywnej projekcji obejmują także grę w toku i pauzę. Normalny rozstrzygnięty wynik liczy się do bilansu już przed zatwierdzeniem (zgodność z dotychczasowym działaniem). Zatwierdzenie nie dodaje statystyk drugi raz; ponowne otwarcie/korekta przelicza obowiązujący przebieg według opisanych wyłączeń.

## Etap 3 — profile i analiza, lokalnie 29.10.2026

Schemat SQLite6; nowe endpointy analizy/profili są dostępne wyłącznie zalogowanemu administratorowi WWW. Kamera, widz i sparowany operator dostają403 także dla eksportu. Nie rozszerzono istniejących grantów ani modelu PIN-u. Mutacje nadal wymagają command_id/expected_revision, transakcji, deduplikacji i audytu. Operacje katalogowe mają expected_revision0, profil/equipment dodatkowo własną rewizję; game-metadata wymaga aktualnej rewizji meczu.

- GET `profiles&q=...&state=all|active|archived|guest` → `{players}` ze stałym ID, name/nickname/club/throwing_hand(left|right|both|null)/notes, preferred_double(D1–D20|50|null), hints_enabled(bool|null), archived/is_guest/merged_into/profile_revision/created_at. Dawne pola statystyczne katalogu zachowują dawny ograniczony zakres; źródłem nowego WWW jest metrics v1.
- GET `profile&id=N` → `{player,canonical_id,alias_ids,merges,equipment}`; archiwalne/scalone profile pozostają czytelne.
- POST `player-create {name,is_guest?:boolean}` zachowuje stary kontrakt (brak is_guest=false). Edycja: `profile-save {player_id,profile_revision,name,nickname?,club?,throwing_hand?,notes?,preferred_double?,hints_enabled?,is_guest}` → Player. `profile-archive {player_id,profile_revision,archived}` → Player. Konflikt409 profile-conflict. Zarchiwizowanego/scalonego gracza nie można użyć do nowej gry/rewanżu, także przez stare APK (`409 profile-inactive`). Bieżącego wcześniej rozpoczętego meczu archiwizacja nie przepisuje ani nie blokuje.
- `player-delete` zawsze409 player-delete-disabled, bez kasowania. `game-delete` z jakąkolwiek wizytą (także inactive) lub decyzją daje409 history-protected; wynik zatwierdzony nadal result-locked. Pusty mecz można usunąć. Anulowanie z historią przez game-adjudicate.
- POST `profile-merge-preview {source_id,target_id,reason}` bez command_id, bez zapisu → `{source_id,target_id,games,visits,darts,conflicts:[{game_id,reason}],can_apply,preview_token}`. Liczby dotyczą obu grup aliasów, także inactive; darts jest sumą zapisanych darts_used wizyt. Nie wykonuje automatycznego dopasowania po nazwie.
- POST `profile-merge` z tymi samymi parametrami + preview_token/metadane → `{player,alias_ids}`. Transakcja ponownie sprawdza token i konflikty; zmiana profili/rewizji meczów unieważnia podgląd. Wspólny mecz stron lub aktywny mecz dowolnej grupy blokuje scalenie. Alias i profile_merges zachowują stare ID/uczestników, statystyki docelowego profilu obejmują je raz. Błędy409 preview-invalid/merge-conflict.
- POST `equipment-save {player_id,name,weight?:1..100|null,notes?,archived,equipment_id?,equipment_revision?}` → Equipment; istniejący zestaw wymaga aktualnej rewizji. POST `game-metadata {game_id,context_kind:training|friendly|official|null,venue?:string|null,equipment:{playerId:equipmentId|null}}` → snapshot; admin, rewizja i lock. Właściciel musi odpowiadać stronie/jej aliasom. Przypisanie kopiuje nazwę/masę; niezmienione zachowuje snapshot także po archiwizacji zestawu. Zmiana katalogu nie zmienia raportów. Metadane są opcjonalne, nie zmieniają zasad gry.

Zapis punktów opcjonalnie rozszerza dotychczasową komendę (stare payloady nadal działają):
- `visit-create` / `remaining-create`: `recording_level:quick|extended` (domyślnie quick), `checkout_attempts?:0..darts_used`. Extended wymaga liczby; checkout przy0 próbach jest sprzeczny. Brak = null, nie0. Nadal brak fikcyjnych pól.
- `dart-create` / akceptacja `observation-review`: `target?:legalField|null`, `checkout_attempt?:boolean|null`. Faktyczny field jest odrębny od deklarowanego target. Odmowa deklaracji próby przy lotce faktycznie zamykającej leg daje422; nieobecna deklaracja pozostaje null. Wizyty lotkowe mają detailed; liczba prób znana tylko przy komplecie jawnych flag. source manual/camera-confirmed/correction; stare nieznane źródło sum jest null. Poprawka unieważnia deklaracje zmienionych rekordów, z zachowaniem ich dawnych wersji.
- Snapshot rozszerzony o Visit.recording_level/checkout_attempts/source, Dart.target/checkout_attempt, game.context_kind/venue, equipment i profile_preferences. Zmiany są addytywne dla APK1.0.1. Brak pól nie oznacza niejawnego potwierdzenia próby/kompletności. Nie zmieniono Androida ani jego oczekujących UUID/body.

Odczyty nowej analizy:
- GET `analysis` + filtry → `{schema_version:6,metrics_version:1,generated_at,timezone,filters,policy,rule_groups,mixed_rules,sample_games,players:[{player,metrics,last_legs:{10,50,100}}],aliases}`. Liczniki i mianowniki oraz null przy braku danych; bez cache i bez korzystania z legacy total_points. [Pełne definicje](METRICS.md).
- Filtry: from/to jako dni Europe/Warsaw (to włącznie), player_id/opponent (z aliasami), start2..10001|all, in/out straight|double|master|all, unit legs|sets|fixed|all, status completed|confirmed|pending|active|paused|all|surrender|walkover|interrupted|cancelled, recording all|aggregate|darts|manual|camera-confirmed|correction|unknown, completeness all|fields|attempts|partial, kind all|unknown|training|friendly|official, venue(dokładnie), equipment_id, q(nazwa uczestnika lub ID meczu). Domyślne501/straight/double/legs/completed, inneall/puste. Recording kwalifikuje mecze zawierające dany wpis; completeness wymaga kompletności wszystkich obowiązujących wizyt. Przy player_id sprzęt dotyczy tego gracza. Zmiana dni w UTC uwzględnia23/25-godzinny dzień.
- GET `history-search` + te same filtry, `limit:1..100` domyślnie20 i opcjonalny cursor → `{items,next_cursor,filters,sort,ceiling}`. ORDER BY created_at DESC,id DESC. Kursor zawiera filtry, najwyższy ID pierwszej strony i ostatni klucz; zmiana filtrów422 invalid-cursor. Nowe mecze nie przesuwają kolejnej strony. Dawny dashboard.history pozostaje ograniczonym podglądem dla kompatybilności, WWW używa history-search.
- GET `match-analysis&game_id=N` → ta sama wersjonowana koperta + `matches:[{game,players,visits,darts,visit_contexts,leg_results,equipment,included_scoring,quality}]`. Pełny obowiązujący przebieg; jakość obejmuje liczbę poprzednich wersji/wycofanych wizyt. Bez observations, urządzeń, poświadczeń i prywatnego audytu. Wycofane rekordy pozostają w istniejącym autoryzowanym ekranie korekty.
- GET `analysis-export` + te same filtry (lub game_id), `format:json|csv`, `dataset:summary|visits|darts`. To **plik, nie koperta ok/data**. JSON zawiera pełną historię wybranych meczów i metryki, CSV ma BOM UTF-8/średniki/cytowanie, sekcję metadanych przed nagłówkiem tabeli, puste pola dla null i neutralizację formuł w tekstach użytkownika. Eksport obejmuje cały filtr, nie stronę. Wizyty/lotki obejmują obie strony dopasowanych meczów; sumy nie generują lotek. Brak tokenów/PIN-u/session_hash/device_id/observation_id. CSV visits/darts zachowuje konfigurację, kontekst, sprzęt i rzeczywiste źródła/poziomy; summary zawiera pokrycie. Definicje metrics v1 są stałe w tej wersji.

Przyszły Android: osobne ekrany profili/archiwum/aliasów, sprzętu i filtrów, opcjonalne deklaracje statystyczne, obsługa błędów profile-inactive/player-delete-disabled/history-protected oraz istniejących faz/formatów z etapów1–2. Samo ignorowanie nowych pól nie daje tych funkcji. Odczyt historycznego meczu nadal zwraca archiwalnych uczestników; przypisany dashboard również. Bez nowej APK i bez deklaracji testów telefonu.
