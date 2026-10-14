// "The science behind your AI workouts": a plain-language page of the rules the AI follows and where they come from.
// Keep in sync with EVIDENCE.md and guide() in ai.js. Static text only, nothing here comes from the user or the AI.
import { $, sheet } from './ui.js';

// Source numbers here are the app's own 1..N. Mapping from EVIDENCE.md numbers:
// 1=1, 2=3, 3=4, 4=5, 5=7, 6=8, 7=10, 8=11, 9=12, 10=13, 11=15, 12=16, 13=17, 14=18, 15=19, 16=20, 17=21, 18=Keytel, 19=Compendium.
const SOURCES = [
  ['Currier BS et al. ACSM position stand: resistance training prescription for muscle function, hypertrophy, and physical performance in healthy adults. Med Sci Sports Exerc 2026;58(4):851-872.', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823'],
  ['Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass. J Sports Sci 2017.', 'https://pubmed.ncbi.nlm.nih.gov/27433992/'],
  ['Pelland JC, Remmert JF, Robinson ZP et al. The resistance training dose-response: meta-regressions exploring the effects of weekly volume and frequency on muscle hypertrophy and strength gain. Sports Med 2026.', 'https://pubmed.ncbi.nlm.nih.gov/41343037/'],
  ['Singer A et al. Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy. Front Sports Act Living 2024.', 'https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full'],
  ['Schoenfeld BJ, Grgic J, Krieger J. How many times per week should a muscle be trained to maximize muscle hypertrophy? J Sports Sci 2019.', 'https://pubmed.ncbi.nlm.nih.gov/30558493/'],
  ['Grgic J, Schoenfeld BJ, Skrepnik M et al. Effects of rest interval duration in resistance training on measures of muscular strength: a systematic review. Sports Med 2018.', 'https://pubmed.ncbi.nlm.nih.gov/28933024/'],
  ['Robbins DW et al. Agonist-antagonist paired set resistance training: a brief review. J Strength Cond Res 2010.'],
  ['Refalo MC et al. Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy. Sports Med 2023;53:649-665.', 'https://pubmed.ncbi.nlm.nih.gov/36334240/'],
  ['Robinson ZP et al. Exploring the dose-response relationship between estimated resistance training proximity to failure, strength gain, and muscle hypertrophy. Sports Med 2024;54:2209-2231.'],
  ['Nunes JP, Grgic J, Cunha PM et al. What influence does resistance exercise order have on muscular strength gains and muscle hypertrophy? A systematic review and meta-analysis. Eur J Sport Sci 2021.', 'https://pubmed.ncbi.nlm.nih.gov/32077380/'],
  ['Wolf M et al. Partial vs full range of motion resistance training: a systematic review and meta-analysis. Int J Strength Cond 2023.'],
  ['Kassiano W et al. Which ROMs lead to Rome? A systematic review of the effects of range of motion on muscle hypertrophy. J Strength Cond Res 2023.', 'https://pubmed.ncbi.nlm.nih.gov/36662126/'],
  ['Systematic review of exercise variation in resistance training. J Strength Cond Res 2022.'],
  ['Bell L et al. Integrating deloading into strength and physique sports training programmes: an international Delphi consensus. Sports Med Open 2023;9:87.', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/'],
  ['Coleman M et al. Gaining more from doing less? The effects of a one-week deload period during supervised resistance training on muscular adaptations. PeerJ 2024;12:e16777.', 'https://pubmed.ncbi.nlm.nih.gov/38274324/'],
  ['Meta-analysis of 25 randomized trials on resistance exercise during dietary weight loss and lean mass.'],
  ['Bull FC et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. Br J Sports Med 2020;54:1451-1462.', 'https://pubmed.ncbi.nlm.nih.gov/33239350/'],
  ['Keytel LR et al. Prediction of energy expenditure from heart rate monitoring during submaximal exercise. J Sports Sci 2005;23(3):289-297.', 'https://pubmed.ncbi.nlm.nih.gov/15966347/'],
  ['Compendium of Physical Activities (MET values for common activities).', 'https://pacompendium.com/'],
];

const STRONG = ['ev-strong', 'Strong evidence'], MOD = ['ev-mod', 'Moderate evidence'], EXPERT = ['ev-expert', 'Expert consensus'], EST = ['ev-est', 'Estimate'];
const RULES = [
  ['How many sets per muscle', 'Most muscles get about 10 to 16 hard sets a week (6 to 10 if you are new). Muscles that only help a lift count half.', 'More weekly sets build more muscle, with smaller gains the higher you go. The exact best number is still debated.', STRONG, [1, 2, 3]],
  ['Each muscle about twice a week', 'Plans hit each muscle around twice a week, spread over the days you have.', 'Once total sets match, how often you train a muscle matters little. Twice a week is mostly a handy way to spread the work out.', MOD, [1, 5]],
  ['Rest between sets', 'Heavy main lifts get 2 to 3 minutes, other big lifts 90 to 120 seconds, smaller exercises 60 to 90 seconds. The Pace option shortens rests and pairs opposite muscles as supersets.', 'Longer rests help strength a little. For muscle size, resting beyond about a minute or two adds little, so shorter rests are fine if you are short on time.', MOD, [4, 6, 7]],
  ['Stop short of failure', 'Most sets stop with 1 to 3 reps left in the tank. Heavy barbell lifts never go to failure.', 'Training close to failure builds muscle, and going all the way brings extra tiredness and risk for little extra gain. The ideal number is not exact.', MOD, [1, 8, 9]],
  ['Exercise order', 'The heaviest big lift comes first, then other big lifts, then smaller exercises.', 'You lift more on the lifts you do while fresh, which helps strength. Order makes little difference to muscle size.', MOD, [10]],
  ['Full range of motion', 'The AI favours exercises that work the muscle through its full range, including stretched positions.', 'Full range looks as good or better than partial reps for muscle growth, and stretched positions look promising. This is still being studied.', MOD, [1, 11, 12]],
  ['Main lifts stay, extras rotate', 'Your main lifts stay the same all month. Smaller exercises change every week or two.', 'Repeating key lifts lets you track progress; a little variety keeps training fresh. This is mostly common practice, with little direct research.', EXPERT, [13]],
  ['A lighter week 4', 'Week 4 has about half the sets, weights about 10% lighter, and at least 3 reps left in the tank.', 'Coaches and researchers agree a lighter week helps you recover. Studies are small, so treat it as sensible advice, not a law.', EXPERT, [14, 15]],
  ['Losing fat', 'If your goal is fat loss, the AI keeps lifting in the plan with moderate volume.', 'Lifting while you cut back on food helps you keep muscle, and public health guidelines recommend strength work for adults.', MOD, [16, 17]],
  ['Going up in weight (the app, not the AI)', 'The app suggests more weight once you hit the top of your rep range on every set.', 'This simple method, called double progression, is standard practice and fits ACSM guidance. It is a rule of thumb, not a tested formula.', EXPERT, [1]],
  ['Calorie estimates (the app, not the AI)', 'Calories are worked out from your workout time, or from heart rate when a watch provides it.', 'These use published formulas and standard activity values (a typical lifting session counts as about 5 METs). Real burn varies from person to person, so treat the number as approximate.', EST, [18, 19]],
];

const srcLinks = ns => `Source${ns.length > 1 ? 's' : ''} ${ns.map(n => `<a href="#src${n}" data-src="${n}">${n}</a>`).join(', ')}`;
const link = (t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;

export function openScience(onBack) {
  const body = sheet(`<h2 id="sheetTitle">The science behind your AI workouts</h2>
    <p>The AI does not make plans up as it goes. It follows a fixed set of rules taken from the American College of Sports Medicine's 2026 position stand on resistance training and from recent research reviews (studies that combine the results of many other studies). It can only pick exercises from this app's library.</p>
    <p class="muted">This is general fitness guidance, not medical advice. If you have pain or a health condition, check with a doctor or physiotherapist first.</p>
    <h3 class="label">The rules it follows</h3>
    <ul class="group rules">${RULES.map(([title, what, why, [cls, label], ns]) => `<li>
      <div class="rule-head"><strong>${title}</strong><span class="ev ${cls}">${label}</span></div>
      <p>${what}</p><p class="muted">${why}</p><small class="muted">${srcLinks(ns)}</small></li>`).join('')}</ul>
    <h3 class="label">Sources</h3>
    <ol class="group sources">${SOURCES.map(([cite, url], i) => `<li id="src${i + 1}">${cite}${url ? ` ${link('Read it', url)}` : ''}</li>`).join('')}</ol>
    <p class="muted">Last reviewed October 2026. The AI can still make mistakes, so the app checks every plan: it only allows library exercises, caps the number of sets and snaps rest times to sensible values. You can always edit a plan.</p>
    ${onBack ? '<button class="pill wide" data-back>Back to your plan</button>' : ''}`);
  body.onclick = ev => {
    if (ev.target.closest('[data-back]')) return onBack();
    const a = ev.target.closest('a[data-src]');
    if (a) { ev.preventDefault(); return $(`#src${a.dataset.src}`, body).scrollIntoView({ block: 'center' }); }
    const ext = ev.target.closest('a[target=_blank]');
    // Same approach as the update banner: the Android WebView hands a non-app address to the system browser.
    if (ext && window.Capacitor?.isNativePlatform?.()) { ev.preventDefault(); location.href = ext.href; }
  };
}
