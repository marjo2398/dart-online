# Dart Lens1.3.0 — wydano i wdrożono31.10.2026

WWW/API1.3.0/schema9 działa na https://dartlens.host749284.xce.pl/. APK1.3.0/code15 opublikowano po wdrożeniu serwera. WWW jest publiczne, APK zachowuje offline i własne tokeny/role online; etap4 pozostaje anulowany. [Parowanie, ustawienia i checklista](PAIRING_SETTINGS.md).

## Źródła i pobieranie

- Kod WWW: `b2c08848d60bc549d5b7824d19f226e9aa92d89c`; [wydanie WWW](https://github.com/marjo2398/dart-online/releases/tag/v1.3.0-internal). Plik `Dart-Lens-WWW-1.3.0-portable-20261031.zip`, SHA256 `4005ba02abb4f080b9e338c819a4764c6609da86b004af8780e42793656d962f`. To dokładnie paczka użyta przy wdrożeniu,27 plików/14 w public/. Jej flag production_deployed=false opisuje moment pakowania, przed wykonaniem wdrożenia potwierdzonego poniżej.
- Kod binarium APK: `61607e7c04571195d50179921ff56061727266df`; [wydanie APK](https://github.com/marjo2398/dart-party-/releases/tag/v1.3.0-internal) (repo prywatne, wymaga uprawnionego konta GitHub). Właściwy plik: `Dart-Lens-1.3.0-arm-internal.apk`, 75375246 bajtów, SHA256 `3c4cc2f7cdf31743bdabf0f4d1614682b366f069e92c682ba43f881c265c555a`. Manifest i SHA256SUMS obok.
- Podpis poprzedniego wydania: `60717773ec2b748875349ad5a08ab85205d8077dd5ea1a1c077368c552dc2a95`. pl.dartlens, minSDK28/target35, niedebugowalny, ARM32/64, v2, ZIP16KiB i10 ELF PT_LOAD sprawdzone. Metadane wewnątrz APK wskazują ten sam commit61607e7. Nie odinstalowuj poprzedniej aplikacji i nie czyść danych.
- Oba wydania opublikowano i pobrano ponownie; wszystkie sumy/rozmiary zgodne. Main i aktywne gałęzie połączono przez fast-forward bez force push. Późniejszy commit dokumentacji nie zmienia kodu binarium ani14 plików wdrożenia. Dokładny bieżący main sprawdzaj w Git; powyższe commity identyfikują artefakty.

## Co zmieniono

Przyczyna zgłoszenia była w `OnlineScreen.kt` (cached GamePanel zasłaniał JoinPanel po401) i `OnlineRepository.join` (blokował nowe parowanie przy pending). Nowe parowanie już wcześniej nie wysyłało starego Bearera; nie było stałego bana telefonu. Poprawiono przepływ i zachowano lokalne dane. Nowy dostęp ma nowe ID/token; cofnięty lub wygasły nie odżywa. Rozstrzygnięcie starej komendy wymaga dowodu, identycznego UUID/payload i bieżących uprawnień; nie wykonuje jej ponownie jako nowego aktora.

PIN4cyfry jako tekst/5min, bezpieczne losowanie, HMAC, zaszyfrowana odpowiedź dziennika, atomowe zużycie, limity i zastępowanie w sesji wystawiania. Stare tokeny/12-hex kody są zgodne do swojego terminu; odnowienie nieaktywnego dostępu hasłem wymaga X-Dart-Recovery:1. Dodano lokalne ustawienia głosu/wpisywania/połączeń/analizy, czytelne statusy synchronizacji i ostatnie potwierdzenie, podsumowanie z tabelą i profilami oraz jakość statystyk. Reguły x01/1, operations2, metrics1 bez zmian. Automatyczne odświeżanie nie udostępnia gry ani nie przekazuje właściciela. Archiwum pozostaje bez wspólnego sterowania.

## Wdrożenie i dane

Kanoniczny katalog: `/home/host749284/domains/dartlens.host749284.xce.pl/public_html/dart-lens-app/public`. PHP8.4.27/PDO SQLite/OpenSSL. Schema8→9 najpierw na odrębnej kopii, następnie produkcyjnie. Komplet9 modułów PHP i14 plików aplikacji; wcześniejsze assets zachowano. Prywatny spójny SQLite3::backup oraz poprzedni kod: `/home/host749284/dart-online-backups/release-1.3.0-20261031-01/` (`database-before/`, `code-before/`); integrity=ok. Config/PIN, device-secret i identyczny główny .htaccess/open_basedir zachowane. Rollback przygotowany zgodnie z DEPLOY_HOSTIDO; nie cofaj bazy po nowych zapisach bez oceny ich utraty.

Po smoke porównano każdą starą kolumnę/wiersz:8 graczy,5 meczów,48 wizyt,5 lotek,80 komend,80 audytów,4 urządzenia — bez zmiany. Rzeczywiste stare mecze przed aktualizacją miały ID1,4,5,6,7 i wszystkie są dostępne; historyczna lista1–4 była nieaktualna już w backupie.

HTTPS: zgodne hashe HTML/JS/CSS, public-session i API1.3.0/schema9, profile/historia/urządzenia, stare mecze; konfiguracja/kopie/SQLite/WAL/SHM/sekret/logi403/404. Kontrolowany PIN → operator/kamera/widz → revoke → nowy dostęp → saved bez replay → ręczna korekta/checkout → drugi klient → próbka/raport → jawne zatwierdzenie/lock PASS. To HTTP kontraktu, nie telefon. Mecz8 anulowano i wyłączono z punktowania, profile9/10 archiwalne,4 testowe urządzenia cofnięte, audyt zachowany. Dowody: dart-online/.tools/deploy-20261031/.

## Weryfikacja lokalna i ograniczenia

36 testów Androida PASS,0 pominiętych, w tym rzeczywisty klient Kotlin → osobny lokalny PHP/SQLite; po ostatniej zmianie limitu koperty końcowa ścieżka HTTP/kolejki12/12 ponownie PASS. Build ARM i lint release PASS (0 błędów,18 ostrzeżeń,1 hint). Backend: nowe parowanie5 grup, migracja8→9/powtórzenie/wymuszony rollback, publiczne WWW9 grup, urządzenia19, TypeScript/HTTP4 grupy PASS. Statystyki:16 porównań (8 zestawów, obaj gracze), także oba mianowniki checkoutu i dane częściowe/administracyjne/remis/anulowanie. Bez drugiego silnika analizy i bez fikcyjnych lotek.

WWW lint/build PASS. Rzeczywista przeglądarka z lokalnym API: trwałość preferencji po reload, PIN, układ checkboxów, podsumowanie, link do profilu i brak poszerzania strony na390px. Produkcyjna przeglądarka: publiczny start i ustawienia, odczyt API1.3.0/schema9. Zrzuty desktopu i telefonu w dart-online/.tools/release-1.3.0-20261031/. Narzędzie IAB nie zapisało zrzutu samego długiego raportu; jego dane, link i geometrię sprawdzono w rzeczywistym DOM. Nie potwierdzono renderu ani gry na fizycznym APK/kamerze: hardware_verified=false. Checklista telefonu w PAIRING_SETTINGS.

Trwała podmiana załączników projektu ChatGPT nie jest dostępna przez bieżące narzędzia. Przygotowano rzeczywistą paczkę aktualnych dokumentów obu repo i workspace z manifestem ścieżek, commitów, SHA256 i oznaczeniem lokalnie zmienionego TASK, bez baz/sekretów. Nie oznacza to podmiany źródeł w ChatGPT.
