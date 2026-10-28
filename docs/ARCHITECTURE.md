# WWW i serwer wyniku

React/Vite wyświetla snapshot i wysyła komendy. `format-preview` waliduje reguły i przygotowuje opis na serwerze. Formularz przechowuje draft, bez własnego silnika wyniku. `public/api/formats.php` zawiera walidację config v1, migrację v4, szablony, odtwarzanie meczu i przeliczenie pojedynczej wizyty. `index.php` zachowuje endpointy/sesje/SQLite i sumy wizyt; `sync.php` transakcje, uprawnienia, deduplikację, rewizje, audyt i potwierdzanie obserwacji.

`games.config_json` jest niezmienną kopią reguł i ustalonego początkowego startera. `starter_results` jest bieżącą projekcją decyzji bull-off według numeru lega; każda decyzja ma również komendę i audyt. `visits` to aktualna projekcja punktów, otwarcia i granic wizyt; `darts` przechowuje rzeczywiste pola oraz wycofane lotki. Replay wizyt z konfiguracją odtwarza fazę, sety/legi, wynik i startera. Żaden klient nie dopisuje wyniku samodzielnie.

Migrowanie SQLite v3→v4 przebudowuje ograniczenia `games` metodą create/copy/drop/rename w jednej transakcji. FK wyłączane wyłącznie na tym połączeniu poza transakcją, sprawdzane przed COMMIT i ponownie włączane także po błędzie. Zachowane identyfikatory, sekwencja AUTOINCREMENT (także usunięte najwyższe ID), komendy/audyt, gracze, urządzenia i wszystkie wizyty/lotki. Nowe kolumny odwzorowują stare straight-in/double-out i naprzemienny start od gracza 1; nie odtwarzają brakujących pól lotek. Ponowienie nie duplikuje szablonów.

`X-Dart-Formats: 1` oznacza klienta rozumiejącego config v1. Bez niego lista zawiera tylko dawne formaty, a odczyt/zapis/parowanie do nowych oraz odzyskanie nieobsługiwanej odpowiedzi są blokowane. Nagłówek nie zastępuje autoryzacji. APK 1.0.1 go nie wysyła; nie zmieniano Androida. Szczegóły przyszłej obsługi: [API](API.md).
