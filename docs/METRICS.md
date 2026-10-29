# Definicje analizy — metrics v1, 29.10.2026

Kontrakt zamrożony przed implementacją i testami etapu 3. Są to definicje produktu, nie deklaracja regulaminu federacji. Źródłem są obowiązujące (`active=1`) wizyty i rzeczywiste lotki, konfiguracja meczu oraz jawne metadane. Nie wykorzystujemy dawnych sum w `players` jako źródła analizy. Brak cache: każdy odczyt jest spójnym widokiem SQLite.

Domyślnie: rozpoczęcie 501, straight-in/double-out, format legowy, zakończone mecze normalne i poddania, **także oczekujące na zatwierdzenie**, z osobną liczebnością zatwierdzonych/oczekujących. Inne reguły wybiera się jawnie; mieszanka pokazuje ostrzeżenie i grupy reguł. Walkower/przerwanie/anulowanie widoczne jako osobne wyniki administracyjne, wyłączone z punktowania i bilansu normalnych wyników. Poddanie zachowuje faktyczne rzuty, bilans administracyjny osobno. Aktywne/pauza analizowane wyłącznie po zmianie filtra, bez wygranej/porażki meczu. Legi wygrane faktycznie przed przerwaniem/anulowaniem również są wyłączone z agregatów. Raport meczu pokazuje jego faktyczny przebieg i przyczynę wyłączenia.

| Metryka | Wzór / jednostka / zakres | Dane i kwalifikacja / braki |
|---|---|---|
| Próbka | liczby meczów, ukończonych legów, wizyt, lotek | oddzielnie próbka wybrana i włączona do punktowania; częściowe wizyty jawnie policzone |
| Średnia 1/3 lotki | suma applied_score / suma darts_used; razy 3 | wszystkie faktycznie zużyte lotki, również przed double-in; bust ma 0 punktów i faktyczną zapisaną liczbę lotek (nie automatycznie 3); 0 lotek → null |
| First-nine | 3 × punkty pierwszych dokładnie 9 lotek / (9 × liczba kwalifikowanych prób gracz-leg) | całe wizyty do granicy9; przy przecięciu wizyty tylko rzeczywiste pola pozwalają rozdzielić punkty. Bust całej wizyty daje0 także w prefiksie. Przed otwarciem0; legalne otwarcie wg config. Leg krótszy niż9 lub nieznany rozkład przy granicy → wyłączony z tej metryki; pokazujemy pokrycie znane/rozpoczęte próby gracz-leg |
| Rozkład wizyt | 0–39,40–59,60–99,100–139,140–179,180 | applied_score, tylko kompletne wizyty; przedziały rozłączne. Bust w0–39, osobna liczba bustów; partial poza rozkładem |
| Najwyższa wizyta / 180 | max applied_score / liczba applied_score=180 | kompletne wizyty; brak wizyt → max null, liczba0; źródłowy mecz/ID |
| Checkout / 100+ | max applied_score przy is_checkout / liczba takich >=100 | rzeczywiste zakończenie lega, nie decyzja administracyjna; brak → null/0 |
| Skuteczność zadeklarowanych prób lotką | zakończenia w wizytach ze znaną liczbą prób / suma jawnych prób ×100 | liczba prób podana przez operatora lub komplet jawnych flag lotek; nie wnioskujemy jej z remaining, pola ani potwierdzenia double. Wygrana przy0 próbach jest sprzeczna. 0 prób → null. Pokrycie znanych/kwalifikowanych wizyt z możliwością zejścia |
| Skuteczność wizyt z możliwością checkoutu | zakończone checkoutem / kompletne wizyty z legalną drogą w maks.3 lotkach na ich początku ×100 | możliwość według reguł wejścia/wyjścia i stanu otwarcia z tego samego replay. Nie oznacza zamiaru ani próby double. Partial poza mianownikiem; brak okazji → null |
| Konkretne double | trafione pole = zadeklarowany cel / jawne próby z zadeklarowanym celem double ×100 | tylko rzeczywiste lotki z checkout_attempt=1 i target D1–D20/50; trafienie celu nie musi zakończyć lega (np. bust). Próby/ trafienia/ checkouty osobno; brak celu → nieznane, brak prób → null |
| Długość wygranego lega | suma darts_used zwycięzcy w tym legu | tylko rzeczywisty checkout w włączonym meczu, wszystkie zużyte lotki także pre-in i bust. Nie dodajemy lotek rywala. Best=min, średnia=suma długości/liczba legów, rozkład długości; brak → null |
| Hold/break | liczba checkoutów względem faktycznego startera z replay | nieznany starter → osobne unknown; nie zgadujemy z parzystości po bull-off |
| Legi decydujące | wygrane/przegrane rzeczywiste legi z fazą decider/sudden_death | kontekst z replay; fixed bez decidera, przewaga nie jest automatycznie deciderem |
| Bilans normalny / H2H | zwycięstwa/porażki/remisy w normalnie zakończonych meczach | wybrany przeciwnik, status i reguły; wyniki administracyjne osobno; aktywny bez bilansu |
| Legi/sety | faktycznie zdobyte i oddane wg replay | bez przyznanych administracyjnie punktów; przyznany wynik opisany osobno |
| Rozwój / okresy | dzienne liczniki i mianowniki, średnia z ich sum | dzień utworzenia meczu w Europe/Warsaw. Porównanie dwóch jawnych zakresów, bez średniej ze średnich; źródłowe mecze przy rekordach |
| Ostatnie10/50/100 legów | najnowsze ukończone legi z udziałem gracza w wybranym zbiorze | kolejność game.created_at DESC, game.id DESC, leg_no DESC; wszystkie wybrane wizyty gracza w tych legach, także przegranych; nie obejmuje bieżącego lega |

Daty w bazie pozostają UTC ISO8601 z Z. Filtry dni są [początek dnia, początek następnego dnia) w Europe/Warsaw, przeliczane na UTC z uwzględnieniem DST. Kolejność historii: created_at DESC, id DESC; kursor wiąże filtry i najwyższy ID pierwszej strony, więc nowe mecze nie przesuwają kolejnych stron. Zmiana filtrów zeruje kursor.

Nieznane → null/puste CSV, znane0 → 0, brak zastosowania → jawny opis; pokrycie ma licznik i mianownik. Stare sumy pozostają sumami, stare cele/próby/pochodzenie nie są uzupełniane domysłami. Szczegółowe pola nie dowodzą zamiaru. Kamera zaakceptowana przez człowieka ma source camera-confirmed, nie etykietę niezależnej poprawności rozpoznania. Korekta zachowuje poprzednie wersje, oznacza źródło correction i unieważnia niepotwierdzone ponownie próby/cel zmienionego zapisu.

Scalenie to trwały alias starego ID do docelowego, bez przepisywania uczestników meczów. Analiza docelowego profilu obejmuje każdą historię aliasu raz. Wspólny mecz obu grup lub dowolny aktywny mecz którejkolwiek grupy blokuje scalenie; podgląd wskazuje konkretne ID. Eksport zawiera oryginalne ID i mapę aliasów, wersje schema/metrics, filtry, datę i pokrycie, bez tokenów, urządzeń i prywatnego audytu technicznego.
