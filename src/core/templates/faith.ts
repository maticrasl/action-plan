/** Templates for faith, as data. */
import { DAILY, onDays, perWeek } from './schedules';
import type { Template } from './index';

/* ---------- Faith ---------- */

export const FAITH: Template[] = [
  {
    id: 'exodus-90',
    area: 'faith',
    level: 'ambitious',
    name: ['Exodus 90', 'Exodus 90'],
    emoji: '⛪',
    about: [
      'Ninety days of prayer and asceticism for men, as the Exodus 90 exercise lays them out: a daily holy hour, cold showers and simple living, exercise, and fasting on Wednesdays and Fridays. A week of preparation first; set the dates so day 90 is Easter Sunday.',
      'Devetdeset dni molitve in askeze za moške, kot ju predvideva duhovna vaja Exodus 90: vsakodnevna sveta ura, mrzle prhe in preprosto življenje, vadba ter post ob sredah in petkih. Najprej teden priprave; datume nastavite tako, da bo 90. dan velikonočna nedelja.',
    ],
    goals: [
      {
        k: 'exodus',
        end: 96,
        progress: 'routines',
        title: ['Complete Exodus 90', 'Opraviti Exodus 90'],
        specific: [
          'Keep the prayer and asceticism of Exodus 90 for 90 days.',
          '90 dni živeti molitev in askezo duhovne vaje Exodus 90.',
        ],
        achievable: [
          'Each day asks only for that day, Sundays bring rest, and a missed day is a fresh start, not the end.',
          'Vsak dan zahteva le tisti dan, nedelje prinesejo počitek, zamujen dan pa je nov začetek in ne konec.',
        ],
        relevant: [
          'Freedom from attachments, to love God and the people entrusted to you more fully.',
          'Svoboda od navezanosti, da bi bolj ljubili Boga in ljudi, ki so vam zaupani.',
        ],
      },
    ],
    states: [
      {
        k: 'freedom',
        title: ['Sense of freedom (1–10)', 'Občutek svobode (1–10)'],
        description: [
          'How free you feel from the attachments you gave up, 1 = bound, 10 = free. Rate it each Sunday.',
          'Kako svobodnega se počutite od navezanosti, ki ste se jim odpovedali, 1 = vezan, 10 = svoboden. Ocenite ga vsako nedeljo.',
        ],
      },
    ],
    activities: [
      {
        k: 'date',
        start: 0,
        end: 1,
        goals: ['exodus'],
        title: ['Pick the start date', 'Izbrati datum začetka'],
        description: [
          'Ninety days before Easter Sunday so it ends on Easter; change the dates to match.',
          'Devetdeset dni pred velikonočno nedeljo, da se konča na veliko noč; datume prilagodite.',
        ],
      },
      {
        k: 'why',
        start: 0,
        end: 2,
        goals: ['exodus'],
        title: ['Write down your why', 'Zapisati svoj zakaj'],
        description: [
          'Why you are doing this and for whom you offer the sacrifices.',
          'Zakaj se podajate na pot in za koga darujete svoje odpovedi.',
        ],
      },
      {
        k: 'readings',
        start: 0,
        end: 6,
        goals: ['exodus'],
        title: ['Get the daily readings', 'Pripraviti dnevna branja'],
        description: [
          'The readings from Exodus and a reflection for each day, from the Exodus 90 app or guide.',
          'Branja iz Druge Mojzesove knjige in razmišljanje za vsak dan, iz aplikacije ali priročnika Exodus 90.',
        ],
      },
      {
        k: 'clear',
        start: 4,
        end: 6,
        goals: ['exodus'],
        list: [
          ['Alcohol', 'Alkohol'],
          ['Sweets and snacks', 'Sladkarije in prigrizki'],
          ['Soda and sweet drinks', 'Gazirane in sladke pijače'],
          ['Video games and streaming apps', 'Videoigre in aplikacije za pretakanje'],
          ['Phone apps you don’t need', 'Nepotrebne aplikacije na telefonu'],
        ],
        title: ['Clear the home of temptations', 'Odstraniti skušnjave iz doma'],
        description: [
          'Out of sight is easier to give up; agree with your family on what stays.',
          'Česar ne vidite, se laže odpoveste; z družino se dogovorite, kaj ostane.',
        ],
      },
      {
        k: 'prayer',
        start: 7,
        end: 96,
        repeat: DAILY,
        goals: ['exodus'],
        improves: ['freedom'],
        list: [
          ['Morning offering', 'Jutranje darovanje'],
          ['Holy hour', 'Sveta ura'],
          ['Exodus reading and reflection', 'Branje iz Druge Mojzesove knjige in razmišljanje'],
          ['Nightly examen', 'Večerno izpraševanje vesti'],
        ],
        title: ['Daily prayer', 'Vsakodnevna molitev'],
        description: [
          'An hour of personal prayer before the Lord, or at least 20 minutes in silence if an hour isn’t possible; offer the day on waking and look back on it at night.',
          'Ura osebne molitve pred Gospodom ali vsaj 20 minut v tišini, če ura ni mogoča; ob prebujenju darujte dan, zvečer ga preglejte.',
        ],
      },
      {
        k: 'ascetic',
        start: 7,
        end: 96,
        repeat: DAILY,
        goals: ['exodus'],
        improves: ['freedom'],
        list: [
          ['Cold shower', 'Mrzla prha'],
          ['No alcohol', 'Brez alkohola'],
          ['No sweets, desserts or sweet drinks', 'Brez sladkarij, sladic in sladkih pijač'],
          ['Nothing between meals', 'Nič med obroki'],
          ['No TV, films, sports or video games', 'Brez televizije, filmov, športnih prenosov in videoiger'],
          ['Phone and computer only when needed', 'Telefon in računalnik le, ko je nujno'],
          ['Only music that lifts the mind to God', 'Le glasba, ki dviga misli k Bogu'],
          ['No unnecessary purchases', 'Brez nepotrebnih nakupov'],
          ['At least 7 hours of sleep', 'Vsaj 7 ur spanja'],
        ],
        title: ['Daily disciplines', 'Vsakodnevna askeza'],
        description: [
          'Sunday is a little Easter: rest, celebrate and relax one discipline. Family duties come first.',
          'Nedelja je mala velika noč: počivajte, praznujte in si olajšajte eno od odpovedi. Družinske dolžnosti so na prvem mestu.',
        ],
      },
      {
        k: 'exercise',
        start: 7,
        end: 96,
        repeat: perWeek(3),
        goals: ['exodus'],
        title: ['Intense exercise 3 times a week', 'Trikrat na teden intenzivna vadba'],
        description: [
          'Enough to get your heart rate up; with a health condition, follow your doctor’s advice.',
          'Dovolj, da srce hitreje bije; ob zdravstvenih težavah upoštevajte zdravnikov nasvet.',
        ],
      },
      {
        k: 'fast',
        start: 7,
        end: 96,
        repeat: onDays(2, 4),
        goals: ['exodus'],
        improves: ['freedom'],
        title: ['Fast and abstain on Wednesday and Friday', 'Post in zdržek od mesa ob sredah in petkih'],
        description: [
          'One full meal and two small ones that together are less than a full meal; no meat (fish, eggs and dairy are fine).',
          'En polni obrok in dva manjša, ki skupaj ne presežeta polnega; brez mesa (ribe, jajca in mlečni izdelki so dovoljeni).',
        ],
      },
      {
        k: 'review',
        start: 96,
        end: 96,
        goals: ['exodus'],
        title: ['Look back on day 90', 'Pogled nazaj na 90. dan'],
        description: [
          'What changed, and what will you keep after Easter?',
          'Kaj se je spremenilo in kaj boste ohranili po veliki noči?',
        ],
      },
    ],
  },
];
