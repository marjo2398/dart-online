# Aktualna decyzja produktu — APK offline, 29.10.2026

WWW etapy1–3 są ukończone według przekazania użytkownika i lokalnego kodu; etap4 (organizacja rozgrywek) anulowano. Natywne APK prowadzi pełną ręczną grę lokalną bez sieci/kamery/parowania. Wspólny mecz online prowadzi wyłącznie serwer; przekazanie jest jawne, autoryzowane i idempotentne. Jedna fizyczna tarcza, opcjonalna wspomagana kamera; bez fuzji i gry między oddzielnymi tarczami. Nie zmieniono istniejącego WWW w celu uproszczenia Androida. [Kontrakt synchronizacji](OFFLINE_SYNC.md), [mapa WWW→APK](../../dart-lens/docs/OFFLINE_PLAY.md). Nowe API wymaga osobnego wdrożenia.

---

# Format meczu — etap 1 WWW

## Etap 2 — prowadzenie gry, wykonane lokalnie 29.10.2026

Obowiązują formaty etapu 1 poniżej. WWW dodaje tryb „Pozostało”, klawiaturę ekranową/laptopa, popularne wartości i opcjonalne wskazówki. Serwer sprawdza sumę, faktyczną liczbę lotek i istnienie legalnej sekwencji bez rzucania po bust/checkout. „Pozostało” nie zastępuje informacji o double-in/buście/zakończeniu; przy niezmienionym stanie wymaga potwierdzenia rzeczywistej wizyty za zero. Podpowiedzi zależą od stanu otwarcia, zasady wyjścia i pozostałych lotek; kilka dróg i preferowany double są wyłącznie sugestią, bez zapisu zamiaru/pól. Wyłączenie podpowiedzi wyłącza też głosowe wskazówki zejścia, nie zwykłe komunikaty punktowe.

Korekta dowolnej obowiązującej wizyty sumarycznej lub konkretnej lotki ma podgląd bez zapisu, uzasadnienie i token związany z parametrami oraz rewizją. Zastosowanie ponownie przelicza plan w transakcji. Legalny dalszy przebieg zachowuje ID, zawodników, legi i rzeczywiste pola. Pierwszy konflikt kończy legalny prefiks; zastosowanie wymaga jawnej zgody na wycofanie zależnego fragmentu. Nic nie przenosi się automatycznie do innych graczy/legów. Wycofane wizyty i lotki pozostają w bazie jako inactive; zmienione rekordy mają niezmienne poprzednie wersje. Statystyki liczą tylko aktywną projekcję. Wszystkie korekty w nowym WWW mają podgląd; dawne endpointy ostatniej korekty pozostały dla APK.

Stan operacyjny jest niezależny od reguł decidera: playing, awaiting_starter, paused, resolved (oczekuje na zatwierdzenie), confirmed. Pauza zachowuje wynik/turę/częściową wizytę; zwiększa rewizję i unieważnia obserwacje. Dozwolone podczas pauzy z prawami: korekty/cofnięcie, zarządzanie kamerą/dostępami, decyzje administracyjne. Wznowienie nie odtwarza rzutów z pauzy ani starych propozycji.

Zakończenia: normalne win/draw, surrender/walkover z wymaganym zwycięzcą i opcjonalnym osobnym przyznanym wynikiem, interrupted/cancelled bez zwycięzcy i przyznanego wyniku. Decyzja nie tworzy wizyt/legów. Walkower/przerwanie/anulowanie wyłączają cały mecz ze statystyk globalnych; poddanie zachowuje faktyczne wizyty, a bilans wygranej/przegranej wymaga przynajmniej jednej rzeczywistej wizyty. Faktyczny przebieg jest nadal widoczny, z oznaczeniem wyłączenia. Zatwierdzenie blokuje zwykłą edycję. Ponowne otwarcie wymaga prawa i uzasadnienia, wycofuje bieżące zatwierdzenie/decyzję z zachowaniem śladu; korekta wymaga ponownego zatwierdzenia. Są to reguły produktu, bez deklaracji zgodności z konkretną federacją.

