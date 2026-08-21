# WEB-5B1: deelnemers en planner-readiness

WEB-5B1 voegt aan de staffomgeving de server-rendered route `/beheer/tos/[slug]` toe. Een actieve planner of admin kan daar de registraties van één TOS-event bekijken. Membership blijft de grens voor participantrechten; de staffrol in het actieve profiel blijft de onafhankelijke grens voor beheerrechten. Een staffaccount heeft voor deze route dus geen memberkoppeling nodig.

## Data- en autorisatiegrens

De route maakt één request-scoped Supabase SSR-client met de publishable key en de eigen gebruikers-JWT. De bestaande staffguard, de eventread op slug en de deelnemersread delen die client. Het event-ID komt uitsluitend uit de server-read eventrow. Cross-user participantdata komt alleen uit `staff_event_planner_input(p_event_id uuid)`, de event-scoped SECURITY DEFINER-RPC uit WEB-5B0. Er is geen service-roleclient en er zijn geen brede table grants of directe staffreads op registrations, members of sportprofielen.

De RPC retourneert stabiele registration-, user- en member-IDs voor een toekomstige identity-safe workflow, maar WEB-5B1 toont of serialiseert deze niet in de UI. E-mail en Auth-providerdata maken geen deel uit van het contract. Iedere RPC-row wordt volledig en strikt gevalideerd; één malformed row maakt de gehele deelnemersweergave tijdelijk onbeschikbaar.

## Readiness en presentatie

Een pure TypeScript-module classificeert iedere registration als `READY`, `DECLINED`, `APPROVAL_PENDING`, `APPROVAL_REJECTED`, `MEMBER_INACTIVE`, `SPORT_PROFILE_INACTIVE`, `RANKING_MISSING` of `AVAILABILITY_INVALID`. Voor attending wordt eerst de availability als absolute tijdinstants tegen het eventwindow gecontroleerd. Daarna volgen approval, memberstatus, eventsportspecifiek sportprofiel en ranking. Er geldt geen vijfminutenregel; bijvoorbeeld 20:07 is geldig. Bestaande events over middernacht blijven correct, terwijl alle zichtbare tijden in `Europe/Amsterdam` worden weergegeven.

Voor padel toont de pagina een read-only plannerinput-preview met uitsluitend `READY` attending registrations: naam, padelniveau en availability. Voor tennis zijn dezelfde brondata en het tennisniveau zichtbaar, maar wordt een complete row als `Gegevens compleet` gepresenteerd en is er geen plannerinput-preview, omdat de huidige planner nog padelgericht is.

## Bewuste grenzen

WEB-5B1 schrijft niets aan registrations, members, rankings of plannerinput. Er zijn geen invoercontrols, mutationroutes, browseropslag of drafts. `club_drafts` en `planner_drafts` worden niet gebruikt. Eventediting blijft bij WEB-5A. Event-scoped plannerdrafts, handmatige correcties, persistence en de koppeling met `planner.py`/FastAPI horen bij latere milestones.
