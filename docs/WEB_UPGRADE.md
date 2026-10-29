# Uzupełnienie1.2.1 — rozbieżność APK naprawiona

LocalStatistics APK1.2.1/code14 oddziela wszystkie4 decyzje administracyjne od normalnego bilansu, zachowuje liczbę zakończonych meczów i null/znane0, pomija partial przy rekordzie. Osiem zestawów/obaj zawodnicy porównane z rzeczywistym API bez znanych różnic w sprawdzonych metrykach. [Pełne wydanie i granice](RELEASE_1_2_1.md). Opisana poniżej rozbieżność dotyczy starej APK1.2.0; nie jest otwartym błędem1.2.1.

---

# Upgrade WWW do APK 1.2.0 — 29.10.2026

Źródła odczytane lokalnie: WWW `188658a`, gałąź wyjściowa `feature/apk-integration-20261025`; Android `de8facb`, APK 1.2.0/code13 z kodu `c77797d`, manifest `.tools/artifacts/1.2.0-internal/release-manifest.json`. WWW przed zmianą miało package version0.0.0/schema7; po aktualizacji 1.2.0/schema8. Nie założono zgodności lokalnych gałęzi z GitHub/main. Produkcji nie badano przez zapis ani nie wdrażano.

## Porównanie implementacji

| Obszar | APK 1.2.0 | WWW na początku | Wykonana zmiana / decyzja |
|---|---|---|---|
| Start i nawigacja | Nowa gra, wznowienie, mniejsze kafelki | Wymuszony PIN i wszystkie panele na pulpicie | Publiczny start, nawigacja, karta wznowienia, osobne połączenia i gracze |
| Tworzenie/wznowienie | Prosta konfiguracja 301/501/701, BO1/3/5, zamiana stron | Szybkie501 lub pełny formularz, istniejący resume | Dodane proste wybory i zamiana; odświeżenie publicznego `#game=N` odtwarza mecz |
| Zasady/szablony | config1, legi/sety/fixed, wejście/wyjście, przewaga, rotacje/bull-off | Ten sam format i silnik serwera już istniały | Zachowane; pełne ustawienia i szablony nadal dostępne. Usunięta sugestia, że tylko WWW obsługuje obecny format |
| Mecz/wpis | Dwa panele, klawiatura, Zdobyte/Pozostało/lotki | Zgodne API, nadmiar sekcji i duże odstępy | Dwa wyniki na desktopie i telefonie; presety, cyfry, CLR, kasowanie, OK i klawiatura laptopa |
| Korekta/pauza/koniec/zgoda | Kontekst, jawna decyzja, historyczny replay | Zgodne operacje2 były ukończone | Zachowane backend/komponenty; dostęp w menu, pytania o checkout/lotki/próby przy zapisie, blokada starego szkicu |
| Profile/historia/eksport | Profile lokalne i serwerowe, nieznane dane | Pełne profile, aliasy, archiwum, metrics1 i CSV/JSON | Zachowane; publiczne uprawnienia, historia domyślnie wszystkich zasad/statusów, wspólna identyfikacja danych |
| Statystyki | Online z serwera; lokalny `LocalStatistics` ma ograniczenia | Autorytatywne metrics1 z mianownikami i jakością | Definicje WWW zachowane; wykonane porównanie rzeczywistych klas APK. Rozbieżność Androida opisana poniżej |
| Połączenia/kamery | Własne tokeny, role i zatwierdzane propozycje | Ten sam protokół; wymagany PIN przeglądarki | Publiczne zarządzanie kodami, bez zmiany uprawnień istniejących urządzeń; bez kamery/wideo przeglądarki |
| Import/synchronizacja | Jawny import i przekazanie właściciela albo archiwum | Backend7 już wykonywał atomowy import | Dodane jawne pochodzenie/tryb, odzyskanie dawnych decyzji i blokada sterowania archiwum |
| Błędy/statusy | Zachowany payload/UUID, konflikt, brak aktualności | Było retry, ale wygaśnięcie sesji wyrzucało do logowania | Jednorazowe odnowienie CSRF, brak ekranu logowania; 429 nie usuwa niepewnej komendy |

Celowe różnice platformowe: WWW prowadzi wyłącznie serwer, nie ma drugiego silnika offline/PWA, CameraX, uprawnień Androida ani transmisji. Telefon nadal prowadzi grę lokalną do potwierdzonego przekazania. Przeglądarka drukuje raport, Android eksportuje przez system plików.

## Wyniki weryfikacji

