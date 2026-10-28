# Etap 1 WWW — formaty X01, 28.10.2026

- [x] Szybkie 501 i własna rozgrywka dwóch zapisanych zawodników.
- [x] Wersjonowane reguły serwera: wejście/wyjście, legi/sety, wszystkie N legów, remis, przewaga i sudden death.
- [x] Trwały los, wskazanie bull-off, osobne rotacje setów/legów, oczekiwanie na decider.
- [x] Szablony SQLite: zapis/edycja/nazwa/ulubione/usunięcie/użycie; mecz zachowuje własny config.
- [x] Migracja v2/v3 → v4, zachowanie danych i sekwencji ID, rollback błędu, ponowienie bez zmian.
- [x] Dotychczasowy kontrakt APK; blokada nowych formatów po stronie serwera dla APK 1.0.1.
- [x] Testy API, formatów, migracji i klienta WWW; TypeScript/build; próba w przeglądarce na bazie testowej.
- [ ] Osobne zlecenie: ewentualne wdrożenie z kopią bazy. Ten etap niczego nie publikuje.
- [ ] Przyszły Android: odczyt config v1, setów/remisu/faz/otwarcia, bull-off i dopiero wtedy nagłówek obsługi formatów.

Telefony i kamera fizyczna nadal oczekują na próby P0/P1 w sąsiednim `dart-lens/docs/DEVICE_TESTS.md`. Audyt konkurencji pozostaje odroczony. Android/APK bez zmian.
