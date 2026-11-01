# Dart Lens1.3.1 — aktualizacja kalibracji

APK1.3.1/code16, pl.dartlens, ten sam certyfikat i aktualizacja bez czyszczenia danych. Zgodność z istniejącym WWW/API1.3.0/schema9; bez deploy serwera i bez zmian zasad, parowania, synchronizacji lub statystyk.

Zoom1–8× i pan zdjęcia, kandydat zatwierdzany jawnie, korekta punktów1–6 bez utraty kolejnych, strzałki precyzji, osobne dopasowanie widoku i reset szkicu. Bitmapa szczegółowa z oryginalnego JPEG, ograniczona do4096px/8MP, mapowanie do oryginału i niezmieniony solver4+2 z dotychczasową kontrolą jakości. Instrukcja: dart-lens/docs/CALIBRATION.md.

Celowane JVM geometrii/kalibracji/zapisu oraz build/lint release; dokładne wyniki i źródła w manifestach. Brak emulatora, screenshotu APK i próby dotykowej/kamery; hardware_verified=false. Nie instalowano APK.

[Wydanie APK i dokumentów](https://github.com/marjo2398/dart-party-/releases/tag/v1.3.1-internal) jest prywatne; wymaga dostępu GitHub. Artefakty: Dart-Lens-1.3.1-arm-internal.apk, release-manifest.json, SHA256SUMS.txt, Dart-Lens-1.3.1-project-documents.zip. ZIP zawiera prawdziwe pliki workspace/dart-lens/dart-online, START_HERE.md i manifest commitów/pochodzenia/SHA, z oznaczonym lokalnie zmienionym TASK. Pliki APK i klucz poza historią Git.

Brak narzędzia trwałej podmiany źródeł ChatGPT. ZIP na GitHub nie podmienia ich automatycznie: pobierz go, rozpakuj i zastąp stare źródła odpowiednimi plikami z rozróżnieniem folderów; zacznij od START_HERE.md. Nie udostępniaj dysku i nie zmieniaj widoczności repo.

## Dowody wydania — 1.11.2026

Kod APK: `bc234981ee4f84e3837f4894279ddc0f9ad87b12`. Plik `Dart-Lens-1.3.1-arm-internal.apk`: 75424398 bajtów, SHA256 `b1b87230f9f68d02b675e476627c8c1432b18d8a90ffb4aa43b3f28f000fb8d7`. Wbudowany version-control-info zgodny z tym commitem. Main może wskazywać późniejszy commit dokumentacji, bez zmiany binarium.

Finalny assembleRelease/lintRelease i 21 celowanych testów JVM PASS: ImageCoordinates5, PrecisionCalibration3 (w tym odtworzenie dla tego samego/innego zdjęcia i aparatu), Calibration5, ResearchStore8. Lint:0 błędów,18 ostrzeżeń,2 wskazówki. Potwierdzono pl.dartlens/code16, SDK28/35, ARM32/64, brak debuggable, podpis v2 i zgodność dotychczasowego certyfikatu, zipalign i ELF. Testy są programowe; nie wykonano fizycznego zdjęcia/gestów/renderu ani instalacji telefonu. hardware_verified=false.

WWW/API runtime1.3.0/schema9 bez zmian względem poprzedniego wydania; w dart-online zmieniono wyłącznie dokumenty Markdown. W tym zadaniu nie uruchamiano buildu WWW, migracji ani deploy hostingu. Metadane APK zawierają stan repo API z chwili pakowania; nie oznacza to nowego wdrożenia. Aktualne main/gałęzie i pliki dokumentów wskazuje sources-manifest.json w ZIP. Pobrania GitHub weryfikuje osobny manifest publikacji; stan wydania jest widoczny pod linkiem powyżej.