- `public-access.mjs`: 9 grup — świeże wejście i CSRF, ręczna gra, walidacja, retry/body/revizja/dwie instancje, korekta/pauza/checkout/lock, wygaśnięcie i stare cookies/komendy, publiczny audyt, odmowy błędnych tokenów, role/kamera, rzeczywisty import, archiwum tylko do odczytu, limity i eksport bez sekretów.
- `web-client.mjs`: rzeczywisty klient TS przez HTTP; utracona odpowiedź, blokada drugiego zapisu, restart pamięci karty, ten sam UUID/body, konflikt, awaria pamięci, jednokrotne odnowienie CSRF, stale401. Dodatkowo 429 zachowuje UUID, a powtarzane403 kończy odnowienie po jednej próbie.
- Regresje istniejących ścieżek: API19 grup, formaty13, operacje12, analiza9 PASS. Migracje dawnych baz v3/v4/v5/v6 zachowują dane; nowa `migration-public.mjs` sprawdza pełny v7→v8, shared/archive/unknown, ponowienie i wstrzyknięty rollback.
- Rzeczywiste źródła Androida: `OfflinePhpIntegrationTest` 1/1 bez pominięcia (OnlineApi/Kotlin→HTTP/PHP/SQLite); `X01ContractTest` 1/1 zawierający39 wspólnych scenariuszy. Bez przebudowy APK i zmian kodu Androida.
- `apk-statistics.mjs` uruchamia rzeczywiste skompilowane `LocalGameEngine/LocalStatistics` z aktualnej APK, importuje te same dokumenty i porównuje z serwerem: zwykły checkout,9 lotek oraz przerwanie. Punkty, lotki, AVG1/3, first-nine, legi/sety, busty/hold/break, sektory i rozkłady zgodne w sprawdzonych zakresach. Nie jest to atrapa silnika.
- Lint TypeScript, Vite i składnia PHP8.5.12. Bez zmiany wersji zależności; zmieniona tylko wersja produktu w package/lock.

Przeglądarka z lokalnym rzeczywistym API: nowa karta bez logowania; mecz301 utworzony w UI, presety/CLR/Backspace/Enter, jawne OK i dwuklik; reload/wznowienie; dwie karty i anulowany szkic; pojedyncze lotki; pauza/reload/wznowienie częściowej wizyty; wymuszone wygaśnięcie sesji i automatyczne odnowienie podczas zapisu; wcześniejsza korekta60→40 z podglądem; checkout180/0/121 i faktyczne3 lotki; zatwierdzenie i zablokowane cofanie; raport150,5 AVG i rzeczywiście pobrany CSV. Dane i sesje są testowe.

Screenshoty głównych ekranów i pobrany CSV: `.tools/public-web-20261029/`. Wyniki porównania statystyk: `statistics-contract/results.json`. Screenshoty przedstawiają WWW, nie render APK.

Widok meczu sprawdzono przy viewport1280×720 i390×845; oba wyniki oraz dotykowe OK są widoczne równocześnie na telefonie. Zachowano również start, konfigurację, profile, połączenia, archiwum APK i raport. Nie deklaruje się próby szerokości320 — narzędzie nie zmieniło rzeczywistego viewportu do tej wartości.

Po restarcie komputera zachowały się źródła, screenshoty i testowa baza. Ponownie przeszły lint/build, public-access, web-client oraz migration-public. Przywrócony podgląd otworzył mecz APK z rewizją5 bez logowania. Sprawdzono też dialog „Pozostało”: tło jest inert, anulowanie zachowuje bufor300 bez zmiany rewizji, a osobne CLR go czyści. Konsola nowej karty bez błędów.

## Rzeczywista rozbieżność APK

`dart-lens/app/src/main/java/pl/dartlens/localplay/LocalStatistics.kt` zwiększa `completed` i `draws` przed sprawdzeniem `stats_eligible`. Przerwanie/anulowanie bez zwycięzcy może więc zwiększać lokalny licznik remisów. W metrics1 WWW taki wynik pozostaje decyzją administracyjną, bez remisu normalnej gry. Test trzeciego zbioru potwierdza tę różnicę; nie dopasowano WWW przez psucie reguł. Naprawa lokalnego licznika wymaga odrębnej zmiany Androida. Serwerowa analiza otwierana przez APK używa tych samych metrics1 co WWW.

Lokalna próbka telefonu nie jest całą historią serwera. Pokrycie first-nine/prób musi być czytane z mianownikiem; nie należy porównywać liczby zakończonych gier telefonu z liczbą wszystkich próbek WWW bez tego samego filtra. Brak metryki i znane0 pozostają różne.

## Granice odbioru

Nie wykonano próby fizycznego telefonu/kamery, instalacji ani renderu APK. `hardware_verified=false`. Nie uruchamiano PHP7.4, Apache/LiteSpeed ani produkcji; lokalny PHP nie wykonuje `.htaccess`. Dostęp HTTP do prywatnych plików trzeba sprawdzić po autoryzowanym wdrożeniu. Nie powtarzano testu skali/pełnej regresji Androida. Wersja WWW jest przygotowana lokalnie, nie jest potwierdzona na aktywnej domenie.

[Publiczny dostęp](PUBLIC_ACCESS.md) · [wdrożenie](../DEPLOY_HOSTIDO.md) · [stan](../PROJECT_STATE.md)
