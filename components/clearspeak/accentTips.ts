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

export interface PromptCadence {
  chunks: string[];
  stressUK?: string;
  stressUS?: string;
}

export const PROMPT_CADENCE: Record<string, PromptCadence> = {
  // Words
  'collaboration': {
    chunks: ['collaboration'],
    stressUK: 'kuh-lab-uh-RAY-shun',
    stressUS: 'kuh-lab-er-AY-shun',
  },
  'methodology': {
    chunks: ['methodology'],
    stressUK: 'meth-uh-DOL-uh-jee',
    stressUS: 'meth-uh-DAH-luh-jee',
  },
  'deliverables': {
    chunks: ['deliverables'],
    stressUK: 'dih-LIV-ur-uh-buhlz',
    stressUS: 'duh-LIV-er-uh-buhlz',
  },
  'infrastructure': {
    chunks: ['infrastructure'],
    stressUK: 'IN-fruh-struk-chuh',
    stressUS: 'IN-fruh-struk-cher',
  },
  'stakeholders': {
    chunks: ['stakeholders'],
    stressUK: 'STAYK-hohl-duhz',
    stressUS: 'STAYK-hohl-derz',
  },
  'prioritization': {
    chunks: ['prioritization'],
    stressUK: 'pry-or-ih-ty-ZAY-shun',
    stressUS: 'pry-or-uh-tuh-ZAY-shun',
  },
  'feasibility': {
    chunks: ['feasibility'],
    stressUK: 'fee-zuh-BIL-ih-tee',
    stressUS: 'fee-zuh-BIL-uh-dee',
  },
  'architecture': {
    chunks: ['architecture'],
    stressUK: 'AH-kih-tek-chuh',
    stressUS: 'AHR-kuh-tek-cher',
  },
  'requirements': {
    chunks: ['requirements'],
    stressUK: 'rih-KWY-uh-muhnts',
    stressUS: 'ree-KWYR-muhnts',
  },
  'optimization': {
    chunks: ['optimization'],
    stressUK: 'op-tih-my-ZAY-shun',
    stressUS: 'ahp-tuh-muh-ZAY-shun',
  },
  'benchmarking': {
    chunks: ['benchmarking'],
    stressUK: 'BENCH-mah-king',
    stressUS: 'BENCH-mahr-king',
  },
  'scalability': {
    chunks: ['scalability'],
    stressUK: 'skay-luh-BIL-ih-tee',
    stressUS: 'skay-luh-BIL-uh-dee',
  },
  'quantitative': {
    chunks: ['quantitative'],
    stressUK: 'KWON-tih-tuh-tiv',
    stressUS: 'KWAHN-tuh-tay-tiv',
  },
  'governance': {
    chunks: ['governance'],
    stressUK: 'GUHV-uh-nuhns',
    stressUS: 'GUHV-er-nuhns',
  },
  'specifications': {
    chunks: ['specifications'],
    stressUK: 'speh-sih-fih-KAY-shuhnz',
    stressUS: 'speh-suh-fuh-KAY-shuhnz',
  },

  // Phrases
  'Could we review the next steps?': {
    chunks: ['Could we review', 'the next steps?'],
    stressUK: 'kood we re-VIEW  |  the NEXT steps',
    stressUS: 'kood we re-VIEW  |  the NEXT steps',
  },
  'Let me walk you through the key findings.': {
    chunks: ['Let me walk you through', 'the key findings.'],
    stressUK: 'let me WAWK you through  |  the KEY FIND-ings',
    stressUS: 'let me WAHK you through  |  the KEY FIND-ings',
  },
  'Based on our current sprint velocity.': {
    chunks: ['Based on', 'our current sprint velocity.'],
    stressUK: 'BASED on  |  our KUH-ruhnt SPRINT veh-LOS-ih-tee',
    stressUS: 'BASED on  |  our KUR-uhnt SPRINT veh-LAHS-uh-dee',
  },
  'I recommend aligning on these requirements first.': {
    chunks: ['I recommend aligning', 'on these requirements first.'],
    stressUK: 'I rek-uh-MEND uh-LYNE-ing  |  on these rih-KWY-uh-munts FIRST',
    stressUS: 'I rek-uh-MEND uh-LYNE-ing  |  on these ree-KWYR-munts FIRST',
  },
  'From an architectural standpoint.': {
    chunks: ['From an architectural', 'standpoint.'],
    stressUK: 'from an ah-kih-TEK-chuh-ruhl  |  STAND-poynt',
    stressUS: 'from an ahr-kuh-TEK-cher-uhl  |  STAND-poynt',
  },
  'We observed a noticeable performance lift.': {
    chunks: ['We observed', 'a noticeable performance lift.'],
    stressUK: 'we uhb-ZERVD  |  a NOH-tis-uh-buhl puh-FAW-muhns LIFT',
    stressUS: 'we uhb-ZERVD  |  a NOH-duh-suh-buhl per-FOR-muhns LIFT',
  },
  'Let us align with the core engineering group.': {
    chunks: ['Let us align', 'with the core engineering group.'],
    stressUK: 'let us uh-LYNE  |  with the KAW en-jih-NEER-ing GROOP',
    stressUS: 'let us uh-LYNE  |  with the KOR en-juh-NEER-ing GROOP',
  },
  'To ensure seamless cross-functional delivery.': {
    chunks: ['To ensure', 'seamless cross-functional delivery.'],
    stressUK: 'to in-SHAW  |  SEEM-lis CROSS-funk-shuh-nuhl dih-LIV-uh-ree',
    stressUS: 'to in-SHUR  |  SEEM-lis KRAHS-funk-shuh-nuhl duh-LIV-er-ee',
  },
  'According to our quarterly business review.': {
    chunks: ['According to', 'our quarterly business review.'],
    stressUK: 'uh-KAW-ding to  |  our KWAW-tuh-lee BIZ-nis re-VIEW',
    stressUS: 'uh-KOR-ding to  |  our KWOR-ter-lee BIZ-nis re-VIEW',
  },
  'I would like to highlight two critical trade-offs.': {
    chunks: ['I would like to highlight', 'two critical trade-offs.'],
    stressUK: 'I would LIKE to HY-lyte  |  TWO CRIT-ih-kuhl TRAYD-ofs',
    stressUS: 'I would LIKE to HY-lyte  |  TWO CRIT-uh-kuhl TRAYD-ahfs',
  },
  'This gives us a clear operational advantage.': {
    chunks: ['This gives us', 'a clear operational advantage.'],
    stressUK: 'this GIVES us  |  a CLEAR op-uh-RAY-shuh-nuhl uhd-VAHN-tij',
    stressUS: 'this GIVES us  |  a CLEAR ahp-er-AY-shuh-nuhl uhd-VAN-tij',
  },
  'Before committing to the final implementation roadmap.': {
    chunks: ['Before committing', 'to the final implementation roadmap.'],
    stressUK: 'bih-FAW kuh-MIT-ing  |  to the FY-nuhl im-plih-men-TAY-shun ROHD-map',
    stressUS: 'bih-FOR kuh-MIT-ing  |  to the FY-nuhl im-pluh-muhn-TAY-shun ROHD-map',
  },
  'We validated the acceptance criteria thoroughly.': {
    chunks: ['We validated', 'the acceptance criteria thoroughly.'],
    stressUK: 'we VAL-ih-day-tid  |  the uhk-SEP-tuhns kry-TEER-ee-uh THUH-ruh-lee',
    stressUS: 'we VAL-uh-day-did  |  the uhk-SEP-tuhns kry-TEER-ee-uh THUR-o-lee',
  },
  'Let us pause for any immediate questions.': {
    chunks: ['Let us pause', 'for any immediate questions.'],
    stressUK: 'let us PAWZ  |  for EN-ee ih-MEE-dee-uht KWES-chuhnz',
    stressUS: 'let us PAHZ  |  for EN-ee ih-MEE-dee-uht KWES-chuhnz',
  },
  'Moving forward with our recommended approach.': {
    chunks: ['Moving forward', 'with our recommended approach.'],
    stressUK: 'MOO-ving FAW-wuhd  |  with our rek-uh-MEN-did uh-PROHCH',
    stressUS: 'MOO-ving FOR-werd  |  with our rek-uh-MEN-did uh-PROHCH',
  },

  // Sentences
  'The project team will share a clear update tomorrow morning.': {
    chunks: ['The project team', 'will share a clear update', 'tomorrow morning.'],
    stressUK: 'The PROJ-ekt team  |  will SHARE a CLEAR up-date  |  to-MOR-row MAWN-ing.',
    stressUS: 'The PRAHJ-ekt team  |  will SHARE a CLEAR up-date  |  to-MAHR-ro MORN-ing.',
  },
  'We prioritized these critical user stories to meet the quarterly milestone.': {
    chunks: ['We prioritized', 'these critical user stories', 'to meet the quarterly milestone.'],
    stressUK: 'We pry-OR-ih-tyzd  |  these CRIT-ih-kuhl YOO-zuh stor-eez  |  to MEET the KWAW-tuh-lee MYL-stohn.',
    stressUS: 'We pry-OR-uh-tyzd  |  these CRIT-uh-kuhl YOO-zer stor-eez  |  to MEET the KWOR-ter-lee MYL-stohn.',
  },
  'Our automated testing pipeline caught the regression before deployment.': {
    chunks: ['Our automated testing pipeline', 'caught the regression', 'before deployment.'],
    stressUK: 'Our AW-tuh-may-tid TEST-ing PYP-lyn  |  CAUGHT the re-GRESH-uhn  |  bih-FAW dih-PLOY-muhnt.',
    stressUS: 'Our AH-tuh-may-did TEST-ing PYP-lyn  |  CAHT the re-GRESH-uhn  |  bih-FOR dih-PLOY-muhnt.',
  },
  'I collaborated closely with product managers to refine the business specifications.': {
    chunks: ['I collaborated closely', 'with product managers', 'to refine the business specifications.'],
    stressUK: 'I kuh-LAB-uh-ray-tid CLOSE-ly  |  with PROD-ukt MAN-ih-juhz  |  to re-FYNE the BIZ-nis speh-sih-fih-KAY-shuhnz.',
    stressUS: 'I kuh-LAB-er-ay-did CLOSE-ly  |  with PRAHD-ukt MAN-uh-jerz  |  to re-FYNE the BIZ-nis speh-suh-fuh-KAY-shuhnz.',
  },
  'We analyzed system performance metrics to identify potential throughput bottlenecks.': {
    chunks: ['We analyzed system performance metrics', 'to identify', 'potential throughput bottlenecks.'],
    stressUK: 'We AN-uh-lyzd SYS-tuhm puh-FAW-muhns MET-riks  |  to eye-DEN-tih-fye  |  poh-TEN-shuhl THROO-put BOT-uhl-neks.',
    stressUS: 'We AN-uh-lyzd SYS-tuhm per-FOR-muhns MET-riks  |  to eye-DEN-tuh-fye  |  poh-TEN-shuhl THROO-put BAH-tuhl-neks.',
  },
  'The stakeholders appreciated our transparent communication regarding project delivery dates.': {
    chunks: ['The stakeholders appreciated', 'our transparent communication', 'regarding project delivery dates.'],
    stressUK: 'The STAYK-hohl-duhz uh-PREE-shee-ay-tid  |  our trans-PAIR-uhnt kuh-myoo-nih-KAY-shun  |  rih-GAH-ding PROJ-ekt dih-LIV-uh-ree dates.',
    stressUS: 'The STAYK-hohl-derz uh-PREE-shee-ay-did  |  our trans-PAIR-uhnt kuh-myoo-nuh-KAY-shun  |  ree-GAHR-ding PRAHJ-ekt duh-LIV-er-ee dates.',
  },
  'I conducted user interviews to uncover the root cause behind drop-off rates.': {
    chunks: ['I conducted user interviews', 'to uncover the root cause', 'behind drop-off rates.'],
    stressUK: 'I kuhn-DUK-tid YOO-zuh IN-tuh-views  |  to un-KUV-uh the ROOT cause  |  bih-HYND DROP-off rates.',
    stressUS: 'I kuhn-DUK-tid YOO-zer IN-ner-views  |  to un-KUV-er the ROOT cause  |  bih-HYND DAH-pawf rates.',
  },
  'Our cross-functional agile rituals improved overall sprint predictability and team morale.': {
    chunks: ['Our cross-functional agile rituals', 'improved overall sprint predictability', 'and team morale.'],
    stressUK: 'Our CROSS-funk-shuh-nuhl AJ-yl RIT-choo-uhlz  |  im-PROOVD oh-vuh-RAWL SPRINT pree-dik-tuh-BIL-ih-tee  |  and TEAM muh-RAHL.',
    stressUS: 'Our KRAHS-funk-shuh-nuhl AJ-uhl RIT-choo-uhlz  |  im-PROOVD oh-ver-AHL SPRINT pree-dik-tuh-BIL-uh-dee  |  and TEAM muh-RAL.',
  },
  'We established clear acceptance criteria before kicking off development on the banking module.': {
    chunks: ['We established clear acceptance criteria', 'before kicking off development', 'on the banking module.'],
    stressUK: 'We eh-STAB-lisht CLEAR uhk-SEP-tuhns kry-TEER-ee-uh  |  bih-FAW KIK-ing OFF dih-VEL-uhp-muhnt  |  on the BANK-ing MOD-yool.',
    stressUS: 'We eh-STAB-lisht CLEAR uhk-SEP-tuhns kry-TEER-ee-uh  |  bih-FOR KIK-ing OFF dih-VEL-uhp-muhnt  |  on the BANK-ing MAHDJ-ool.',
  },
  'I regularly prepared detailed business requirement documents for senior leadership review.': {
    chunks: ['I regularly prepared', 'detailed business requirement documents', 'for senior leadership review.'],
    stressUK: 'I REG-yoo-luh-lee prih-PAIR-d  |  DEE-tayld BIZ-nis rih-KWY-uh-muhnt DOK-yoo-muhnts  |  for SEE-nyuh LEE-duh-ship re-VIEW.',
    stressUS: 'I REG-yuh-ler-lee prih-PAIR-d  |  DEE-tayld BIZ-nis ree-KWYR-muhnt DAHK-yuh-muhnts  |  for SEE-nyer LEE-der-ship re-VIEW.',
  },
  'By streamlining the onboarding funnel, we reduced friction and accelerated user conversion.': {
    chunks: ['By streamlining the onboarding funnel,', 'we reduced friction', 'and accelerated user conversion.'],
    stressUK: 'By STREAM-ly-ning the ON-baw-ding FUN-uhl  |  we re-DYOOS-t FRIK-shun  |  and uhk-SEL-uh-ray-tid YOO-zuh kuhn-VUR-shun.',
    stressUS: 'By STREAM-ly-ning the AHN-bor-ding FUN-uhl  |  we re-DOOS-t FRIK-shun  |  and uhk-SEL-er-ay-did YOO-zer kuhn-VER-zhun.',
  },
  'We monitored error logs continuously to verify zero unexpected regressions after release.': {
    chunks: ['We monitored error logs continuously', 'to verify zero unexpected regressions', 'after release.'],
    stressUK: 'We MON-ih-tuhd EH-ruh LOGS kuhn-TIN-yoo-uhs-lee  |  to VEH-rih-fye ZEER-oh un-ek-SPEK-tid re-GRESH-uhnz  |  AF-tuh re-LEES.',
    stressUS: 'We MAH-nuh-terd EHR-er LAHGS kuhn-TIN-yoo-uhs-lee  |  to VER-uh-fye ZEER-oh un-ek-SPEK-tid re-GRESH-uhnz  |  AF-ter re-LEES.',
  },
  'The engineering team demonstrated rapid adaptability when handling urgent production incidents.': {
    chunks: ['The engineering team demonstrated', 'rapid adaptability', 'when handling urgent production incidents.'],
    stressUK: 'The en-jih-NEER-ing TEAM DEM-uhn-stray-tid  |  RAP-id uh-dap-tuh-BIL-ih-tee  |  when HAND-ling UR-juhnt pruh-DUK-shun IN-sih-duhnts.',
    stressUS: 'The en-juh-NEER-ing TEAM DEM-uhn-stray-did  |  RAP-id uh-dap-tuh-BIL-uh-dee  |  when HAND-ling ER-juhnt pruh-DUK-shun IN-suh-duhnts.',
  },
  'Effective stakeholder alignment requires active listening and proactive risk mitigation.': {
    chunks: ['Effective stakeholder alignment', 'requires active listening', 'and proactive risk mitigation.'],
    stressUK: 'ih-FEK-tiv STAYK-hohl-duh uh-LYNE-muhnt  |  rih-KWY-uhz AK-tiv LIS-ning  |  and proh-AK-tiv RISK mit-ih-GAY-shun.',
    stressUS: 'ih-FEK-tiv STAYK-hohl-der uh-LYNE-muhnt  |  ree-KWYR-z AK-tiv LIS-ning  |  and proh-AK-tiv RISK mit-uh-GAY-shun.',
  },
  'Our data-driven insights enabled the steering committee to make confident investment decisions.': {
    chunks: ['Our data-driven insights', 'enabled the steering committee', 'to make confident investment decisions.'],
    stressUK: 'Our DAY-tuh-DRIV-uhn IN-syts  |  en-AY-buhld the STEER-ing kuh-MIT-ee  |  to MAKE KON-fih-duhnt in-VEST-muhnt dih-SIZH-uhnz.',
    stressUS: 'Our DAY-duh-DRIV-uhn IN-syts  |  en-AY-buhld the STEER-ing kuh-MIT-ee  |  to MAKE KAHN-fuh-duhnt in-VEST-muhnt duh-SIZH-uhnz.',
  },

  // Free response
  'Describe a recent challenge and how you approached it.': {
    chunks: ['Describe a recent challenge', 'and how you approached it.'],
    stressUK: 'dih-SKRYB a REE-suhnt CHAL-inj  |  and HOW you uh-PROHCH-t it.',
    stressUS: 'duh-SKRYB a REE-suhnt CHAL-inj  |  and HOW you uh-PROHCH-t it.',
  },
  'Walk me through a project where you had to manage conflicting stakeholder priorities.': {
    chunks: ['Walk me through a project', 'where you had to manage', 'conflicting stakeholder priorities.'],
    stressUK: 'WAWK me THROUGH a PROJ-ekt  |  where you HAD to MAN-ij  |  kuhn-FLIK-ting STAYK-hohl-duh pry-OR-ih-teez.',
    stressUS: 'WAHK me THROUGH a PRAHJ-ekt  |  where you HAD to MAN-ij  |  kuhn-FLIK-ting STAYK-hohl-der pry-OR-uh-deez.',
  },
  'Explain how you ensure high quality and clarity in your technical documentation.': {
    chunks: ['Explain how you ensure', 'high quality and clarity', 'in your technical documentation.'],
    stressUK: 'ek-SPLAYN how you in-SHAW  |  HIGH KWOL-ih-tee and KLAIR-ih-tee  |  in your TEK-nih-kuhl dok-yoo-men-TAY-shun.',
    stressUS: 'ek-SPLAYN how you in-SHUR  |  HIGH KWAH-luh-dee and KLAIR-uh-dee  |  in your TEK-nuh-kuhl dahk-yuh-muhn-TAY-shun.',
  },
  'Tell me about a time you identified an operational bottleneck and how you resolved it.': {
    chunks: ['Tell me about a time', 'you identified an operational bottleneck', 'and how you resolved it.'],
    stressUK: 'TELL me uh-BOWT a TIME  |  you eye-DEN-tih-fyd an op-uh-RAY-shuh-nuhl BOT-uhl-nek  |  and HOW you re-ZOLVD it.',
    stressUS: 'TELL me uh-BOWT a TIME  |  you eye-DEN-tuh-fyd an ahp-er-AY-shuh-nuhl BAH-tuhl-nek  |  and HOW you re-ZAHLVD it.',
  },
  'How do you handle disagreement during sprint planning or requirement sign-off?': {
    chunks: ['How do you handle disagreement', 'during sprint planning', 'or requirement sign-off?'],
    stressUK: 'HOW do you HAN-duhl dis-uh-GREE-muhnt  |  DYOOR-ing SPRINT PLAN-ing  |  or rih-KWY-uh-muhnt SYNE-off?',
    stressUS: 'HOW do you HAN-duhl dis-uh-GREE-muhnt  |  DOOR-ing SPRINT PLAN-ing  |  or ree-KWYR-muhnt SYNE-off?',
  },
};

