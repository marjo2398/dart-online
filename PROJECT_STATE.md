# Dart Online — stan 27.10.2026

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
