/** The Guide's articles in Slovenian: the same ids, groups, actions and links as guide.en.ts. */
import type { Article, ArticleId } from './guide';

export const guideSl: readonly Article<ArticleId>[] = [
  /* ---------- Za začetek ---------- */
  {
    id: 'method',
    group: 'start',
    title: 'Kako deluje Akcijski načrt',
    body: `<p>Akcijski načrt temelji na eni zamisli: cilj je razdalja med tem, kje ste, in tem, kam želite priti, in to razdaljo prehodite po korakih.</p>
<ul>
<li><strong>Vizija</strong> je stanje, ki si ga želite in ga nikoli ne zaključite, na primer »Biti v dobri formi in živeti zdravo«. Odgovarja na vprašanje <em>čemu</em>.</li>
<li><strong>Cilj</strong> je točka na poti, ki jo lahko dosežete in odkljukate: »Do 1. junija preteči 10 km brez ustavljanja«. Odgovarja na vprašanje <em>kaj in do kdaj</em>.</li>
<li><strong>Trenutno stanje</strong> je to, kje ste danes, kot število, ki ga merite znova in znova: vaš najdaljši tek, vaši prihranki. Odgovarja na vprašanje <em>koliko še</em>.</li>
<li><strong>Aktivnosti</strong> so koraki. Nekatere naredite enkrat, druge so <strong>rutine</strong>, ki jih ponavljate. Odgovarjajo na vprašanje <em>kaj naredim ta teden</em>.</li>
</ul>
<p>Aplikacija jih poveže, tako da kljukica pri rutini ali nova meritev sama premakne napredek cilja. Zemljevid kaže, kaj čemu služi, Časovnica kdaj, Grafi pa, ali deluje.</p>
<p>Metoda je v praksi preprosta:</p>
<ol>
<li>Izberite en cilj, ki vam je pomemben.</li>
<li>Iskreno zapišite, kje ste.</li>
<li>Načrtujte naslednje dva ali tri korake, prvega tako majhnega, da ga naredite danes.</li>
<li>Delajte, kljukajte, merite.</li>
<li>Enkrat na teden poglejte načrt in spremenite, kar ne ustreza več.</li>
</ol>
<p>Načrt, ki se spreminja, je načrt, ki ga uporabljate.</p>`,
    related: ['words', 'what-goal', 'review'],
  },
  {
    id: 'words',
    group: 'start',
    title: 'Besede, ki jih uporablja aplikacija',
    body: `<ul>
<li><strong>Načrt</strong> – en sklop ciljev, stanj in aktivnosti. Imate jih lahko več, na primer enega za zdravje in enega za hišo.</li>
<li><strong>Vizija</strong> – želeno stanje brez konca. Skupna je vsem vašim načrtom.</li>
<li><strong>Smisel</strong> – tista vizija, h kateri vodijo vse druge vizije in vsi aktivni cilji, ko jih tako povežete.</li>
<li><strong>Cilj</strong> – rezultat z rokom. <strong>Aktiven</strong>, <strong>Zaustavljen</strong> ali <strong>Dosežen</strong>.</li>
<li><strong>Podcilj</strong> – manjši cilj na poti do večjega.</li>
<li><strong>Trenutno stanje</strong> – nekaj, kar merite. Vsaka nova vrednost nadomesti prejšnjo (teža) ali pa se količine <strong>seštevajo</strong> (pretečeni kilometri).</li>
<li><strong>Aktivnost</strong> – korak. <strong>Enkratna aktivnost</strong>, <strong>seznam</strong> (kontrolni seznam), <strong>rutina</strong> (se ponavlja) ali <strong>rutinski seznam</strong> (kontrolni seznam, ki se ponavlja).</li>
<li><strong>Povezava</strong> – vez med dvema elementoma: aktivnost <em>prispeva k</em> cilju, <em>izboljšuje</em> stanje, <em>je odvisna od</em> druge aktivnosti; stanje <em>opisuje trenutno stanje</em> cilja.</li>
<li><strong>SMART</strong> – pet stvari, ki jih vpraša obrazec cilja: natančen (Specific), merljiv (Measurable), izvedljiv (Achievable), pomemben (Relevant), časovno določen (Time-bound).</li>
</ul>`,
    related: ['method'],
  },
  {
    id: 'tips-all',
    group: 'start',
    title: 'Nasveti in triki',
    body: `<p>Stvari, ki jih aplikacija zmore in jih je lahko spregledati:</p>
<ul>
<li><strong>Zemljevid</strong> pokaže, kaj čemu služi in kaj ničemur.</li>
<li><strong>Časovnica</strong> pokaže vaše korake na koledarju. Povlecite trak, da premaknete njegove datume.</li>
<li><strong>Grafi</strong> narišejo meritve trenutnega stanja kot črto, ob vaši ciljni vrednosti.</li>
<li>Ko določen dan ne gre, vam rutina lahko dovoli, da ga nadoknadite na drug dan: stikalo pod Ponavljanjem.</li>
<li>Trenutno stanje, ki ga vsakič dopolnite, na primer s kilometri ali denarjem, se lahko sešteva samo: vklopite »Se sešteva« in vpišite le, kar je novega.</li>
<li>Aktivnost, ki vsebuje več stvari, je lahko seznam, da jih odkljukate eno za drugo.</li>
<li>Več stvari, ki jih delate vsak dan, je lahko en rutinski seznam, na primer »Jutranja rutina«: odkljukajte postavke in dan se odkljuka sam.</li>
<li>Predloge pokažejo, kako so urejeni podobni cilji. Vzemite, kar vam ustreza.</li>
<li>Vaši načrti so samo v tem brskalniku, dokler se ne prijavite z Googlom ali izvozite kopije.</li>
<li>Akcijski načrt je lahko na vašem začetnem zaslonu in se odpre kot vsaka druga aplikacija, tudi brez povezave.</li>
<li>Pridržite katerokoli kartico ali jo kliknite z desno tipko za meni: prikažite jo na Zemljevidu, dodajte ji korak, spremenite njeno stanje.</li>
<li>Ctrl + Enter shrani obrazec, v katerem ste.</li>
<li>Načrt, ki je pomagal vam, lahko izvozite kot predlogo: vaše korake brez vaših številk.</li>
</ul>
<p>Nasveti se na Pregledu pojavijo vsake toliko. Izklopite jih v Nastavitvah › Videz. Ko ste odprti za kakšnega, ga prosite tukaj.</p>`,
    action: { do: 'ask-tip', label: 'Pokaži mi nasvet' },
    related: ['method'],
  },

  /* ---------- Ko se zatakne ---------- */
  {
    id: 'what-goal',
    group: 'stuck',
    title: 'Ne vem, kakšen cilj naj si postavim',
    body: `<p>Tu se ljudje najpogosteje ustavijo, in to ne pomeni, da vam manjka volje. Večina ljudi ve, kaj jih moti, dolgo preden ve, kaj si želi.</p>
<p>Poskusite eno od tega, s papirjem in svinčnikom, deset minut:</p>
<ul>
<li><strong>Začnite pri tem, kar vas moti.</strong> Zapišite tri stvari v svojem življenju, ki bi jih čez eno leto radi imeli drugačne. Eno obrnite: »Ves čas sem brez energije« postane »Med tednom spim sedem ur«.</li>
<li><strong>Začnite pri dobrem dnevu.</strong> Opišite navaden torek čez tri leta, če bo šlo dobro. Kje se zbudite, kaj počnete, kdo je z vami? Kaj od tega dneva danes manjka?</li>
<li><strong>Začnite pri tem, kar že počnete.</strong> Nekaj, k čemur se vračate, ne da bi vam kdo rekel, je namig. Kaj bi bil »korak naprej«?</li>
</ul>
<p>Potem izberite <strong>enega</strong>. Ne najpomembnejšega, temveč tistega, s katerim bi se ta mesec radi ukvarjali. Prvi cilj, ki traja od štiri do osem tednov, vas nauči več kot popoln petletni cilj.</p>
<p>Če se nič ne utrne, odprite predloge in jih nekaj preberite. Ni vam treba uporabiti nobene; ko vidite, kako so drugi željo razdelili na korake, se pogosto zbudi tudi vaša.</p>`,
    action: { do: 'templates', label: 'Začni s predlogo' },
    related: ['vision-how', 'smart-fit', 'too-many'],
  },
  {
    id: 'vision-how',
    group: 'stuck',
    title: 'Ne vem, kakšne so moje vizije',
    body: `<p>Vizija ni cilj. »Biti prisoten oče« ali »Živeti brez skrbi za denar« nikoli ne zaključite; le približujete se ali oddaljujete. Prav zato je koristna: ko je cilj dosežen ali spodleti, vizija ostane in vam pove, kateri cilj je naslednji.</p>
<p>Da jo najdete, vzemite cilj, ki ga že imate, in se vprašajte »čemu?«. Potem vprašajte isto še za odgovor. »Preteči 10 km« – čemu? »Da bom v formi.« – čemu? »Da mi bo pri petdesetih ostalo dovolj energije za otroke.« Ko se odgovor ne spreminja več, imate vizijo. Zapišite jo, kot da je že resnična, s svojimi besedami, ne z besedami, ki lepo zvenijo.</p>
<p>Znaki, da je vizija res vaša: želeli bi si jo, tudi če nihče ne bi vedel zanjo; pomembna bi bila, tudi če zanjo nikoli ne bi dobili pohvale.</p>
<p>Za uporabo aplikacije vizij ne potrebujete. Najbolj pomagajo na dneve, ko je cilj le še obveznost, ker vas spomnijo, zakaj ste si ga postavili.</p>
<p>Ko vse vizije vodijo k eni viziji na vrhu in ji služijo vsi aktivni cilji, jo aplikacija označi kot vaš <strong>Smisel</strong>. Vzemite ga kot urejeno sliko tega, za kar delate zdaj, ne kot končni odgovor; ljudem se smisel spreminja.</p>`,
    action: { do: 'add-vision', label: 'Dodaj vizijo' },
    related: ['what-goal', 'h-visions', 'let-go'],
  },
  {
    id: 'too-many',
    group: 'stuck',
    title: 'Vse hočem spremeniti naenkrat',
    body: `<p>Verjetno lahko, le ne v istem mesecu. Vsak aktiven cilj skoraj vsak dan zahteva pozornost, pozornosti pa načrt ne more dodati.</p>
<ul>
<li>Naj bodo aktivni <strong>dva ali trije</strong> cilji. Pri več se vsak premika tako počasi, da se zdi brez pomena.</li>
<li>Druge nastavite na <strong>Zaustavljen</strong> (odprite cilj, »Stanje«). Zaustavljeni cilji obdržijo vse in ne štejejo kot zamujeni. So vrsta, ne pokopališče.</li>
<li>Ko je en cilj dosežen ali je postal navada, vzemite naslednjega.</li>
<li>Če se dva cilja med sabo vlečeta (varčevati, več potovati), se odločite, kateri gre to obdobje prvi. Tega načrt ne more odločiti namesto vas, če pa vprašanje pustite odprto, se upočasnita oba.</li>
</ul>`,
    action: { do: 'view-goals', label: 'Odpri Cilje' },
    related: ['what-goal', 'pressure'],
  },
  {
    id: 'smart-fit',
    group: 'stuck',
    title: 'Moj cilj ne ustreza obrazcu',
    body: `<p>Obrazec cilja vpraša pet stvari. Shranite ga lahko samo z naslovom in se vrnete pozneje; črke pokažejo, kaj je še odprto. Nekaj poti naprej:</p>
<ul>
<li><strong>Natančen</strong> – opišite, kaj boste videli tisti dan, ko bo opravljeno. »Priti v formo« postane »Preteči od doma do jezera in nazaj brez hoje«.</li>
<li><strong>Merljiv</strong> – če ga že merite kot trenutno stanje, izberite to stanje pod <strong>»Meri ga stanje«</strong>: enota in trenutna vrednost mu nato sledita. Če nobeno število ne ustreza, spremenite »Napredek iz« v <strong>»Opravljenih aktivnosti«</strong> (cilj je dosežen, ko so opravljeni njegovi koraki) ali <strong>»Izvajanje rutin«</strong> (cilj je to, kako redno vztrajate). Oboje sta pošteni meri.</li>
<li><strong>Izvedljiv</strong> – poimenujte tisto, kar vas bo najverjetneje oviralo, in kaj boste naredili, ko pride. »Če sem po službi brez moči, namesto teka deset minut hodim.« Načrt za slab dan je tisto, kar naredi cilj izvedljiv.</li>
<li><strong>Pomemben</strong> – zakaj je pomemben <em>vam</em>. »Zdravnik je rekel« je začetek; »Želim priti po stopnicah brez ustavljanja« je boljše.</li>
<li><strong>Časovno določen</strong> – datum je ocena, ne obljuba. Izberite enega in ga premaknite, ko boste vedeli več.</li>
</ul>
<p>Prva različica, ki je približno prava, zadošča. Čez dva tedna cilj spet odprite in ga izboljšajte; takrat boste vedeli stvari, ki jih danes ne morete.</p>
<p>Ko je naloga za vas nova, si cilj postavite za <strong>učenje</strong>, ne za rezultat: »Do marca preizkusiti tri načine učenja španščine in izbrati enega« namesto »Znati 1500 besed«.</p>`,
    related: ['no-number', 'what-goal', 'h-goals'],
  },
  {
    id: 'no-number',
    group: 'stuck',
    title: 'Ne znam ga izraziti s številom',
    body: `<p>Nekatere stvari, vredne želje, nimajo naravnega števila: več miru, boljši zakon, občutek domačnosti v novem kraju. Štirje načini, kako jih vseeno meriti:</p>
<ul>
<li><strong>Štejte, kar naredite.</strong> »Izvajanje rutin«: dva večera na teden brez telefona, skupni sprehod vsako nedeljo. Občutka ne morete ukazati, dogovor pa lahko držite.</li>
<li><strong>Štejte korake.</strong> »Opravljenih aktivnosti«: pet stvari, ki pomenijo, da ste resno poskusili, ko so opravljene.</li>
<li><strong>Ocenite sami.</strong> Trenutno stanje »Kako miren je bil ta teden, 1–10«, vpisano vsako nedeljo. Je grobo, a črta na grafu vam bo po dveh mesecih vseeno nekaj povedala.</li>
<li><strong>Štejte viden znak.</strong> Prespane noči. Dnevi brez cigarete. Večerje za mizo.</li>
</ul>
<p>Izberite mero, na katero lahko vplivate s tem, kar naredite ta teden. Število, ki je odvisno predvsem od drugih ljudi ali od sreče, vas bo potrlo, ne glede na to, kako trdo delate.</p>`,
    related: ['smart-fit', 'h-states'],
  },
  {
    id: 'first-steps',
    group: 'stuck',
    title: 'Ne vem, kateri so koraki',
    body: `<p>Ne potrebujete cele poti, le naslednji kos.</p>
<ul>
<li>Vprašajte se: <strong>»Kaj je prva stvar, ki jo naredim, če začnem danes?«</strong> Pogosto je to nekaj izvedeti: pogledati cene, vprašati nekoga, ki je to že naredil, se naročiti. To je pravi korak. Dodajte ga.</li>
<li>Dodajte korak z imenom <strong>»Ugotovi, kako«</strong> z rokom ta teden. Ko bo opravljen, boste poznali naslednja dva.</li>
<li>Pojdite nazaj: kaj mora veljati tik preden je cilj dosežen? In pred tem?</li>
<li>Poglejte <strong>predlogo</strong> za podoben cilj in si izposodite njene korake.</li>
<li>Pri veščini ali zdravju ura z nekom, ki se spozna (trenerjem, učiteljem, zdravnikom), prihrani mesece. Naj bo »Dogovori se za uro z …« prva aktivnost.</li>
</ul>
<p>Podrobno načrtujte le dva ali tri korake naprej. Za naprej zadošča groba opomba; tako ali tako jo boste prepisali.</p>`,
    action: { do: 'add-activity', label: 'Dodaj aktivnost' },
    related: ['not-starting', 'h-activities'],
  },
  {
    id: 'not-starting',
    group: 'stuck',
    title: 'Načrt imam, a ne začnem',
    body: `<p>Med tem, da nekaj želite, in tem, da to naredite, je večja razdalja, kot se zdi. Vrzel navadno ni lenoba; korak je prevelik, preveč nejasen ali nima mesta v vašem dnevu.</p>
<ul>
<li><strong>Zmanjšajte ga.</strong> Če korak čaka že več dni, ga skrajšajte, dokler ne traja deset minut. »Napiši življenjepis« postane »Odpri stari življenjepis in zapiši, kaj je zastarelo«. Težek je začetek; večina ljudi nadaljuje, ko enkrat začne.</li>
<li><strong>Dajte mu čas in kraj.</strong> »V soboto po zajtrku za kuhinjsko mizo odprem stari življenjepis.« Korak, vezan na trenutek, je opravljen veliko pogosteje kot korak, ki ga nameravate narediti »ta teden«. Trenutek zapišite v naslov aktivnosti, dan pa v njen rok.</li>
<li><strong>Poimenujte oviro, preden pride.</strong> Kaj vas bo najverjetneje ustavilo? Utrujenost po službi? Potem: »Če sem po službi brez moči, naredim samo pet minut.« Obrazec cilja to vpraša pod Izvedljiv; pri posameznem koraku to zapišite v »Podrobnosti«.</li>
<li><strong>Še nocoj odstranite eno oviro.</strong> Copati pri vratih. Natisnjen obrazec. Odprt zavihek.</li>
</ul>
<p>Če se korak še vedno ne premakne, se vprašajte, ali si cilj želite ali le mislite, da bi ga morali. To je pošteno vprašanje, o njem govori [[let-go]].</p>`,
    related: ['first-steps', 'overplanning', 'let-go'],
  },
  {
    id: 'routine-slips',
    group: 'stuck',
    title: 'Svojo rutino kar naprej izpuščam',
    body: `<p>Skoraj vsak jo. Nova rutina potrebuje od nekaj tednov do skoraj leta, da postane samoumevna, in izpuščen dan tu in tam tega ne podre. Škodi misel »Prekinjeno je, zdaj je konec«.</p>
<ul>
<li><strong>Ena kljukica vas vrne na pot.</strong> V aplikaciji rutina velja za zamujeno le, dokler je spet ne odkljukate. Zamujeni dnevi so sivi, ne rdeči, ker so v preteklosti.</li>
<li><strong>Zmanjšajte jo.</strong> Če je opravite manj kot polovico, je rutina prevelika za vaše življenje, kakršno je zdaj. Trije teki na teden postanejo dva. Trideset minut postane deset. Povečajte jo, ko mesec dni zdrži.</li>
<li><strong>Navežite jo na nekaj, kar se že zgodi.</strong> Po jutranji kavi. Ko parkiram avto. Stara navada postane opomnik. Zapišite jo v ime rutine.</li>
<li><strong>Dovolite si majhno različico za slabe dni.</strong> »Na slab dan obujem copate in grem do vogala.« Šteje. Odkljukajte jo.</li>
<li><strong>Sprostite dneve.</strong> Če določeni dnevi ne ustrezajo vašim tednom, rutino spremenite v število ponovitev na teden ali vklopite »Zamujeni dan je mogoče nadoknaditi na drug dan«.</li>
</ul>
<p>Aplikacija nima opomnikov. Prve tedne si nastavite budilko na telefonu ali rutino vpišite v koledar.</p>`,
    action: { do: 'view-activities', label: 'Odpri Aktivnosti' },
    related: ['fell-off', 'too-busy', 'h-routines'],
  },
  {
    id: 'fell-off',
    group: 'stuck',
    title: 'Že tedne ne odpiram načrta',
    body: `<p>Dobrodošli nazaj. Nič ni izgubljeno in ničesar vam ni treba nadoknaditi.</p>
<p>Pomaga vedeti, kaj se tu navadno zgodi: po premoru je seznam zamujenega videti kot račun, zato ga ne pogledamo, premor pa se podaljša. Izhod je, da današnji dan vzamete kot nov začetek, ne kot vrnitev k staremu urniku.</p>
<ol>
<li><strong>Ne</strong> kljukajte in ne popravljajte vsega. Odprite Pregled in izberite <strong>en</strong> korak za danes.</li>
<li>Premaknite datume. Odprite Časovnico in zamujene trakove povlecite tja, kjer se zdaj res lahko zgodijo. Datum v preteklosti je le stara ocena. »Premakni zamujene korake« na Pregledu jih premakne vse hkrati in ohrani njihov vrstni red.</li>
<li>Zaustavite, česar ta mesec ne boste delali.</li>
<li>Pri rutinah odkljukajte današnji dan. To je vse, kar je treba, da ste spet na poti.</li>
<li>Vprašajte se, zakaj ste nehali. Bolezen in naporni tedni minejo sami. Če je bil načrt pretežak ali cilj ni bil več pomemben, spremenite načrt, ne sebe.</li>
</ol>`,
    action: { do: 'replan', label: 'Premakni zamujene korake …' },
    related: ['routine-slips', 'behind', 'let-go', 'review'],
  },
  {
    id: 'behind',
    group: 'stuck',
    title: 'Zaostajam, rok pa je blizu',
    body: `<p>Kartica cilja pravi »Za tempom« in koliko bi bilo odslej treba na teden. To število je pošteno izhodišče za tri možnosti.</p>
<p>Najprej: to je običajno. Ljudje skoraj vedno pričakujemo, da bodo stvari trajale manj časa, kot res trajajo, tudi ko vemo, da navadno trajajo dlje.</p>
<p>Imate tri poštene možnosti in vse tri so načrtovanje, ne neuspeh:</p>
<ul>
<li><strong>Več časa zdaj.</strong> Ali lahko ta teden kaj opustite, da naredite prostor? Odločite se, kaj, ne le »potruditi se moram bolj«.</li>
<li><strong>Premaknite datum.</strong> Če je bil rok vaša ocena, ga ocenite znova s tem, kar veste zdaj. »Premakni zamujene korake« na Pregledu jih premakne vse hkrati in ohrani njihov vrstni red.</li>
<li><strong>Zmanjšajte cilj.</strong> 8 km na dan D ni 10, je pa veliko več kot tam, kjer ste začeli.</li>
</ul>
<p>Ko je rok določen od zunaj (izpit, tekma), zmanjšajte obseg: kateri koraki so za rezultat najpomembnejši? Naredite te, druge pa brez slabe vesti izbrišite.</p>
<p>Za naslednjič: ko določate datum, se vprašajte, koliko časa so vam podobne stvari vzele prej, in uporabite to, ne tega, koliko bi morale trajati.</p>`,
    action: { do: 'replan', label: 'Premakni zamujene korake …' },
    related: ['no-progress', 'pressure'],
  },
  {
    id: 'no-progress',
    group: 'stuck',
    title: 'Delam, a število se ne premakne',
    body: `<p>Kljukice brez premika so znak, da je treba pogledati načrt, in dobro je, da to vidite.</p>
<ul>
<li><strong>Je še prezgodaj?</strong> Teža, kondicija, prihranki in veščine se premikajo počasi in neenakomerno. Graf glejte čez šest ali osem tednov, ne od ene meritve do druge. Napoved gleda zadnjih šest tednov, najbolj zadnje dni, ne zadnje meritve.</li>
<li><strong>Je mera prava?</strong> Morda ste v boljši formi, tehtnica pa stoji. Dodajte drugo trenutno stanje, ki ujame, kar se spreminja: obseg pasu, tempo, kako gredo stopnice.</li>
<li><strong>So to pravi koraki?</strong> Biti zaposlen in napredovati sta različni stvari. Katera aktivnost naj bi premaknila to število? Če je bila povezava le upanje, za en mesec preizkusite drug korak. Pod grafom stanja »Ali deluje?« primerja tedne, ko ste rutino izvajali, s tedni, ko je niste. Preden kaj pove, potrebuje kak mesec ali dva kljukic in meritev.</li>
<li><strong>Je odmerek dovolj velik?</strong> Enkrat na teden vas morda drži na mestu; dvakrat vas morda premakne.</li>
<li><strong>Vprašajte nekoga, ki se spozna.</strong> Zataknjeno število je najboljši trenutek za uro s trenerjem, učiteljem, zdravnikom ali svetovalcem. Prinesite svoj graf.</li>
</ul>
<p>Če je cilj odvisen predvsem od stvari zunaj vaših rok, merite, kar naredite (»Izvajanje rutin«), rezultat pa naj bo dodatek.</p>`,
    action: { do: 'view-graphs', label: 'Odpri Grafe' },
    related: ['behind', 'no-number'],
  },
  {
    id: 'pressure',
    group: 'stuck',
    title: 'Ob načrtu se počutim slabo',
    body: `<p>Načrt naj bi stvari nosil namesto vas, da jih ni treba nositi v glavi. Če se ob odpiranju počutite, kot da vas nekdo ošteva, je nekaj narobe z načrtom, ne z vami.</p>
<ul>
<li><strong>Preveč je aktivnega.</strong> Zaustavljajte cilje, dokler to, kar ostane, ni videti izvedljivo v običajnem tednu.</li>
<li><strong>Datumi so želje.</strong> Oznake zamude se kopičijo, ko je bil vsak datum najboljši možni primer. Premaknite jih in pri novih dodajte rezervo.</li>
<li><strong>Cilji so od nekoga drugega.</strong> Cilj, ki ste si ga postavili, ker bi ga morali, je težji od tistega, ki si ga želite. Pri vsakem cilju preberite odgovor na »Zakaj je pomemben?«. Če ne zveni kot vi, preberite [[let-go]].</li>
<li><strong>Vidite le, kar manjka.</strong> Preden pogledate, kaj je na vrsti, poglejte, kaj je opravljeno: opravljene aktivnosti, odkljukane dneve, graf od prve meritve.</li>
</ul>
<p>Strogost do sebe ne izboljša dela. Ljudje, ki spodrsljaj sprejmejo z nekaj prijaznosti, se k delu vrnejo prej kot tisti, ki se zanj krivijo.</p>
<p>Nekatere stvari potrebujejo več kot načrt. Če ste večino dni potrti ali tesnobni ali če štetje hrane, teže ali vadbe začne voditi vaš dan, se pogovorite z zdravnikom ali terapevtom in sledenje za zdaj odložite.</p>`,
    related: ['too-many', 'let-go', 'limits'],
  },
  {
    id: 'too-busy',
    group: 'stuck',
    title: 'Moji tedni so nepredvidljivi',
    body: `<p>Izmensko delo, majhni otroci, potovanja, bolezen: načrt za redne tedne se zlomi že v prvem nerednem. Načrt naredite za tedne, kakršne res imate.</p>
<ul>
<li>Uporabljajte rutine, ki zahtevajo <strong>število ponovitev na teden ali mesec</strong>, na katerekoli dni, ne na določene dni.</li>
<li>Pri rutinah, ki imajo določene dni, vklopite <strong>»Zamujeni dan je mogoče nadoknaditi na drug dan«</strong>.</li>
<li>Za težke tedne imejte <strong>majhno različico</strong> vsake rutine in jo štejte.</li>
<li>Na teden načrtujte manj korakov, kot jih gre v dober teden. Boljši je načrt, ki ga premagate, kot tisti, ki premaga vas.</li>
<li>Ciljem dajte daljše roke, kot se zdi potrebno. Nihče vam ne bo odštel točk, ker ste prišli prej.</li>
<li>V res slabem obdobju cilj zaustavite. Iz zaustavitve je laže začeti znova kot iz kupa zamud.</li>
</ul>`,
    related: ['routine-slips', 'behind', 'h-routines'],
  },
  {
    id: 'let-go',
    group: 'stuck',
    title: 'Ta cilj se ne zdi več pravi',
    body: `<p>Cilje ste si postavili vi iz preteklosti, ko ste vedeli manj. Opustiti cilj, ki ne ustreza več, je pametno, in ljudje, ki znajo opustiti cilje, ki so postali nedosegljivi ali nesmiselni, se potem bolje znajdejo kot tisti, ki se jih oklepajo.</p>
<p>Kako ločiti težko obdobje od napačnega cilja:</p>
<ul>
<li>Preberite svoj odgovor na »Zakaj je pomemben?«. Ali še drži?</li>
<li>Bi si ta cilj postavili danes, s tem, kar zdaj veste?</li>
<li>Vas utruja cilj ali le trenutni korak? Dolgočasen korak lahko spremenite; cilj je morda v redu.</li>
</ul>
<p>Potem izberite:</p>
<ul>
<li><strong>Spremenite ga.</strong> Manjši cilj, poznejši datum, druga pot do iste vizije.</li>
<li><strong>Zaustavite ga.</strong> Ne zdaj, morda pozneje.</li>
<li><strong>Izbrišite ga</strong> ali ga označite kot dosežen, če je svoje opravil. Poglejte, kateri viziji je služil in ali bi ji zdaj moralo služiti kaj drugega.</li>
</ul>
<p>Čas, ki ste ga porabili, ni izgubljen; tako ste ugotovili.</p>`,
    related: ['vision-how', 'pressure', 'reached'],
  },
  {
    id: 'reached',
    group: 'stuck',
    title: 'Cilj je dosežen. Kaj zdaj?',
    body: `<p>Označite ga kot dosežen in se pred naslednjim za trenutek ustavite. Ta del je lahko preskočiti, prav on pa olajša naslednji cilj.</p>
<ul>
<li><strong>Zapišite, kaj je delovalo.</strong> Kateri korak ali rutina je naredila razliko? V opis cilja napišite dve vrstici, dokler se še spomnite.</li>
<li><strong>Odločite, kaj ostane.</strong> Veliko rezultatov potrebuje vzdrževanje: teža, jezik, prihranki. Obdržite eno majhno rutino, druge naj se končajo.</li>
<li><strong>Naslednje izberite iz vizije,</strong> ne iz zagona. Kaj zdaj zahteva »Biti v dobri formi in živeti zdravo«? Morda nekaj povsem drugega.</li>
<li><strong>Iz vrste vzemite zaustavljen cilj,</strong> če kateri čaka.</li>
</ul>
<p>Rahla praznina po tem, ko dosežete nekaj, za kar ste delali mesece, je pogosta. Mine, navadno takrat, ko naslednja stvar dobi svoj prvi korak.</p>`,
    related: ['let-go', 'too-many', 'vision-how'],
  },
  {
    id: 'overplanning',
    group: 'stuck',
    title: 'Namesto da bi delal, načrtujem',
    body: `<p>Urejanje načrta daje občutek napredka in je prijetno: okvirji se poravnajo, nič še ni težko. Če ste ta teden več časa preživeli na Zemljevidu kot pri svojih korakih, je to za vas.</p>
<ul>
<li>Načrt je dovolj dober, ko veste <strong>naslednji korak in kdaj ga boste naredili</strong>. Tam se ustavite.</li>
<li>Postavite si mejo: deset minut načrtovanja, potem en opravljen korak, preden aplikacijo spet odprete.</li>
<li>Ne gladite ciljev, ki so mesece daleč. Spremenili se bodo.</li>
<li>Tedenski pregled naj bo edini čas za urejanje. Druge dni: odprite, odkljukajte, zaprite.</li>
</ul>`,
    related: ['not-starting', 'review'],
  },
  {
    id: 'review',
    group: 'stuck',
    title: 'Tedenski pregled',
    body: `<p>Enkrat na teden, pet minut, na dan in ob uri, ki ju izberete sami. To ohranja načrt živ.</p>`,
    review: [
      {
        text: '<strong>Odkljukajte, kar ste naredili.</strong> Aktivnosti, postavke seznamov, dneve rutin, ki ste jih pozabili odkljukati.',
        go: 'view-activities',
        label: 'Aktivnosti',
      },
      {
        text: '<strong>Izmerite.</strong> Vpišite novo vrednost za vsako trenutno stanje, ki se je spremenilo.',
        go: 'view-states',
        label: 'Trenutna stanja',
      },
      {
        text: '<strong>Poglejte nazaj.</strong> Kaj se je ta teden premaknilo? Kaj je pomagalo? En stavek v mislih zadošča.',
        go: 'view-graphs',
        label: 'Grafi',
      },
      {
        text: '<strong>Popravite načrt.</strong> Premaknite datume, ki ne držijo več. Razdelite korak, ki se ni premaknil. Zaustavite, kar je preveč.',
        go: 'view-timeline',
        label: 'Časovnica',
      },
      {
        text: '<strong>Izberite eno stvar za naslednji teden.</strong> Korak, ki je najpomembnejši. Dajte mu dan.',
        go: 'view-dashboard',
        label: 'Pregled',
      },
    ],
    related: ['method', 'fell-off', 'overplanning'],
  },

  /* ---------- Kako … ---------- */
  {
    id: 'h-goals',
    group: 'how',
    title: 'Cilji',
    body: `<p>Cilj dodate z gumbom Dodaj v Ciljih. Obrazec vpraša pet stvari SMART; črke zasvetijo, ko jih izpolnjujete. Cilj se shrani že z naslovom; ostalo dopolnite, ko boste vedeli več.</p>
<p><strong>»Napredek iz«</strong> določa, kako se cilj premika:</p>
<ul>
<li><strong>Meritve</strong> – vpišete merilo, začetno in ciljno vrednost. Povežite trenutno stanje in cilj sledi njegovi zadnji vrednosti.</li>
<li><strong>Opravljenih aktivnosti</strong> – delež opravljenih aktivnosti cilja.</li>
<li><strong>Izvajanje rutin</strong> – kako redno izvajate rutine, povezane s ciljem.</li>
</ul>
<p>Cilj je lahko <strong>del</strong> večjega cilja (podcilj), je lahko <strong>odvisen od</strong> drugega cilja in lahko <strong>služi</strong> vizijam. »Stanje« ga nastavi na Aktiven, Zaustavljen ali Dosežen; ko cilj doseže ciljno vrednost, vas aplikacija vpraša, ali ga označite kot doseženega. <strong>Kategorija</strong> (Zdravje, Finance …) vam omogoča, da cilje filtrirate z oznakami nad seznamom. Pridržite cilj ali ga kliknite z desno tipko za več: dodajte podcilj ali aktivnost zanj, prikažite ga na Zemljevidu ali Časovnici.</p>`,
    action: { do: 'add-goal', label: 'Dodaj cilj' },
    related: ['smart-fit', 'no-number'],
  },
  {
    id: 'h-states',
    group: 'how',
    title: 'Trenutna stanja',
    body: `<p>Trenutno stanje je nekaj, kar merite. Zapišite, kaj vrednost pomeni in kako jo merite, da je vsaka meritev opravljena enako. Tapnite njegovo kartico, da vpišete novo vrednost: eno na dan; druga vrednost istega dne nadomesti prvo. Decimalke delujejo s piko ali z vejico.</p>
<p>Stanje se lahko namesto tega <strong>sešteva</strong> (»Se sešteva: Da«): pretečeni kilometri, privarčevan denar. Takrat je vsak vnos količina, več na dan jih je v redu, kartica pa kaže vsoto. Cilj, ki ga meri tako stanje, izbere, kako šteje: skupno ali na dan, teden, mesec ali leto.</p>
<p>Stanje povežite s ciljem (»Opisuje trenutno stanje ciljev«) in napredek cilja mu sledi. Napačno vrednost izbrišete v Grafih, v tabeli pod grafom stanja, ali v obrazcu stanja pod zgodovino.</p>
<p>Vrednosti, ki jih že vodite v preglednici, lahko prenesete sem: v meniju stanja (desni klik ali pridržanje na kartici ali grafu) ali v njegovem obrazcu »Uvozi iz CSV …« prebere datoteko z datumom in vrednostjo v vsaki vrstici. »Izvozi kot CSV« jih spet prenese ven.</p>`,
    action: { do: 'add-state', label: 'Dodaj trenutno stanje' },
    related: ['h-graphs', 'no-number'],
  },
  {
    id: 'h-activities',
    group: 'how',
    title: 'Aktivnosti',
    body: `<p>Aktivnost je korak. Ko jo dodate, izberite njeno vrsto:</p>
<ul>
<li><strong>Enkratna aktivnost</strong> – narejena enkrat.</li>
<li><strong>Seznam</strong> – kontrolni seznam; opravljen, ko je odkljukana vsaka postavka. Odkljukane postavke so skrite; <strong>Pokaži opravljene postavke</strong> jih prikaže.</li>
<li><strong>Rutina</strong> in <strong>Rutinski seznam</strong> – se ponavljata; glejte [[h-routines]].</li>
</ul>
<p>Aktivnost lahko pozneje spremenite v seznam: odprite jo in izberite <strong>Naredi seznam</strong>; rutina tako postane rutinski seznam.</p>
<p>Enkratne aktivnosti in seznami so pod rutinami: najprej tiste v teku, nato za izvedbo, nato opravljene, vsake po roku. Tapnite krog na kartici, da jo premaknete naprej: Za izvedbo, V teku, Opravljeno. Na začetni datum se aktivnost sama premakne v V teku.</p>
<p>Aktivnost povežite s cilji, h katerim <strong>prispeva</strong>, in stanji, ki jih <strong>izboljšuje</strong>. Lahko je <strong>del</strong> večje aktivnosti (podaktivnost) in je lahko <strong>odvisna od</strong> druge aktivnosti, ki mora biti opravljena prej; do takrat je prikazana kot čakajoča. »Skrij opravljeno in doseženo« skrije dokončane kartice.</p>`,
    action: { do: 'add-activity', label: 'Dodaj aktivnost' },
    related: ['first-steps'],
  },
  {
    id: 'h-routines',
    group: 'how',
    title: 'Rutine',
    body: `<p>Rutina je aktivnost, ki se ponavlja. Pri »Ponavljanje« izberite število ponovitev na teden ali mesec, določene dni ali »Po meri …« za vsakih nekaj dni, tednov, mesecev ali let, dan v mesecu ali dan v tednu, na primer drugi petek. »Konec« določi zadnji dan ali število ponovitev.</p>
<p>Rutino odkljukate na njenem <strong>tedenskem traku</strong>, v Aktivnostih ali na Pregledu. Modro obrobljeni dnevi so na vrsti; sivo črtkani so bili zamujeni; današnji dan je obkrožen. Puščici ob traku vodita v prejšnje tedne, da odkljukate, kar ste pozabili. Zelena oznaka je vaš niz.</p>
<p>Rutina je zamujena le, dokler je spet ne odkljukate. Če je vklopljeno <strong>»Zamujeni dan je mogoče nadoknaditi na drug dan«</strong>, kljukica na kateri drug dan nadomesti zamujenega.</p>
<p>V Aktivnostih so najnujnejše rutine na vrhu: najprej zamujene, nato tiste, ki so na vrsti danes, nato ostale po dnevu, ko bodo naslednjič na vrsti. Rutine, opravljene za to obdobje, in tiste, ki ne tečejo, so na koncu.</p>
<p><strong>Rutinski seznam</strong> je kontrolni seznam, ki se vsakič začne znova, na primer jutranja rutina; ko odkljukate njegovo zadnjo postavko, je odkljukan dan.</p>
<p>Ko rutina izboljšuje stanje, ki se sešteva, vas ob kljukici vpraša »koliko?« in količino v istem koraku prišteje stanju.</p>`,
    action: { do: 'add-routine', label: 'Dodaj rutino' },
    related: ['routine-slips', 'too-busy'],
  },
  {
    id: 'h-visions',
    group: 'how',
    title: 'Vizije in Smisel',
    body: `<p>Vizije so v pogledu Vizije in pripadajo vsem vašim načrtom skupaj. Dodajte vizijo, opišite, kako je videti, kot da je že resnična, in izberite cilje, ki ji služijo; ali pa odprite cilj in izberite »Služi vizijam«. Vizija lahko služi širšim vizijam.</p>
<p>Pogled pove, koliko vizij je na vrhu in kateri aktivni cilji ne služijo nobeni. Ko je ena vizija nad vsemi drugimi in ji služi vsak aktiven cilj v vsakem načrtu, jo aplikacija pokaže v zlati barvi kot vaš <strong>Smisel</strong>.</p>
<p>Sij okoli vsega, kar služi vašemu Smislu, je zlat, dokler je vsak aktiven cilj SMART. Napol izpolnjen shranjen cilj ga obarva srebrno, dokler ga ne dokončate.</p>`,
    action: { do: 'add-vision', label: 'Dodaj vizijo' },
    related: ['vision-how'],
  },
  {
    id: 'h-map',
    group: 'how',
    title: 'Zemljevid',
    body: `<p>Zemljevid nariše vse elemente in povezave: vizije in cilje na vrhu, aktivnosti na sredini, trenutna stanja spodaj. Tapnite okvir ali črto, da ga izberete in osvetlite, s čim je povezan. Dvokliknite ali pritisnite Enter za urejanje, Delete za odstranitev.</p>
<p><strong>Da povežete dva elementa</strong>, z miško povlecite z enega okvirja na drugega. Na zaslonu na dotik pridržite okvir, izberite »Poveži z …« in tapnite drugi okvir. Aplikacija ponudi le povezave, ki ustrezajo tema dvema.</p>
<p>Tapnite ime pasu (Vizije, Cilji, Aktivnosti, Trenutna stanja), da ga strnete; ponoven tap ga razširi. Strnjeni pasovi ostanejo enaki na vseh napravah. Ozadje povlecite za premik, za povečavo uporabite dva prsta ali Ctrl + kolešček. Z desnim klikom na prazno mesto tja nekaj dodate.</p>`,
    action: { do: 'view-map', label: 'Odpri Zemljevid' },
  },
  {
    id: 'h-timeline',
    group: 'how',
    title: 'Časovnica',
    body: `<p>Časovnica kaže cilje in aktivnosti po datumih; element potrebuje začetni datum ali rok, da se pojavi. Aktivnosti so pod cilji, h katerim prispevajo. Rdeči odseki so zamujeni čas, barva traku je njegovo stanje, rutine z določenimi dnevi pa vsak dan kažejo kot opravljen, zamujen ali prihajajoč.</p>
<p>Tapnite trak, da ga izberete, nato ga povlecite, da premaknete njegove datume, ali povlecite en konec, da spremenite le ta datum (na zaslonu na dotik ga najprej pridržite). ▾ ob cilju strne njegove vrstice; Strni vse zgoraj levo strne vse cilje, meni na cilju (desni klik ali pridržanje) pa ponudi oboje. Dva prsta ali Ctrl + kolešček spremenita merilo. Gumb »Premakni zamujene korake …« v orodni vrstici z enim dejanjem prestavi vse zamujene trakove.</p>`,
    action: { do: 'view-timeline', label: 'Odpri Časovnico' },
  },
  {
    id: 'h-graphs',
    group: 'how',
    title: 'Grafi',
    body: `<p>Vsako trenutno stanje z meritvami ima graf: vaše vrednosti skozi čas, črtkano črto za ciljno vrednost cilja in spremembo od prve meritve. Stanje, ki se sešteva, kaže vsote po dnevih, tednih, mesecih ali letih ali skupno vsoto; izberete nad grafom. Vsaka rutina ima graf, kako pogosto ste jo izvedli v posameznem obdobju.</p>
<p>Pri cilju s ciljno vrednostjo in rokom graf nariše tudi tempo: tanko črtkano črto od vašega začetka do ciljne vrednosti. Nad grafom vidite, koliko je odslej treba na teden in kdaj bi prišli do cilja s sedanjim tempom.</p>
<p>Za odčitek vrednosti se postavite nanjo z miško ali jo tapnite; za povečavo obdobja uporabite dva prsta ali Ctrl + kolešček. Tabela pod grafom našteje meritve; napačno izbrišete tam.</p>
<p>Pod grafom stanja, ki ga izboljšuje rutina, in pod grafom same rutine »Ali deluje?« primerja, kako se je stanje premikalo v tednih, ko ste rutino izvajali, in v tednih, ko je niste. Pokaže vzorec, ne dokaza.</p>`,
    action: { do: 'view-graphs', label: 'Odpri Grafe' },
  },
  {
    id: 'h-overview',
    group: 'how',
    title: 'Pregled',
    body: `<p>Pregled je stran za večino dni: koliko ste v povprečju napredovali pri aktivnih ciljih, aktivnosti z rokom do danes ali zamujene (»Prikaži vse« doda še ostale v teku), rutine, ki jih današnji dan še čakajo, in vaši aktivni cilji. Tu kljukate, ne da bi šli kam drugam.</p>`,
    action: { do: 'view-dashboard', label: 'Odpri Pregled' },
  },
  {
    id: 'h-plans',
    group: 'how',
    title: 'Načrti, predloge in datoteke',
    body: `<p>Načrt je en sklop ciljev, stanj in aktivnosti. Stranska vrstica našteje vaše načrte, nazadnje odprtega na vrhu; tapnite načrt, da ga odprete. Njegova pika je zelena, ko ni nič na vrsti, rumena, ko je treba nekaj opraviti danes, in rdeča, ko je nekaj zamujeno. Vsak načrt ima pred imenom emoji: izberete ga, ko načrt ustvarite ali preimenujete: med pogostimi, med vsemi po skupinah ali z iskanjem besede, kot sta »tek« ali »knjiga« (starejši načrt kaže 🙁, dokler ga ne izberete). Ko je stranska vrstica strnjena, seznam ohrani piko in emoji vsakega načrta. Na telefonu tapnite ime načrta nad naslovom. V Nastavitvah je ostalo: nov načrt, preimenovanje, brisanje in <strong>združitev</strong> enega načrta v drugega.</p>
<ul>
<li><strong>Začni s predlogo</strong> odpre pripravljen načrt kot nov načrt, z datumi od danes naprej. Spremenite vse, da vam ustreza.</li>
<li><strong>Naloži vzorčni načrt</strong> odpre izpolnjen primer za ogled.</li>
<li><strong>Izvozi načrt</strong> shrani datoteko: <em>polno kopijo</em> z vašim napredkom, kot varnostno kopijo, ali <em>predlogo</em> brez napredka, da jo delite z nekom; <em>meritve (CSV)</em> za preglednico.</li>
<li><strong>Uvozi načrt</strong> doda datoteko kot nov načrt. Nikoli ne prepiše načrta, ki ga že imate.</li>
</ul>
<p>Barvna pika ob vsakem načrtu je zelena, ko ni nič na vrsti, rumena, ko je kaj na vrsti danes, in rdeča, ko je kaj zamujeno.</p>`,
    action: { do: 'settings', label: 'Odpri Nastavitve' },
    related: ['p-backup'],
  },
  {
    id: 'h-sync',
    group: 'how',
    title: 'Več naprav, več ljudi',
    body: `<p data-only="syncSetUp">Prijavite se z Googlom v Nastavitve › Račun in sinhronizacija in vaši načrti bodo enaki na vsaki napravi, kjer se prijavite. Google vas približno enkrat na uro prosi za potrditev; ko gumb z oblakom pravi, da je sinhronizacija ustavljena, ga kliknite. Spremembe brez povezave počakajo na napravi in se sinhronizirajo pozneje. Če dve napravi spremenita isti element, obvelja poznejša sprememba, zato naj imata uro nastavljeno samodejno.</p>
<p data-only="syncSetUp">Eno napravo lahko uporablja več ljudi: vsak se prijavi s svojim Google računom in vidi le svoje načrte.</p>
<p data-only="noSync">Sinhronizacija za to različico aplikacije ni nastavljena. Vaši načrti ostanejo na tej napravi; za prenos uporabite izvoz in uvoz.</p>`,
    action: { do: 'settings-sync', label: 'Odpri Račun in sinhronizacijo' },
    related: ['p-where', 'p-google'],
  },
  {
    id: 'h-install',
    group: 'how',
    title: 'Namestite aplikacijo, uporabljajte jo brez povezave',
    body: `<p>Akcijski načrt lahko namestite iz brskalnika; potem se odpre z domačega zaslona v svojem oknu, tudi brez povezave. Uporabite »Namesti aplikacijo« v Nastavitvah. Na iPhonu ali iPadu: stran odprite v Safariju, tapnite Deli in nato Dodaj na začetni zaslon.</p>`,
    action: { do: 'install', label: 'Namesti aplikacijo' },
  },
  {
    id: 'h-shortcuts',
    group: 'how',
    title: 'Bližnjice in kretnje',
    body: `<ul>
<li><strong>Pridržite ali kliknite z desno tipko</strong> skoraj karkoli za meni s tem, kar lahko s tem naredite.</li>
<li><strong>Ctrl + Enter</strong> shrani obrazec, v katerem ste. <strong>Esc</strong> ga zapre; če ste kaj spremenili, vas pred zavrženjem vpraša, tako kot Prekliči in ×.</li>
<li>V Vodniku vas <strong>Esc</strong> vrne v pogled, iz katerega ste prišli.</li>
<li>Na Zemljevidu in Časovnici: <strong>Enter</strong> uredi izbrani element, <strong>Delete</strong> ga odstrani, <strong>Esc</strong> prekliče izbiro.</li>
<li>Ko kaj izbrišete, sporočilo na dnu nekaj sekund ponuja <strong>Razveljavi</strong>; <strong>Ctrl + Z</strong> (<strong>⌘ + Z</strong> na Macu) naredi isto. Pozneje je izbrisano še 30 dni v Nastavitve › Podatki › Nedavno izbrisano.</li>
<li><strong>Dva prsta</strong> ali <strong>Ctrl + kolešček</strong> povečata Zemljevid, Časovnico in grafe. Z enim prstom: tapnite, nato se znova dotaknite in povlecite navzdol ali navzgor.</li>
<li>Gumb <strong>Dodaj</strong> vedno doda, kar ustreza pogledu, v katerem ste.</li>
<li><strong>Razlage na zaslonu</strong> (na tej strani in v Nastavitvah) vsakemu pogledu dodajo kratko opombo, kontrolnikom pa oznake ⓘ.</li>
</ul>`,
  },

  {
    id: 'feedback',
    group: 'how',
    title: 'Prijavite težavo, predlagajte funkcijo',
    body: `<p>Oboje je v Nastavitvah, pod Pomoč, in na koncu te strani. Odpre se stran aplikacije na GitHubu; za pisanje tam potrebujete brezplačen račun GitHub. Kar napišete, je javno, zato izpustite vse iz svojih načrtov, kar je zasebno.</p>
<p>Ljudje, ki izdelujejo Action Plan, vaših načrtov ne vidijo, zato opišite, kaj ste naredili in kaj se je zgodilo. Pri težavi aplikacija izpolni svojo različico, vaš brskalnik in velikost okna, jezik ter ali je sinhronizacija vklopljena; to vrstico vidite, preden se karkoli odpre, s »Kopiraj podatke« pa jo kopirate, če jo raje pošljete drugače.</p>`,
    action: { do: 'settings', label: 'Odpri Nastavitve' },
    related: ['p-where'],
  },

  /* ---------- Vaši podatki in zasebnost ---------- */
  {
    id: 'p-where',
    group: 'data',
    title: 'Kje so shranjeni moji načrti',
    body: `<p>Vaši načrti so shranjeni v tem brskalniku, na tej napravi. Akcijski načrt nima svojega strežnika: nič, kar napišete, ni poslano tistim, ki aplikacijo izdelujejo, in vaših načrtov ne morejo videti, brati ali obnoviti.</p>
<p>Če se prijavite z Googlom, je kopija shranjena tudi v vašem Google Drivu, v skriti mapi aplikacije. Glejte [[p-google]].</p>
<p>Aplikacija ne uporablja oglasov ali sledenja in nič o tem, kako jo uporabljate, ne zapusti vaše naprave. Ko prijavite težavo, aplikacija izpolni svojo različico, vaš brskalnik in velikost okna, jezik ter ali je sinhronizacija vklopljena. Nič iz vaših načrtov.</p>
<p>Ko se aplikacija naloži, njene datoteke (med njimi pisava) pridejo s strani, ki jo gosti. Ko odprete Nastavitve, z Googla naloži še Googlov skript za prijavo, da prijava deluje v enem koraku. V obeh primerih podjetje vidi, da je vaša naprava zahtevala datoteko, kot pri vsaki spletni strani. Iz vaših načrtov ne dobi ničesar.</p>`,
    related: ['p-google', 'p-backup', 'p-device'],
  },
  {
    id: 'p-google',
    group: 'data',
    title: 'Kaj naredi prijava z Googlom',
    body: `<p>Prijava da Akcijskemu načrtu eno dovoljenje: da svoje podatke hrani v skriti mapi vašega Google Driva. Aplikacija ne vidi vaših drugih datotek, pošte ali stikov, druge aplikacije pa ne vidijo te mape. Vaš e-poštni naslov in ime sta prebrana ob prijavi, da je na tej napravi vidno, kdo je prijavljen.</p>
<p>Načrte v tej mapi in to, kar ste izbrisali v zadnjih 30 dneh (Nedavno izbrisano), hrani Google pod vašim računom in po Googlovih pogojih. Akcijski načrt jih ne šifrira dodatno, poleg tega, kar Google naredi za vse datoteke v Drivu.</p>
<p>Da prenehate: odjavite se v Nastavitve › Račun in sinhronizacija. Da odstranite kopijo v Drivu: odprite nastavitve Google Driva, »Upravljanje aplikacij«, poiščite Akcijski načrt in izberite »Izbriši skrite podatke aplikacije«. Dovoljenje lahko prekličete v svojem Google računu pod »Aplikacije in storitve drugih ponudnikov«.</p>`,
    related: ['p-where', 'h-sync'],
  },
  {
    id: 'p-device',
    group: 'data',
    title: 'Kdo še lahko vidi moje načrte',
    body: `<p>Kdorkoli lahko odpre ta brskalnik na tej napravi, lahko odpre tudi načrte v njem. Akcijski načrt nima svojega gesla.</p>
<p data-only="multiUser">Ko je na eni napravi prijavljenih več ljudi, ima vsak svoje načrte, ločene od drugih. To ohranja red; ni ključavnica. Ne zanašajte se nanjo pri stvareh, ki morajo ostati skrite pred nekom, ki uporablja isto napravo. Za to uporabite ločen profil brskalnika ali uporabniški račun naprave.</p>
<p>Na skupnem ali javnem računalniku po koncu uporabite »Odstrani s te naprave« v Nastavitve › Račun in sinhronizacija. Kar se je sinhroniziralo, ostane v vašem Google Drivu.</p>`,
    related: ['p-where'],
  },
  {
    id: 'p-backup',
    group: 'data',
    title: 'Ali lahko izgubim svoje načrte?',
    body: `<p data-only="localOnly"><strong>Vaši načrti so zdaj samo v tem brskalniku.</strong></p>
<p>Da, če obstajajo le na enem mestu. Načrti, ki so samo v brskalniku, izginejo, ko izbrišete podatke strani v brskalniku, ko odstranite brskalnik ali ko izgubite napravo. Nekateri brskalniki izbrišejo podatke strani, ki jih dolgo niste obiskali; nameščena aplikacija to naredi manj verjetno.</p>
<p>Za varnost naredite eno od tega:</p>
<ul>
<li><strong>Prijavite se z Googlom</strong>, da je kopija v vašem Drivu in na vaših drugih napravah.</li>
<li>Vsake toliko <strong>izvozite polno kopijo</strong> vsakega načrta ali v Nastavitve › Podatki uporabite <strong>Varnostna kopija vsega</strong> za vse načrte in vizije v eni datoteki, in datoteko shranite drugam.</li>
</ul>
<p>Izbrisan element ali načrt ostane 30 dni v Nastavitve › Podatki › Nedavno izbrisano; s sinhronizacijo tudi na vaših drugih napravah. Potem ga ni več. Ko je sinhronizacija vklopljena, izbris načrta ta načrt izbriše tudi na vaših drugih napravah. Okno za brisanje ponudi, da najprej prenesete varnostno kopijo.</p>`,
    action: { do: 'export', label: 'Izvozi načrt' },
    related: ['h-plans', 'h-sync'],
  },
  {
    id: 'p-delete',
    group: 'data',
    title: 'Kako izbrišem vse?',
    body: `<ul>
<li><strong>En načrt:</strong> Nastavitve › Načrt › Izbriši načrt.</li>
<li><strong>Vaše načrte na tej napravi:</strong> ko ste prijavljeni, Nastavitve › Račun in sinhronizacija › »Odstrani s te naprave«.</li>
<li><strong>Nedavno izbrisano:</strong> Nastavitve › Podatki › Nedavno izbrisano › Izprazni. »Odstrani s te naprave« ga odstrani tudi tu.</li>
<li><strong>Vse na tej napravi,</strong> za vse uporabnike: v nastavitvah brskalnika izbrišite podatke te strani.</li>
<li><strong>Kopijo v Google Drivu:</strong> glejte [[p-google]].</li>
</ul>
<p>Potem od vas ne ostane nič nikjer, za kar bi aplikacija vedela. Izvožene datoteke so vaše in jih izbrišete sami.</p>`,
    related: ['p-google'],
  },

  /* ---------- Česa aplikacija ne zmore ---------- */
  {
    id: 'limits',
    group: 'limits',
    title: 'Česa Akcijski načrt ne more narediti namesto vas',
    body: `<p>Prav je, da to povemo naravnost.</p>
<ul>
<li><strong>Cilja si ne more želeti namesto vas.</strong> Lahko vpraša, zakaj je cilj pomemben; odgovora ne more dati. Cilj, ki si ga ne želite, bo tu stal zamujen, pa naj bo še tako dobro zapisan.</li>
<li><strong>Ne more vas opomniti.</strong> Aplikacija spregovori le, ko jo odprete. Naj bo odpiranje del vašega dneva: po zajtrku, na avtobusu, pred spanjem. Za opomnike uporabite budilko ali koledar na telefonu.</li>
<li><strong>Ne pozna vašega področja.</strong> Ne more presoditi, ali so trije teki na teden pravi trening ali je stopnja varčevanja pametna. Vprašajte ljudi, ki se spoznajo, in njihove nasvete vpišite kot korake.</li>
<li><strong>Ne vidi, kaj počnete.</strong> Ve, kar odkljukate in vpišete. Iskrena je le toliko, kolikor ste z njo iskreni vi, in zasebna je zato, da to lahko ste.</li>
<li><strong>Ne more vam dati časa, denarja ali zdravja.</strong> Načrt razporedi, kar imate. Ko so meja okoliščine, je manjši cilj pravi cilj.</li>
<li><strong>V njej ni drugih ljudi.</strong> Ko eni osebi poveste, na čem delate in kako je šlo, to mnogim pomaga bolj kot katerakoli aplikacija. Načrt izvozite kot predlogo, da ga delite, ali pa komu enkrat na teden preprosto pokažite svoj Pregled.</li>
<li><strong>Ni zdravljenje.</strong> Potrtost, tesnoba, izgorelost, težave s pozornostjo in težave s hrano ali podobo telesa potrebujejo ljudi, ki so za to usposobljeni. Če se ob štetju in merjenju počutite slabše, nehajte meriti in se z nekom pogovorite.</li>
</ul>`,
    related: ['pressure', 'method'],
  },
];
