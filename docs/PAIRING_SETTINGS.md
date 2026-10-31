# Dart Lens1.3.0 — parowanie i ustawienia

WWW pozostaje publiczne bez logowania. PIN dołączenia urządzenia nie jest hasłem panelu ani nowym ekranem dostępu WWW. APK zachowuje grę offline, własny token i role online. Kamera wyłącznie proponuje; lokalny mecz prowadzi telefon do potwierdzonego, jawnego przekazania. Etap4 pozostaje anulowany.

## Ponowne połączenie

Przyczyna zgłoszenia: `OnlineScreen.kt` otwierał `GamePanel` z zachowanej kopii przed sprawdzeniem dostępu, przez co po401 zasłaniał formularz. `OnlineRepository.join` dodatkowo odrzucał parowanie przy oczekującej komendzie. Nowe parowanie już wcześniej nie wysyłało starego Bearera — nie był to błąd nagłówka ani permanentna blokada instalacji.

W APK wybierz Ustawienia aplikacji → Połącz ponownie i wpisz nowy PIN z WWW/APK operatora. Adres serwera jest pod Zaawansowane; z oczekującą komendą nie wolno zmienić serwera. Lokalna baza, kalibracje, profile i historia pozostają. Brak sieci/błąd serwera różnią się od cofnięcia/wygaśnięcia dostępu. Cofnięty token zatrzymuje automatyczne odczyty; jawne sprawdzenie jest dostępne.

Nowy grant tworzy nową tożsamość i długi token; poprzedni nie odżywa. W dzienniku zaszyfrowanym pozostają dokładne UUID/treść komendy oraz dowód starego dostępu. „Bezpiecznie sprawdź / ponów” po zmianie tożsamości używa `command-recover`, nigdy wykonania komendy jako nowego urządzenia. Serwer pod blokadą zapisu sprawdza dowód, identyczny payload i aktualną rolę/zakres. Wynik saved/not-saved pozwala zamknąć kolejkę z zapisem rozstrzygnięcia; not-saved wymaga świadomego nowego wpisu z aktualną rewizją. Przy za małym zakresie kolejka pozostaje, z komunikatem uzyskania właściwego dostępu. Ten mechanizm nie scala równoległych przebiegów.

## PIN urządzenia / API9

Nowy PIN: dokładnie4 cyfry jako tekst (np.0037), `random_int`, jednorazowy, TTL300s, aktywnie unikalny na serwerze. Transakcja `BEGIN IMMEDIATE` obejmuje sprawdzenie/zużycie i utworzenie urządzenia. Nowe generowanie zastępuje niewykorzystany kod tylko tego samego wystawcy i jego sesji `pairing_session` UUID. Publiczny wystawca jest dodatkowo związany z sesją techniczną, więc znajomość PIN-u nie umożliwia unieważnienia cudzego kodu. Inna karta/urządzenie może mieć własną sesję wystawiania.

Role operator/kamera/widz, przypisanie meczu, uprawnienia i czas dostępu pozostają. Lista WWW domyślnie pokazuje uprawnione; historia zachowuje cofnięte/wygasłe rekordy. Ważny dostęp nie oznacza aktywnego połączenia. W WWW są licznik ważności, Kopiuj i Nowy PIN; APK pokazuje termin, Kopiuj i Nowy PIN.

Limity:8 poprawnie sformatowanych prób wymiany/IP/minutę oraz30/IP/15min;12 udanych generowań/IP lub wystawca/minutę. Przekroczenie daje429, nie trwałą blokadę instalacji. PIN przechowywany jako HMAC z prywatnym device-secret; odpowiedź dziennika idempotencji jest szyfrowana AES-256-GCM. Kodów/tokenów nie dopisujemy do logów. PHP wymaga OpenSSL i PDO SQLite. Prawidłowe dotychczasowe tokeny pozostają ważne. Dawne12-hex kody są przyjmowane do własnego terminu ważności; nie tworzymy już nowych. Starszy APK umie wymienić4cyfrowy tekst. Odnowienie nieaktywnego dostępu hasłem administratora wymaga nagłówka `X-Dart-Recovery:1`; starszy klient dostaje409 client-update-required. Zaktualizuj APK bez odinstalowania i czyszczenia danych. Aktywny dostęp może być odnowiony jak dotąd.

## Ustawienia i zakres

