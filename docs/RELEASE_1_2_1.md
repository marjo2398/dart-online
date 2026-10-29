# Dart Lens 1.2.1 — wspólne wydanie WWW i APK, 29.10.2026

WWW i APK są jednym produktem na etapie ukończonych funkcji1–3. Etap4 organizacji rozgrywek pozostaje anulowany. Zachowano istniejące React/Vite + PHP/SQLite oraz natywnego Androida; nie powstał nowy panel.

| Część | Wersja i źródła | Dostęp / własność |
|---|---|---|
| WWW/API | 1.2.1, schema8, metrics1; kod c7d3fd51661a262e2e3dd8d7d4bab9552c8355ed, zawiera upgrade2ac042e | Publiczny panel bez logowania; wynik prowadzi serwer |
| APK | 1.2.1/code14; kod ca2309788bb6419306fb195bc159c78d5434f878 | Telefon prowadzi lokalną grę offline; własne tokeny/role do online |

Wspólne funkcje: konfiguracja i szablony X01/legi/sety/fixed, start/wznowienie, Zdobyte/Pozostało/lotki, jawne potwierdzenie, korekty/pauza/rozstrzygnięcia/zatwierdzenie, profile/historia/analiza/eksport i istniejące połączenia. Android zachowuje CameraX oraz niezależną grę lokalną. WWW nie dostaje silnika offline, PWA ani kamery/wideo. Rozszerzone analizy pełnej historii serwera w APK nadal używają tego samego API co WWW; historia telefonu ma jawnie mniejszy zakres danych.

Publiczny dostęp WWW jest świadomy: wspólne dane, techniczne CSRF i jednokrotne odnowienie, limity, rewizje i idempotencja. Uwierzytelnianie APK, role/kody/odwołanie dostępu i zatwierdzanie propozycji kamery pozostają. Błędny token nigdy nie staje się publicznym urządzeniem. Archiwum/niepotwierdzony dawny import jest tylko do odczytu; jawne przekazanie prowadzenia jest oddzielną operacją. Zachowano UUID/payload oczekujących komend, mapowania osób, historię i konfiguracje.

## Naprawa zgodności statystyk

W1.2.0 wykryto błędne zaliczanie decyzji administracyjnych do normalnych wygranych/remisów. W1.2.1 bilans W:P:R obejmuje zwykłe wyniki; surrender/walkover/interrupted/cancelled mają osobne liczniki. Poddanie zachowuje faktyczne punktowanie, pozostałe trzy decyzje je wyłączają zgodnie z metrics1. Liczba zakończonych meczów nadal obejmuje zakończenia administracyjne — nie jest liczbą normalnych wyników. Brak rekordu/checkoutu to null, znane0 pozostaje0; częściowa wizyta nie jest rekordem pełnej wizyty. Obliczenia z zachowanej historii, bez migracji bazy telefonu i bez zmiany zasad.

## Wykonana brama kodu

- Android:33 testy JVM PASS,0 pominiętych: LocalStatistics4, LocalPlayStore7, ScoreEntry10, OnlineRepository10, rzeczywisty OfflinePhpIntegration1, X01Contract1 zawierający39 scenariuszy. Lokalny PHP/SQLite/schema8, bez produkcji.
- Rzeczywiste klasy APK → import → WWW:8 zestawów, obaj zawodnicy (16 porównań): checkout, first-nine, partial, remis fixed oraz4 decyzje administracyjne. Zgodne punkty/lotki/AVG, rekordy, bilanse, legi/sety, dane szczegółowe i ich braki.
- WWW: API19, formaty13, operacje12, analiza9, public-access9 PASS; klientTS/HTTP, v6→v8/v7→v8, rollback/idempotencja PASS; lint/build PASS. Wyniki wcześniejszych migracji i browser QA zachowano w WEB_UPGRADE.
- Android lintRelease:0 błędów,16 ostrzeżeń i1 hint. Pierwszy proces Javy przerwał G1 GC (EXCEPTION_ACCESS_VIOLATION); testy/lint powtórzono skutecznie z SerialGC, --no-daemon, jednym workerem i kompilacją Kotlin in-process. Nie zmieniano globalnej konfiguracji JVM/systemu.
- Rzeczywista przeglądarka/lokalne API z upgrade1.2.0: desktop1280×720 i telefon390×845, dwie karty, brak logowania, wygaśnięcie sesji, cofanie/korekta/pauza/checkout/lock/CSV. Screenshoty WWW w dart-online/.tools/public-web-20261029/screenshots/. Runtime WWW1.2.1 ma identyczne pliki JS/CSS; zmieniono wersję i test porównawczy.

## Potwierdzony artefakt APK

APK1.2.1/code14: 75260558 bajtów, SHA256 54a0bd91505ab6c5f09f1a8e339a250cdb79ae0684ad486c50fc6fdddf4aed3f. Podpis v2, certyfikat SHA256 60717773ec2b748875349ad5a08ab85205d8077dd5ea1a1c077368c552dc2a95, zgodny z1.2.0; ZIP16KiB i10 bibliotek ELF PASS. Wewnątrz APK potwierdzono revision ca2309788bb6419306fb195bc159c78d5434f878. Lokalizacja: dart-lens/.tools/artifacts/1.2.1-internal/Dart-Lens-1.2.1-arm-internal.apk; manifest obok. Instalacji nie wykonano.

WWW: dart-online/.tools/artifacts/www-1.2.1-public-20261029-<commit>/public i ZIP obok; release-manifest.json podaje rzeczywisty commit paczki, pełną listę zmienionych plików i SHA256. Paczka zawiera cały backend/schema8 i frontend, bez konfiguracji, bazy oraz sekretów. Dokładny ZIP i suma są również w wydaniu GitHub.

## Dostarczenie i granice

Publikacja GitHub obejmuje main i zachowane gałęzie robocze obu repozytoriów oraz wersjonowane artefakty. Późniejsze commity dokumentacji nie zmieniają wskazanego kodu APK. Wydania do prób: [APK1.2.1 — prywatne repo](https://github.com/marjo2398/dart-party-/releases/tag/v1.2.1-internal), [WWW1.2.1 — paczka](https://github.com/marjo2398/dart-online/releases/tag/v1.2.1-internal). Manifesty podają źródła i sumy kontrolne; pliki klucza, config i bazy nie należą do dystrybucji.

Bez deploy hostingu, zmian produkcyjnych i instalacji telefonu. Jedyna domena nadal https://dartlens.host749284.xce.pl/; najnowsze API/schema8 oraz publiczne WWW wymagają osobnego zlecenia wdrożenia. Nie twierdzimy, że aktywna domena ma już tę wersję. hardware_verified=false: brak próby telefonu/kamery i renderu APK; publikacja ma status prerelease. PHP7.4/Apache/LiteSpeed i prywatne pliki HTTP wymagają próby na właściwym serwerze. Instalować APK jako aktualizację pl.dartlens z dotychczasowym podpisem, bez czyszczenia danych.

Spójny backup SQLite, zachowanie produkcyjnego config/data/.htaccess, schema8, stare assets/cache i rollback: [instrukcja WWW](https://github.com/marjo2398/dart-online/blob/main/DEPLOY_HOSTIDO.md). Kontrole urządzeń: [DEVICE_TESTS](https://github.com/marjo2398/dart-party-/blob/main/docs/DEVICE_TESTS.md). Stary MySQL i /dart/ pozostają archiwum. Cudzy dopisek TASK i audyt konkurencji zachowano lokalnie poza publikacją.