Prawa: score, correct_last, history, pause, adjudicate, confirm, reopen. Wspólny PIN daje rolę admin; stare urządzenia operatora zachowują wyłącznie score/correct_last, kamera/widz nie otrzymują zapisu. Rozszerzenia tylko przez jawny nowy kod. Audit zna sesję (hash), rolę, urządzenie i deklarowaną nazwę, bez udawania osobowej tożsamości. Rewanż jest osobnym, idempotentnie tworzonym meczem z kopią zasad i wyborem początku/stron. Hold/break jest wyliczany względem zapisanego startera każdego lega. [Instrukcja operatora](OPERATOR.md).

## Zachowane reguły etapu 1

Dwie różne osoby z katalogu. Serwer PHP/SQLite jest jedynym właścicielem wyniku. „Szybkie 501”: 501, straight-in/double-out, do 2 legów (BO3), zawodnik 1 rozpoczyna, legi naprzemiennie. Własny format obejmuje X01 od 2 do 10001 (także 301/501/701/901), wejście straight/double/master i wyjście double/straight/master. Master i straight-out są wariantami dodatkowymi, bez deklaracji zgodności z regulaminem zawodów.

Konfiguracja `version:1` jest kopią w meczu. Jedyna reprezentacja długości to `match.unit` i całkowite `target` 1–99. Dla `legs` target oznacza wygrane legi, dla `sets` wygrane sety, dla `fixed` wszystkie legi, po których możliwy jest remis. BO nie jest przechowywane: BO N (nieparzyste 1–197) daje target=(N+1)/2. Set ma oddzielne `legs_per_set` 1–99. Zmiana/usunięcie szablonu nie zmienia meczu.

Przewaga dwóch legów dotyczy meczu legowego albo legów wewnątrz każdego seta; liczba wygranych setów nie jest przedłużana. Od remisu (target−1):(target−1) trzeba uzyskać przewagę 2. `extra_pairs:null` znaczy bez limitu; K=0–50 oznacza dodatkowe pary legów ponad ten remis. Przy (target−1+K):(target−1+K) jeden leg sudden death rozstrzyga. `final_set` może zmienić próg legów i przewagę/limit wyłącznie gdy obaj mają match.target−1 setów. Format `fixed` zabrania przewagi i specjalnego decidera.

Pierwszy starter: wskazany, wylosowany przez serwer lub wskazany zwycięzca rzeczywistego bull-off. Los oraz wynik bull-off są zapisane. Początki setów: naprzemiennie od pierwszego startera albo zawsze ten sam. Początki legów: naprzemiennie od startera seta albo zawsze starter seta; numeracja rotacji zeruje się w nowym secie. W meczu legowym rotacja liczy globalne legi. Decider: rotacja, początkowy starter meczu albo nowy bull-off. Reguła decidera ma pierwszeństwo, także dla jednolegowego seta/meczu. Początkowy bull-off wystarcza dla pierwszego lega; pozostałe wymagają osobnej decyzji. Do niej `current_player_id` i `leg_starter_id` są null, a serwer odrzuca rzuty.

Double otwiera/kończy D1–D20 lub wewnętrzny bull 50 (=D25). Master dopuszcza dodatkowo T1–T20. Zewnętrzny bull 25 nie otwiera/kończy double ani master. Straight-out może pozostawić 1; double/master-out daje bust przy pozostawieniu 1, przekroczeniu lub zerze bez wymaganego pola. Bust unieważnia całą wizytę i otwarcie osiągnięte w tej wizycie. Lotki przed otwarciem zużywają rzut, bez odjęcia punktów. Otwarcie resetuje się w każdym legu.

Przed otwarciem double/master-in i przy master-out wymagane są pojedyncze lotki (także MISS), bez domyślania przebiegu sumy. Po otwarciu i dla straight/double-out działają sumy: trzy lotki w zwykłej wizycie, faktyczna liczba przy bust/checkout; double-out wymaga potwierdzenia operatora. Nie powstają fikcyjne pola lotek, cele ani próby double. Kamera wyłącznie proponuje; potwierdzenie człowieka przechodzi przez ten sam zapis lotki.

Cofnięcie ostatniej lotki lub wizyty odtwarza wynik, otwarcie, leg/set/mecz, remis i startera. Cofnięcie przejścia do przyszłego decidera usuwa jego rozstrzygnięcie bull-off; ponowne dojście wymaga nowego wskazania. Cofnięcie samego rzutu w deciderze zachowuje jego startera. Etap 1 obejmował korektę ostatniego zapisu; aktualne rozszerzenie historii opisuje etap 2 powyżej. Rewizje rosną, UUID komend i audyt pozostają.

