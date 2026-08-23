# Waitlist-promotion notifications

WEB-10 gebruikt een transactionele outbox voor de enige e-mailmelding in deze
scope: een deelnemer die aantoonbaar van de wachtlijst naar een plaats binnen de
eventcapaciteit promoveert. Een rechtstreekse inschrijving binnen de capaciteit
maakt geen melding.

## Database-authority

- PostgreSQL markeert een attendance-cycle zodra die buiten de capaciteit valt.
- Registration- en capacitytriggers gebruiken dezelfde reconciliationfunctie.
- De outbox bevat identifiers en status, maar nooit een e-mailadres.
- De unieke sleutel `(registration_id, promotion_attending_since)` voorkomt een
  dubbele mail voor dezelfde attendance-cycle.
- Vlak voor verzending valideert de database opnieuw: registration bestaat,
  response is `attending`, de placement is nog `placed`, event is niet
  geannuleerd of afgelopen, en account/member/profile zijn geldig.
- Een stale taak wordt `skipped` en veroorzaakt geen mail.

## Geïsoleerde worker

Alle normale Auth-, participant- en staffflows blijven publishable key + eigen
JWT + RLS gebruiken. De gewone `web`-service ontvangt geen service-role-key.
Een aparte, niet-publieke `notification-worker` draait als licht Node-proces op
uitsluitend het egressnetwerk. De worker roept via HTTPS uitsluitend drie smalle
SECURITY DEFINER-RPC's aan; rechtstreekse outboxtabelrechten zijn ook voor
`service_role` ingetrokken.

De service-role credential zelf heeft platformbreed RLS-bypassrecht. Een lek van
die key heeft daarom een groter bereik dan deze worker. De compensating controls
zijn: nooit naar de browser of normale webcontainer brengen, uitsluitend in de
aparte workercontainer inlezen, geen waarden loggen en de key buiten Git beheren.
Een later platform met een dedicated database/JWT-role
kan deze blast radius verder verkleinen zonder de outboxcontracten te wijzigen.

De worker pollt iedere minuut. Claims gebeuren atomair met `FOR UPDATE SKIP
LOCKED`; vastgelopen claims worden veilig opnieuw beschikbaar gemaakt en na
maximaal vijf pogingen definitief gemarkeerd.

## Runtimeconfiguratie

Alle waarden zijn uitsluitend server-side:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `NOTIFICATION_FROM_EMAIL`

Zonder de complete set blijft de worker fail-closed met
`EMAIL_DELIVERY_RUNTIME_CONFIG_REQUIRED`. Er wordt dan niets geclaimd of
verzonden. De provider is Resend via de HTTPS API; providerresponses en secrets
worden niet in browserresponses of databasevelden opgeslagen.
