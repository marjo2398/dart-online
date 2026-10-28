# Dart Online — stan 28.10.2026

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