APK: domyślny głos, dostępny polski głos Androida i próba, Zdobyte/Pozostało/lotki, pytania o szczegóły, ekran podczas aktywnej gry, stan dostępu/sieci/kolejki, ręczne lub automatyczne odświeżanie stanu, serwer zaawansowany, wersje/zgodność API, diagnostyka bez sekretów, okres/źródło analizy i pamiętanie filtrów. Preferencje są lokalne, osobno od bazy gry i zabezpieczonego dziennika. TTS zależy od zainstalowanego silnika i jego głosów; głos sieciowy jest oznaczony. Nie dodano uprawnień mikrofonu ani kamery do ustawień.

WWW: te same wspólne preferencje głosu, wpisywania, okresu i definicji w localStorage tej przeglądarki. Poziom Szybki/Rozszerzony/Szczegółowy jest domyślnym sposobem wpisu. WWW pokazuje wyłącznie wspólną historię, ma stały serwer otwartej strony i sesję techniczną CSRF, nie osobiste konto. Nie ma przełącznika fikcyjnej pracy offline ani browserowej kamery. Preferencje nie wysyłają zmian profili/reguł ani konfiguracji hostingu. Oczekująca komenda WWW pozostaje w sessionStorage tej karty z UUID, treścią i adresem jej API.

Automatyczne odświeżanie oznacza odczyt wspólnego stanu. Import archiwum i oddanie prowadzenia są zawsze jawne w szczegółach lokalnego meczu, również po powrocie internetu. Ręczny tryb ma Odśwież stan i nadal wymaga poprawnej rewizji przy zapisie. W APK zapisane filtry serwera są oddzielone adresem serwera, lokalne filtry dotyczą historii telefonu. Zapamiętane filtry mają pierwszeństwo przed domyślnym okresem. Okres pomija mecze bez znanej daty; nie wymyślamy dat historycznych.

## Synchronizacja i analiza

Lista i szczegóły APK odróżniają tylko telefon, przesyłanie, nieznany wynik importu, konflikt/błąd, zsynchronizowane archiwum bez wspólnego sterowania i mecz udostępniony prowadzony przez serwer. Osobno pokazują ostatnie potwierdzenie, własność, dostęp i odpowiedź API. Użyto istniejącego local_meta, bez zmiany formatu dokumentu/komend. Archiwum i gra wspólna zachowują mapowania; odczyt kopii nie zmienia właściciela. WWW pokazuje pochodzenie i read-only archiwum.

Podsumowanie korzysta z istniejących LocalStatistics/PHP analysis, bez drugiego silnika. Faktyczne legi/sety, decyzja, AVG3, first-nine, checkouty,180, najlepszy leg i próbka są zestawione w tabeli. Profil jest dostępny bezpośrednio (lokalny natywnie; wspólny z APK przez publiczne WWW). Rewanż respektuje dotychczasowe role i blokady archiwum, a otwarcie raportu nigdy nie zatwierdza wyniku.

Jakość: źródło, filtry, mecze/legi/wizyty/lotki, jawne próby w wizytach z możliwością zejścia oraz rzeczywiste pola. Próby lotką i okazje w pełnych wizytach mają osobne mianowniki. Nieznane nie jest zerem; brak mianownika nie daje0%. Częściowe wizyty nie zwiększają rozkładu pełnych wizyt ani pokrycia deklarowanych prób pełnych wizyt. Definicje są rozwijane; anulowane/wyłączone dane pozostają poza punktowaniem, decyzje administracyjne poza bilansem normalnej gry.

## Próba telefonu po aktualizacji (niewykonana)

1. Zainstaluj właściwy ARM APK jako aktualizację pl.dartlens z zachowaniem danych i podpisu; nie czyść pamięci aplikacji.
2. Sprawdź dotychczasowe profile/mecze/kalibracje, ustawienia i głos oraz ekran podczas aktywnej gry.
3. Dołącz PIN-em z zerem, cofnięcie na WWW, komunikat w APK, Połącz ponownie bez reinstalacji; stary token nie działa, nowa rola jest właściwa.
4. Przy niepewnym zapisie zachowaj UUID/treść, po nowym dostępie rozstrzygnij saved/not-saved, także po restarcie. Mniejszy zakres nie może przejąć starej komendy.
5. Jawnie udostępnij osobny mecz; drugi klient widzi zapis/pauzę/korektę/podsumowanie. Archiwum pozostaje bez sterowania. Powrót internetu nie udostępnia meczu.

Build/JVM/HTTP nie są odbiorem telefonu ani kamery: hardware_verified=false.
