# Zamknięcie wspólnego wydania1.2.1 — 29.10.2026

- [x] APK i WWW: wspólny zakres1–3, publiczny panel, zachowana własność i role; poprawka bilansu/rekordów Androida.
- [x]33 testy JVM,39 scenariuszy reguł,8 zbiorów/obaj gracze przez rzeczywiste klasy/API, regresje WWW, lint/build.
- [x] Kod i dokumentacja scalone do main i wypchnięte na aktywne gałęzie obu repo. Artefakty1.2.1 opublikowane w GitHub Releases, pobrane ponownie i zweryfikowane po SHA256. Patrz docs/RELEASE_1_2_1.md oraz PROJECT_STATE.md.
- [ ] Osobno zlecić deploy API/schema8 i WWW na istniejący hosting. Próby urządzeń/produkcji nadal oczekujące, hardware_verified=false. Etap4 anulowany.

Poniższe wpisy są historią; rozbieżność statystyk z1.2.0 naprawiono w1.2.1.

---

# Upgrade istniejącego WWW do APK1.2.0 — 29.10.2026

- [x] Porównanie lokalnych implementacji/artefaktu APK: docs/WEB_UPGRADE.md. Bez agentów i ponownego audytu konkurencji.
- [x] Publiczne wejście, techniczne CSRF/limity/audyt, stare cookies/UUID i zachowane role urządzeń.
- [x] Nawigacja/konfiguracja, dwa wyniki i klawiatura, menu istniejących funkcji. Bez offline/PWA/kamery WWW.
- [x] Jawne pochodzenie importu i archiwum tylko do odczytu; addytywna migracja8.
- [x] Lokalne API/migracje, rzeczywisty klient Androida i klasy statystyk, przeglądarka/dwie karty, lint/build/screenshoty.
- [x] Dokumentacja, paczka z kopią/rollbackiem i lokalny commit według PROJECT_STATE/manifestu.
- [ ] Osobna poprawka Androida: LocalStatistics zalicza przerwanie/anulowanie bez zwycięzcy do lokalnych remisów. Nie zmieniano APK w tym zadaniu.
- [ ] Wdrożenie i rzeczywiste próby telefonu/kamery oraz produkcji. Bez push/merge/deploy/instalacji. Etap4 organizacji pozostaje anulowany.

Poniżej zachowane wcześniejsze zlecenia.

---

# Bieżące zadanie — współpraca z natywnym offline,29.10.2026

- [x] Zachowano WWW etapy1–3 i istniejące ID/historię, etap4 anulowany.
- [x] Wersjonowany kontrakt zasad,39 niezależnie określonych wspólnych scenariuszy Kotlin/PHP.
- [x] Schema7, jawna autoryzacja natywna PIN-em i rozpoznanie kontraktu; import z walidacją/replay i jednym właścicielem, idempotencja/rollback, mapy osób/konflikt rewizji/archiwizacja bez automatycznego scalania nazw.
- [x] Natywny kod operatora/kamery/widza używa istniejącego API; role i decyzja operatora zachowane. Brak wideo, LAN, fuzji i oddzielnych tarcz.
- [x] Rzeczywisty test klienta APK→PHP/SQLite→drugi klient, retry/utrata ACK/restart, brak duplikatów i nadpisania profilu, migracje ze starszych wersji, regresje WWW, lint/build.
- [x] Dokumentacja API/synchronizacji, architektury/spec/roadmap i ograniczeń.
- [ ] Wdrożenie nowego API wymaga osobnego polecenia. W tym zadaniu nie wykonywać deploy/push/merge ani zmian danych produkcji.
- [ ] Próby rzeczywistych telefonów/kamery według ../dart-lens/docs/DEVICE_TESTS.md; hardware_verified=false.

Historia ukończonych etapów poniżej pozostaje zachowana.

---

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
