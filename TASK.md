# Etap 3 WWW — profile, historia i analiza, 29.10.2026

- [x] Definicje metrics v1 przed obliczeniami/testami; jawna kompletność, faktyczne mianowniki i zasady statusów.
- [x] Profile/goście, edycja i preferencje, archiwizacja/przywrócenie; ochrona dawnych endpointów kasowania.
- [x] Podgląd/scalenie przez trwały alias, konflikty konkretnych meczów, transakcja/audyt/retry, bez przepisywania uczestników.
- [x] Opcjonalne próby/cel/poziom/pochodzenie na istniejących rekordach; sprzęt i warunki meczu.
- [x] Analiza meczu/lega i profilu, H2H, ważone średnie/first-nine, dwa checkout %, przedziały/sektory, rekordy, okresy i ostatnie10/50/100 legów.
- [x] Wspólne filtry, Europe/Warsaw/DST, stabilna stronicowana historia, CSV/JSON i widok druku.
- [x] Migracja rzeczywistego v5→v6, ponowienie/rollback, ręcznie policzony fixture, większa próbka i test przepływu WWW.
- [x] Dokumentacja API/migracji/metryk/instrukcji, bez nowych zależności i nowej APK.
- [ ] Osobno: wdrożenie, przyszłe ekrany Androida i fizyczne próby; w tym etapie niczego nie opublikowano.

# Etap 2 WWW — prowadzenie gry, 29.10.2026

- [x] Suma/pola/„Pozostało”, faktyczna liczba lotek i legalność sekwencji, jawne rozstrzygnięcie niejednoznaczności.
- [x] Klawiatura ekranowa/laptop, Enter/Backspace/Escape, popularne wyniki, zero, zachowany głos.
- [x] Opcjonalne zejścia zależne od lotek i zasad, preferencje double, wyłączenie sugestii głosowych.
- [x] Korekta historii z podglądem/rewizją, stabilnymi ID i jawnym wycofaniem konfliktującego fragmentu; archiwum wersji/inactive.
- [x] Pauza/wznowienie, blokady kamery i starych klientów, zachowanie częściowej wizyty.
- [x] Hold/break, osobny idempotentny rewanż i wybór początku/stron.
- [x] Poddanie/walkower/przerwanie/anulowanie bez fikcyjnych legów, jawny wpływ na statystyki.
- [x] Zatwierdzenie, blokada, ponowne otwarcie z uzasadnieniem; rozdział praw bez rozszerzenia starych grantów.
- [x] Testy API, migracje z rollbackiem, TypeScript/build, klient WWW i lokalny przepływ w dwóch kartach.
- [x] Instrukcja operatora i aktualizacja SPEC/API/ARCHITECTURE/ROADMAP/stanu.
- [ ] Osobno: autoryzacja wdrożenia, przyszły Android i testy sprzętowe. Niczego nie opublikowano.

## Zachowany etap 1 WWW — formaty X01, 28.10.2026

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
