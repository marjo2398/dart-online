# Bieżące wydanie WWW1.2.0 — 29.10.2026

Lokalny upgrade istniejącego panelu do wspólnego zakresu APK1.2.0: publiczny dostęp, uporządkowany UI, jawne archiwum/udostępnienie i testy współpracy. Etap4 organizacji nadal anulowany. Pozostają osobno autoryzowane wdrożenie z kopią/odbiorem produkcji i rzeczywiste urządzenia. Wykryty lokalny licznik remisów APK po przerwaniu wymaga osobnej poprawki Androida; nie przenosimy błędu do WWW. [Zakres/wyniki](WEB_UPGRADE.md). Poniżej wcześniejszy plan.

---

# Priorytet APK — stan 29.10.2026

Etapy1–3 WWW ukończone według użytkownika; etap4 anulowany. Zlecono i lokalnie wdrożono trzy części: natywna gra offline z trwałym zapisem; synchronizacja i wspólna online przez schema7; sprawdzenie aktualizacji i APK1.1.0. Zakres jest opisany w [OFFLINE_SYNC](OFFLINE_SYNC.md) i [mapie APK](../../dart-lens/docs/OFFLINE_PLAY.md). Bez automatycznego deploy/push/merge. Dalsza brama: ręczna instalacja aktualizacji, próby urządzeń i osobno zatwierdzone wdrożenie nowego API. Poniższe zapisy etapów są historią ich realizacji.

---

# Rozwój WWW

## Etap 3 — wykonany lokalnie 29.10.2026

Trwałe profile/goście, archiwizacja, kontrolowane aliasy, opcjonalny zapis prób/celów i sprzętu/warunków, analiza obowiązującej historii, raport meczu/legów i profilu, H2H, okresy/ostatnie legi/rekordy, filtry z Europe/Warsaw, keyset pagination i CSV/JSON/druk. Migracja v6 bez domysłów o starej historii; bez cache, usług i zależności. [Definicje](METRICS.md), [obsługa](PROFILES_ANALYSIS.md), [dowody](TESTING.md). Bez wdrożenia, zmian Androida i prób telefonu.

Nie wykonano importu, mapy z fikcyjnymi współrzędnymi, oceny kamery na podstawie akceptacji ani metryk presji bez danych. Potencjalny następny zakres analityki należy ustalić na rzeczywistych potrzebach i kompletności danych; wdrożenie i Android nadal są osobnymi decyzjami.

## Etap 2 — wykonany lokalnie 29.10.2026

Trzy tryby wpisywania, klawiatura/podpowiedzi, wcześniejsze korekty z podglądem i kontrolowanym wycofaniem, pauza, hold/break, rewanż, osobne decyzje administracyjne, zatwierdzanie/otwieranie i prawa. Migracja v5 zachowuje historię; nowe fazy zabezpieczone także przed starym APK. Bez wdrożenia i Androida. Obsługa: [OPERATOR](OPERATOR.md), dowody: [TESTING](TESTING.md).

Etap 3 wykonano lokalnie powyżej; dalszy rozwój wymaga osobnego zlecenia. Wdrożenie, obsługa nowych formatów/faz przez Androida i rzeczywiste próby telefonów pozostają osobnymi krokami. Zaawansowana korekta nie przenosi automatycznie zależnych rzutów między graczami/legami.

## Etap 1 — wykonany lokalnie 28.10.2026

Konfigurator i autorytatywny serwer X01: pełne mecze na legi/sety, wszystkie N legów z remisem, dodatkowe wejścia/wyjścia, decider/przewaga/sudden death, trwałe początki i szablony. Migracja danych i zgodność dawnego kontraktu przetestowane. Zakres: [SPEC](SPEC.md), dowody i ograniczenia: [TESTING](TESTING.md), [PROJECT_STATE](../PROJECT_STATE.md).

## Następne decyzje — niewykonane

- Osobno autoryzowane wdrożenie WWW/API z kopią prywatnej bazy i kontrolą migracji.
- Obsługa config v1 w Androidzie, wraz z setami/remisem/fazami, otwarciem punktowania i decyzją bull-off. APK 1.0.1 pozostaje ograniczone do dotychczasowych formatów.
- Próby fizycznych telefonów i kamery według checklisty sąsiedniego repo; kod/test HTTP nie jest ich potwierdzeniem.

Deble, drużyny, ligi/drabinki, handicap, boty, oddzielne tarcze, pełne offline, dowolna historyczna korekta, timery i nowe rozpoznawanie kamery nie należą do etapu 1. Audyt konkurencji jest odroczony.