Globalne statystyki katalogu obejmują wyłącznie dotychczasowe formaty (jawny opis zakresu). Nowe warianty mają oddzielne statystyki w swoim meczu. Nie porównujemy ich bez oznaczenia.

Podstawa standardowego double-out/bulla/bust: [DRA Rules 2019, §5.3.2–5.3.8, oficjalne archiwum PDC](https://www.pdc.tv/sites/default/files/2020-08/DRA-Rules.pdf), wykorzystany indeksowany fragment sprawdzony 28.10.2026. To dokument archiwalny, nie weryfikacja aktualnego regulaminu konkretnego turnieju. Master, double-in, rotacje, limity i szablony powyżej są jawnymi regułami produktu.

Punkty i średnie aktywnej projekcji obejmują także grę w toku i pauzę. Normalny rozstrzygnięty wynik liczy się do bilansu już przed zatwierdzeniem (zgodność z dotychczasowym działaniem). Zatwierdzenie nie dodaje statystyk drugi raz; ponowne otwarcie/korekta przelicza obowiązujący przebieg według opisanych wyłączeń.

## Etap 3 WWW — wykonany lokalnie29.10.2026

Profile graczy są trwałą tożsamością niezależną od konta/PIN-u. ID nie zmienia się po nazwie/konwersji gościa/archiwizacji. Metadane są opcjonalne: pseudonim, klub, ręka, notatka i preferencje. Archiwalni są ukryci w nowej grze, zachowani w dawnych; zamiast destrukcyjnego kasowania obowiązuje archiwizacja. Mecz z historią można anulować, nie usunąć. Kontrolowane scalenie tworzy alias i ślad, bez zmiany dawnych uczestników. Podgląd + jawne potwierdzenie, blokada wspólnego/aktywnego meczu, transakcja i idempotencja.

Nowa analiza metrics v1 zastępuje w WWW ograniczone agregaty katalogu. Obejmuje wszystkie obsługiwane formaty przy jawnych filtrach. Domyślne501 straight-in/double-out na legi i zakończone także oczekujące; zatwierdzone/oczekujące osobno, inne reguły i aktywne wybiera się jawnie. Wyniki administracyjne oddzielone, wyłączenia i ważenie opisane w [METRICS](METRICS.md), zamrożonym przed obliczeniami/testami. Null,0, nie dotyczy i częściowe pokrycie są rozróżnione. Brak dawnego celu/próby/źródła nie jest uzupełniany domysłem.

Szybki zapis pozostaje szybki; rozszerzony zbiera jawne próby, szczegółowy rzeczywiste pola z opcjonalnym celem/próbą. Informacje są w istniejących visits/darts, z pochodzeniem. Wspólny replay daje kontekst legów/setów/decydowania. Raport meczu, analiza profilu/H2H, ważone średnie i first-nine, rozłączne pasma, checkouty z dwoma różnymi mianownikami, legi/hold/break/decidery, sektory, dzienny rozwój/porównanie okresów, ostatnie10/50/100 ukończonych legów i źródła rekordów są dostępne lokalnie. Bez mapy wymyślonych współrzędnych, metryk presji i oceny kamery na podstawie ludzkiej akceptacji.

Historia jest filtrowana i stronicowana stabilnym kluczem data utworzenia/ID, z granicami dni Europe/Warsaw. CSV/JSON dotyczą wybranego zbioru, mają wersje/filtry/jakość, zachowują braki, neutralizują formuły i nie zawierają sekretów urządzeń. Raport ma widok druku z przeglądarki. Opcjonalny zestaw lotek ma stałe ID i przypisanie ze snapshotem nazwy/masy, warunki gry są deklaracją operatora. [Instrukcja](PROFILES_ANALYSIS.md), [API](API.md), [testy](TESTING.md).

Migracja v6 addytywna, przechowuje wszystkie wcześniejsze ID, historię, statusy i poświadczenia. Nowe administracyjne funkcje wymagają admina WWW, stare APK zachowuje bezpieczne dawne żądania i historyczne odczyty. Rozszerzone ekrany Androida wymagają osobnego zadania. Bez wdrożenia/APK i testu fizycznego urządzenia.
