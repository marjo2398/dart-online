# Dart Lens WWW/API

Czytaj README.md, PROJECT_STATE.md, TASK.md i docs/RELEASE_1_3_0.md; instrukcje nadrzędnego workspace również obowiązują. To istniejące React/Vite + PHP/SQLite, jeden produkt z APK. Nie przywracaj MySQL ani /dart/; etap4 anulowany.

WWW jest publiczne bez logowania, z technicznym CSRF, limitami, rewizją i idempotencją. Nie usuwaj uwierzytelniania/zakresów urządzeń ani kontroli propozycji kamer. Błędny token nie przechodzi do publicznego aktora. Archiwum importu nie daje sterowania. Telefon jest właścicielem lokalnego meczu do potwierdzonego przekazania.

Zachowuj ID, komendy/UUID/payload, konfiguracje i historię; nie kasuj zawodników z historią. Testy wykonuj na osobnej bazie, nie na produkcji. Przed Gitem sprawdź i zachowaj cudze zmiany. Bez agentów, wymiany stosu i ogólnej refaktoryzacji. Push/merge/publikacja tylko z aktualnego polecenia; deploy hostingu zawsze wymaga osobnego zlecenia. Build/JVM/HTTP nie potwierdzają telefonu ani działania nowego wydania na produkcji.
