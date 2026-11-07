export interface PromptItem {
  id: string;
  text: string;
  tipUK: string;
  tipUS: string;
}

export const PROMPTS_POOL: Record<'word' | 'phrase' | 'sentence_reading' | 'free_response', readonly PromptItem[]> = {
  word: [
    { id: '10000000-0000-4000-a000-000000000001', text: 'collaboration', tipUK: 'Silent terminal r: kuh-lab-uh-RAY-shun', tipUS: 'Clear rhotic r: kuh-lab-er-AY-shun' },
    { id: '10000000-0000-4000-a000-000000000011', text: 'methodology', tipUK: 'Short open o: meth-uh-DOL-uh-jee', tipUS: 'Unrounded vowel: meth-uh-DAH-luh-jee' },
    { id: '10000000-0000-4000-a000-000000000012', text: 'deliverables', tipUK: 'Crisp d and l: dih-LIV-ur-uh-buhlz', tipUS: 'Smooth transitions: duh-LIV-er-uh-buhlz' },
    { id: '10000000-0000-4000-a000-000000000013', text: 'infrastructure', tipUK: 'Non-rhotic ending: IN-fruh-struk-chuh', tipUS: 'Rhotic ending: IN-fruh-struk-cher' },
    { id: '10000000-0000-4000-a000-000000000014', text: 'stakeholders', tipUK: 'Broad o: STAYK-hohl-duhz', tipUS: 'Full r coloring: STAYK-hohl-derz' },
    { id: '10000000-0000-4000-a000-000000000015', text: 'prioritization', tipUK: 'Soft British t: pry-or-ih-ty-ZAY-shun', tipUS: 'Flapped t: pry-or-uh-tuh-ZAY-shun' },
    { id: '10000000-0000-4000-a000-000000000016', text: 'feasibility', tipUK: 'Precise syllables: fee-zuh-BIL-ih-tee', tipUS: 'Reduced vowel: fee-zuh-BIL-uh-dee' },
    { id: '10000000-0000-4000-a000-000000000017', text: 'architecture', tipUK: 'Non-rhotic ar and ture: AH-kih-tek-chuh', tipUS: 'Full rhotic r: AHR-kuh-tek-cher' },
    { id: '10000000-0000-4000-a000-000000000018', text: 'requirements', tipUK: 'Non-rhotic re-quire: rih-KWY-uh-muhnts', tipUS: 'Strong rhotic: ree-KWYR-muhnts' },
    { id: '10000000-0000-4000-a000-000000000019', text: 'optimization', tipUK: 'Sharp British t: op-tih-my-ZAY-shun', tipUS: 'Smooth transitions: ahp-tuh-muh-ZAY-shun' },
    { id: '10000000-0000-4000-a000-000000000020', text: 'benchmarking', tipUK: 'Non-rhotic ar: BENCH-mah-king', tipUS: 'Rhotic ar: BENCH-mahr-king' },
    { id: '10000000-0000-4000-a000-000000000021', text: 'scalability', tipUK: 'Crisp ending: skay-luh-BIL-ih-tee', tipUS: 'Fast flap: skay-luh-BIL-uh-dee' },
    { id: '10000000-0000-4000-a000-000000000022', text: 'quantitative', tipUK: 'True British t: KWON-tih-tuh-tiv', tipUS: 'Soft American t: KWAHN-tuh-tay-tiv' },
    { id: '10000000-0000-4000-a000-000000000023', text: 'governance', tipUK: 'Soft ending: GUHV-uh-nuhns', tipUS: 'Rhotic r: GUHV-er-nuhns' },
    { id: '10000000-0000-4000-a000-000000000024', text: 'specifications', tipUK: 'Light syllables: speh-sih-fih-KAY-shuhnz', tipUS: 'Standard: speh-suh-fuh-KAY-shuhnz' },
  ],
  phrase: [
    { id: '10000000-0000-4000-a000-000000000002', text: 'Could we review the next steps?', tipUK: 'Falling polite pitch at the end', tipUS: 'Slight rising intonation' },
    { id: '10000000-0000-4000-a000-000000000025', text: 'Let me walk you through the key findings.', tipUK: 'Long open vowel on walk (/wɔːk/)', tipUS: 'Open vowel on walk (/wɑːk/)' },
    { id: '10000000-0000-4000-a000-000000000026', text: 'Based on our current sprint velocity.', tipUK: 'Current with non-rhotic r sound', tipUS: 'Clear rhotic current (/ˈkɝː.ənt/)' },
    { id: '10000000-0000-4000-a000-000000000027', text: 'I recommend aligning on these requirements first.', tipUK: 'Requirements without hard r', tipUS: 'Rhotic requirements' },
    { id: '10000000-0000-4000-a000-000000000028', text: 'From an architectural standpoint.', tipUK: 'Non-rhotic architectural', tipUS: 'Rhotic architectural' },
    { id: '10000000-0000-4000-a000-000000000029', text: 'We observed a noticeable performance lift.', tipUK: 'Noticeable with true t sound', tipUS: 'Noticeable with flapped d sound' },
    { id: '10000000-0000-4000-a000-000000000030', text: 'Let us align with the core engineering group.', tipUK: 'Core without terminal r', tipUS: 'Core with clear terminal r' },
    { id: '10000000-0000-4000-a000-000000000031', text: 'To ensure seamless cross-functional delivery.', tipUK: 'Seamless with crisp sibilants', tipUS: 'Natural smooth cadence' },
    { id: '10000000-0000-4000-a000-000000000032', text: 'According to our quarterly business review.', tipUK: 'Quarterly with silent r', tipUS: 'Quarterly with both r sounds' },
    { id: '10000000-0000-4000-a000-000000000033', text: 'I would like to highlight two critical trade-offs.', tipUK: 'Critical with sharp plosive t', tipUS: 'Critical with soft flapped t' },
    { id: '10000000-0000-4000-a000-000000000034', text: 'This gives us a clear operational advantage.', tipUK: 'Clear (/klɪə/) without hard r', tipUS: 'Clear (/klɪr/) with rhotic r' },
    { id: '10000000-0000-4000-a000-000000000035', text: 'Before committing to the final implementation roadmap.', tipUK: 'Before without hard r', tipUS: 'Before with rhotic r' },
    { id: '10000000-0000-4000-a000-000000000036', text: 'We validated the acceptance criteria thoroughly.', tipUK: 'Criteria without final r', tipUS: 'Criteria with rhotic r' },
    { id: '10000000-0000-4000-a000-000000000037', text: 'Let us pause for any immediate questions.', tipUK: 'Pause with rounded vowel /pɔːz/', tipUS: 'Pause with open vowel /pɑːz/' },
    { id: '10000000-0000-4000-a000-000000000038', text: 'Moving forward with our recommended approach.', tipUK: 'Forward with non-rhotic r', tipUS: 'Forward with clear rhotic r' },
  ],
  sentence_reading: [
    { id: '10000000-0000-4000-a000-000000000003', text: 'The project team will share a clear update tomorrow morning.', tipUK: 'Clear and morning have non-rhotic r sounds.', tipUS: 'Clear and morning both articulate strong rhotic r.' },
    { id: '10000000-0000-4000-a000-000000000041', text: 'We prioritized these critical user stories to meet the quarterly milestone.', tipUK: 'Notice the sharp t in critical and quarterly.', tipUS: 'Notice the fast flap t in critical and quarterly.' },
    { id: '10000000-0000-4000-a000-000000000042', text: 'Our automated testing pipeline caught the regression before deployment.', tipUK: 'Caught has a deep rounded back vowel.', tipUS: 'Caught has an open unrounded American vowel.' },
    { id: '10000000-0000-4000-a000-000000000043', text: 'I collaborated closely with product managers to refine the business specifications.', tipUK: 'Managers ends in a soft non-rhotic uh sound.', tipUS: 'Managers ends in a distinct rhotic er sound.' },
    { id: '10000000-0000-4000-a000-000000000044', text: 'We analyzed system performance metrics to identify potential throughput bottlenecks.', tipUK: 'Performance has a silent r (/pəˈfɔː.məns/).', tipUS: 'Performance has a strong rhotic r (/pɚˈfɔːr.məns/).' },
    { id: '10000000-0000-4000-a000-000000000045', text: 'The stakeholders appreciated our transparent communication regarding project delivery dates.', tipUK: 'Dates and delivery have crisp, clear consonant attacks.', tipUS: 'Dates and delivery have a relaxed, connected cadence.' },
    { id: '10000000-0000-4000-a000-000000000046', text: 'I conducted user interviews to uncover the root cause behind drop-off rates.', tipUK: 'Interviews has a crisp t sound.', tipUS: 'Interviews often elides the t into an n-sound (innerviews).' },
    { id: '10000000-0000-4000-a000-000000000047', text: 'Our cross-functional agile rituals improved overall sprint predictability and team morale.', tipUK: 'Rituals has an aspirated British t.', tipUS: 'Rituals has an American soft flap.' },
    { id: '10000000-0000-4000-a000-000000000048', text: 'We established clear acceptance criteria before kicking off development on the banking module.', tipUK: 'Banking and criteria flow with even, neutral pitch.', tipUS: 'Banking and criteria use dynamic pitch movement.' },
    { id: '10000000-0000-4000-a000-000000000049', text: 'I regularly prepared detailed business requirement documents for senior leadership review.', tipUK: 'Prepared and documents have elegant non-rhotic phrasing.', tipUS: 'Prepared and documents feature full American r-coloring.' },
    { id: '10000000-0000-4000-a000-000000000050', text: 'By streamlining the onboarding funnel, we reduced friction and accelerated user conversion.', tipUK: 'Conversion (/kənˈvɜː.ʃən/) is non-rhotic.', tipUS: 'Conversion (/kənˈvɝː.ʒən/) is distinctly rhotic.' },
    { id: '10000000-0000-4000-a000-000000000051', text: 'We monitored error logs continuously to verify zero unexpected regressions after release.', tipUK: 'Error (/ˈer.ə/) has no final r sound.', tipUS: 'Error (/ˈer.ɚ/) has strong double r sounds.' },
    { id: '10000000-0000-4000-a000-000000000052', text: 'The engineering team demonstrated rapid adaptability when handling urgent production incidents.', tipUK: 'Rapid and adaptability have precise dental placement.', tipUS: 'Rapid and adaptability have connected American linkage.' },
    { id: '10000000-0000-4000-a000-000000000053', text: 'Effective stakeholder alignment requires active listening and proactive risk mitigation.', tipUK: 'Proactive has a pure British o sound.', tipUS: 'Proactive has an American diphthongal o sound.' },
    { id: '10000000-0000-4000-a000-000000000054', text: 'Our data-driven insights enabled the steering committee to make confident investment decisions.', tipUK: 'Data is pronounced DAY-tuh with a firm t.', tipUS: 'Data is pronounced DAY-duh with an alveolar tap.' },
  ],
  free_response: [
    { id: '10000000-0000-4000-a000-000000000004', text: 'Describe a recent challenge and how you approached it.', tipUK: 'Focus on measured, steady pacing and clean sentence stops.', tipUS: 'Focus on enthusiastic, forward-leaning intonation.' },
    { id: '10000000-0000-4000-a000-000000000061', text: 'Walk me through a project where you had to manage conflicting stakeholder priorities.', tipUK: 'Maintain a clear cadence and avoid rushed syllables.', tipUS: 'Maintain a warm, collaborative rhythm.' },
    { id: '10000000-0000-4000-a000-000000000062', text: 'Explain how you ensure high quality and clarity in your technical documentation.', tipUK: 'Emphasize key verbs with crisp British consonant clarity.', tipUS: 'Emphasize outcomes with natural American phrase stress.' },
    { id: '10000000-0000-4000-a000-000000000063', text: 'Tell me about a time you identified an operational bottleneck and how you resolved it.', tipUK: 'Articulate bottleneck with a true t sound.', tipUS: 'Articulate bottleneck with an easy flap.' },
    { id: '10000000-0000-4000-a000-000000000064', text: 'How do you handle disagreement during sprint planning or requirement sign-off?', tipUK: 'Keep your intonation calm, authoritative, and collected.', tipUS: 'Keep your intonation open, dynamic, and engaging.' },
  ],
} as const;

export function findPromptById(promptId: string): PromptItem | null {
  for (const list of Object.values(PROMPTS_POOL)) {
    const match = list.find(item => item.id === promptId);
    if (match) return match;
  }
  return null;
}