export function getPromptCadence(text: string, profileId: string): PromptCadence {
  const clean = text.trim();
  const found = PROMPT_CADENCE[clean];
  if (found) return found;

  const parts = clean.split(/(?<=[,;.!?])\s+/);
  const chunks: string[] = [];
  for (const part of parts) {
    const words = part.split(/\s+/);
    if (words.length <= 5) {
      chunks.push(part);
    } else {
      for (let i = 0; i < words.length; i += 4) {
        chunks.push(words.slice(i, i + 4).join(' '));
      }
    }
  }
  return { chunks: chunks.length ? chunks : [clean] };
}

export function getFriendlyDimensionFeedback(
  name: string,
  score: number | null,
  profileId: string,
  phoneticTip: string | null,
): { feedback: string; statusBadge: string } {
  if (score === null) {
    return {
      feedback: 'Speech clarity was insufficient to evaluate this metric. Try again in a quieter setting.',
      statusBadge: 'Needs audio',
    };
  }

  const isUK = profileId.includes('GB');
  const accentName = isUK ? 'British' : 'American';

  if (score >= 85) {
    switch (name) {
      case 'intelligibility':
        return { feedback: 'Clear, crisp articulation. All words and syllables were recognized accurately.', statusBadge: 'Excellent' };
      case 'pronunciation':
        return {
          feedback: phoneticTip
            ? `Strong phonetic precision. Remember key focus: ${phoneticTip}`
            : 'Accurate consonant attacks and vowel placement matching the reference model.',
          statusBadge: 'Excellent',
        };
      case 'prosody':
        return { feedback: 'Natural cadence, rhythm, and balanced phrase stress.', statusBadge: 'Natural rhythm' };
      case 'fluency':
        return { feedback: 'Continuous speech flow with confident pacing and smooth transitions.', statusBadge: 'Fluent' };
      case 'targetStyle':
        return {
          feedback: phoneticTip
            ? `Strong alignment with ${accentName} accent features. ${phoneticTip}`
            : `Solid alignment with contemporary ${accentName} speech characteristics.`,
          statusBadge: `${accentName} aligned`,
        };
      default:
        return { feedback: 'High accuracy performance on this dimension.', statusBadge: 'Good' };
    }
  } else if (score >= 70) {
    switch (name) {
      case 'intelligibility':
        return { feedback: 'Good speech clarity with slight syllable blending or soft word endings.', statusBadge: 'Good clarity' };
      case 'pronunciation':
        return {
          feedback: phoneticTip
            ? `Understandable pronunciation. Focus area: ${phoneticTip}`
            : 'Clear vowels; focus on sharper consonant articulation at word boundaries.',
          statusBadge: 'On track',
        };
      case 'prosody':
        return { feedback: 'Developing cadence; shadow the reference audio to smooth out phrasing.', statusBadge: 'Developing' };
      case 'fluency':
        return { feedback: 'Steady pace; reducing small hesitations will improve continuous flow.', statusBadge: 'Steady' };
      case 'targetStyle':
        return {
          feedback: phoneticTip
            ? `Moderate accent alignment. Tip: ${phoneticTip}`
            : `Approaching ${accentName} speech rhythm; listen to the 0.8x slow model for subtle vowel shifts.`,
          statusBadge: 'Developing',
        };
      default:
        return { feedback: 'Consistent progress on this speaking dimension.', statusBadge: 'Good' };
    }
  } else {
    switch (name) {
      case 'intelligibility':
        return { feedback: 'Some words were unclear or omitted. Speak closer to the microphone at a steady tempo.', statusBadge: 'Needs focus' };
      case 'pronunciation':
        return {
          feedback: phoneticTip
            ? `Dialect focus to practice: ${phoneticTip}`
            : 'Listen to the reference voice model and practice articulating each sound slowly.',
          statusBadge: 'Practice sound',
        };
      case 'prosody':
        return { feedback: 'Practice along with the reference voice to match natural sentence cadence and pauses.', statusBadge: 'Practice rhythm' };
      case 'fluency':
        return { feedback: 'Pacing was hesitant; repeat the sentence at a relaxed, continuous speed.', statusBadge: 'Practice pacing' };
      case 'targetStyle':
        return {
          feedback: phoneticTip
            ? `Key dialect marker: ${phoneticTip}`
            : `Listen to the ${accentName} reference audio at 0.8x slow speed to absorb the accent features.`,
          statusBadge: 'Listen & shadow',
        };
      default:
        return { feedback: 'Listen to the audio reference and try recording again.', statusBadge: 'Practice' };
    }
  }
}
