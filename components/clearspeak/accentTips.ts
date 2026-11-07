/**
 * Phonetic pronunciation guidance for UK and US English accent training.
 */
export interface AccentTip {
  tipUK: string;
  tipUS: string;
}

export const ACCENT_TIPS: Record<string, AccentTip> = {
  // Words
  'collaboration': {
    tipUK: 'Silent terminal r: kuh-lab-uh-RAY-shun. Stress the third syllable.',
    tipUS: 'Clear rhotic r: kuh-lab-er-AY-shun with rounded American r.'
  },
  'methodology': {
    tipUK: 'Short open o: meth-uh-DOL-uh-jee with crisp UK consonants.',
    tipUS: 'Unrounded vowel: meth-uh-DAH-luh-jee with relaxed cadence.'
  },
  'deliverables': {
    tipUK: 'Crisp d and l: dih-LIV-ur-uh-buhlz with light ending.',
    tipUS: 'Smooth transitions: duh-LIV-er-uh-buhlz with rhotic coloring.'
  },
  'infrastructure': {
    tipUK: 'Non-rhotic ending: IN-fruh-struk-chuh (no terminal r).',
    tipUS: 'Rhotic ending: IN-fruh-struk-cher with clear r-sound.'
  },
  'stakeholders': {
    tipUK: 'Broad o: STAYK-hohl-duhz with softened ending.',
    tipUS: 'Full r coloring: STAYK-hohl-derz with audible final z.'
  },
  'prioritization': {
    tipUK: 'Soft British t: pry-or-ih-ty-ZAY-shun with pure vowels.',
    tipUS: 'Flapped t: pry-or-uh-tuh-ZAY-shun with continuous airflow.'
  },
  'feasibility': {
    tipUK: 'Precise syllables: fee-zuh-BIL-ih-tee with true t ending.',
    tipUS: 'Flapped d-like t: fee-zuh-BIL-uh-dee.'
  },
  'architecture': {
    tipUK: 'Non-rhotic ar and ture: AH-kih-tek-chuh.',
    tipUS: 'Full rhotic r: AHR-kuh-tek-cher.'
  },
  'requirements': {
    tipUK: 'Non-rhotic re-quire: rih-KWY-uh-muhnts.',
    tipUS: 'Strong rhotic: ree-KWYR-muhnts.'
  },
  'optimization': {
    tipUK: 'Sharp British t: op-tih-my-ZAY-shun.',
    tipUS: 'Smooth American vowel: ahp-tuh-muh-ZAY-shun.'
  },
  'benchmarking': {
    tipUK: 'Non-rhotic ar: BENCH-mah-king.',
    tipUS: 'Rhotic ar: BENCH-mahr-king.'
  },
  'scalability': {
    tipUK: 'Crisp ending: skay-luh-BIL-ih-tee.',
    tipUS: 'Fast flap: skay-luh-BIL-uh-dee.'
  },
  'quantitative': {
    tipUK: 'True British t: KWON-tih-tuh-tiv.',
    tipUS: 'Soft American t: KWAHN-tuh-tay-tiv.'
  },
  'governance': {
    tipUK: 'Soft ending: GUHV-uh-nuhns.',
    tipUS: 'Rhotic r: GUHV-er-nuhns.'
  },
  'specifications': {
    tipUK: 'Light syllables: speh-sih-fih-KAY-shuhnz.',
    tipUS: 'Standard rhythm: speh-suh-fuh-KAY-shuhnz.'
  },

  // Phrases
  'Could we review the next steps?': {
    tipUK: 'Falling polite pitch at the end, crisp k on Could.',
    tipUS: 'Slight friendly rising intonation with smooth linking.'
  },
  'Let me walk you through the key findings.': {
    tipUK: 'Long open rounded vowel on walk (/wɔːk/).',
    tipUS: 'Open unrounded vowel on walk (/wɑːk/).'
  },
  'Based on our current sprint velocity.': {
    tipUK: 'Current with non-rhotic r sound (/ˈkʌr.ənt/).',
    tipUS: 'Clear rhotic current (/ˈkɝː.ənt/).'
  },
  'I recommend aligning on these requirements first.': {
    tipUK: 'Requirements without hard r; crisp first.',
    tipUS: 'Rhotic requirements; blended consonant transitions.'
  },
  'From an architectural standpoint.': {
    tipUK: 'Non-rhotic architectural (/ˌɑː.kɪ.tek.tʃər.əl/ with silent r).',
    tipUS: 'Rhotic architectural (/ˌɑːr.kə.tek.tʃɚ.əl/).'
  },
  'We observed a noticeable performance lift.': {
    tipUK: 'Noticeable with true t sound; performance non-rhotic.',
    tipUS: 'Noticeable with flapped d sound; performance rhotic.'
  },
  'Let us align with the core engineering group.': {
    tipUK: 'Core without terminal r (/kɔː/).',
    tipUS: 'Core with clear terminal r (/kɔːr/).'
  },
  'To ensure seamless cross-functional delivery.': {
    tipUK: 'Ensure with non-rhotic diphthong (/ɪnˈʃɔː/).',
    tipUS: 'Ensure with strong rhotic (/ɪnˈʃʊr/).'
  },
  'According to our quarterly business review.': {
    tipUK: 'Quarterly with silent r (/ˈkwɔː.tə.li/).',
    tipUS: 'Quarterly with both r sounds (/ˈkwɔːr.tɚ.li/).'
  },
  'I would like to highlight two critical trade-offs.': {
    tipUK: 'Critical with sharp plosive t.',
    tipUS: 'Critical with soft flapped t.'
  },
  'This gives us a clear operational advantage.': {
    tipUK: 'Clear (/klɪə/) without hard r; advantage (/ədˈvɑːn.tɪdʒ/).',
    tipUS: 'Clear (/klɪr/) with rhotic r; advantage (/ədˈvæn.t̬ɪdʒ/).'
  },
  'Before committing to the final implementation roadmap.': {
    tipUK: 'Before without hard r (/bɪˈfɔː/).',
    tipUS: 'Before with rhotic r (/bɪˈfɔːr/).'
  },
  'We validated the acceptance criteria thoroughly.': {
    tipUK: 'Criteria without final r; thoroughly (/ˈθʌr.ə.li/).',
    tipUS: 'Criteria with rhotic r; thoroughly (/ˈθɝː.oʊ.li/).'
  },
  'Let us pause for any immediate questions.': {
    tipUK: 'Pause with rounded vowel /pɔːz/.',
    tipUS: 'Pause with open vowel /pɑːz/.'
  },
  'Moving forward with our recommended approach.': {
    tipUK: 'Forward with non-rhotic r (/ˈfɔː.wəd/).',
    tipUS: 'Forward with clear rhotic r (/ˈfɔːr.wɚd/).'
  },

  // Sentences
  'The project team will share a clear update tomorrow morning.': {
    tipUK: 'Clear and morning have non-rhotic r sounds (/klɪə/, /ˈmɔː.nɪŋ/).',
    tipUS: 'Clear and morning both articulate strong rhotic r (/klɪr/, /ˈmɔːr.nɪŋ/).'
  },
  'We prioritized these critical user stories to meet the quarterly milestone.': {
    tipUK: 'Notice the sharp t in critical and quarterly.',
    tipUS: 'Notice the fast flap t in critical and quarterly.'
  },
  'Our automated testing pipeline caught the regression before deployment.': {
    tipUK: 'Caught has a deep rounded back vowel (/kɔːt/).',
    tipUS: 'Caught has an open unrounded American vowel (/kɑːt/).'
  },
  'I collaborated closely with product managers to refine the business specifications.': {
    tipUK: 'Managers ends in a soft non-rhotic uh sound.',
    tipUS: 'Managers ends in a distinct rhotic er sound.'
  },
  'We analyzed system performance metrics to identify potential throughput bottlenecks.': {
    tipUK: 'Performance has a silent r (/pəˈfɔː.məns/).',
    tipUS: 'Performance has a strong rhotic r (/pɚˈfɔːr.məns/).'
  },
  'The stakeholders appreciated our transparent communication regarding project delivery dates.': {
    tipUK: 'Dates and delivery have crisp, clear consonant attacks.',
    tipUS: 'Dates and delivery have a relaxed, connected cadence.'
  },
  'I conducted user interviews to uncover the root cause behind drop-off rates.': {
    tipUK: 'Interviews has a crisp t sound.',
    tipUS: 'Interviews often elides the t into an n-sound (innerviews).'
  },
  'Our cross-functional agile rituals improved overall sprint predictability and team morale.': {
    tipUK: 'Rituals has an aspirated British t.',
    tipUS: 'Rituals has an American soft flap.'
  },
  'We established clear acceptance criteria before kicking off development on the banking module.': {
    tipUK: 'Banking and criteria flow with even, neutral pitch.',
    tipUS: 'Banking and criteria use dynamic pitch movement.'
  },
  'I regularly prepared detailed business requirement documents for senior leadership review.': {
    tipUK: 'Prepared and documents have elegant non-rhotic phrasing.',
    tipUS: 'Prepared and documents feature full American r-coloring.'
  },
  'By streamlining the onboarding funnel, we reduced friction and accelerated user conversion.': {
    tipUK: 'Conversion (/kənˈvɜː.ʃən/) is non-rhotic.',
    tipUS: 'Conversion (/kənˈvɝː.ʒən/) is distinctly rhotic.'
  },
  'We monitored error logs continuously to verify zero unexpected regressions after release.': {
    tipUK: 'Error (/ˈer.ə/) has no final r sound.',
    tipUS: 'Error (/ˈer.ɚ/) has strong double r sounds.'
  },
  'The engineering team demonstrated rapid adaptability when handling urgent production incidents.': {
    tipUK: 'Rapid and adaptability have precise dental placement.',
    tipUS: 'Rapid and adaptability have connected American linkage.'
  },
  'Effective stakeholder alignment requires active listening and proactive risk mitigation.': {
    tipUK: 'Proactive has a pure British o sound.',
    tipUS: 'Proactive has an American diphthongal o sound.'
  },
  'Our data-driven insights enabled the steering committee to make confident investment decisions.': {
    tipUK: 'Data is pronounced DAY-tuh with a firm t.',
    tipUS: 'Data is pronounced DAY-duh with an alveolar tap.'
  },

  // Free response
  'Describe a recent challenge and how you approached it.': {
    tipUK: 'Focus on measured, steady pacing and clean sentence stops.',
    tipUS: 'Focus on enthusiastic, forward-leaning intonation.'
  },
  'Walk me through a project where you had to manage conflicting stakeholder priorities.': {
    tipUK: 'Maintain a clear cadence and avoid rushed syllables.',
    tipUS: 'Maintain a warm, collaborative rhythm.'
  },
  'Explain how you ensure high quality and clarity in your technical documentation.': {
    tipUK: 'Emphasize key verbs with crisp British consonant clarity.',
    tipUS: 'Emphasize outcomes with natural American phrase stress.'
  },
  'Tell me about a time you identified an operational bottleneck and how you resolved it.': {
    tipUK: 'Articulate bottleneck with a true t sound.',
    tipUS: 'Articulate bottleneck with an easy flap.'
  },
  'How do you handle disagreement during sprint planning or requirement sign-off?': {
    tipUK: 'Keep your intonation calm, authoritative, and collected.',
    tipUS: 'Keep your intonation open, dynamic, and engaging.'
  },
};

export function getPhoneticTip(text: string, profileId: string): string | null {
  const entry = ACCENT_TIPS[text.trim()];
  if (!entry) return null;
  return profileId.includes('GB') ? entry.tipUK : entry.tipUS;
}
