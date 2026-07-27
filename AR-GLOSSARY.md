# Arabic terminology authority — mkadri85.github.io

Derived from the three already-published Arabic pages. These are counted,
live usages, not preferences. Any translation that contradicts this table is
wrong, even if it is defensible Arabic in isolation.

## Locked terms (use these, never the alternative)

| English | USE | NEVER | why |
|---|---|---|---|
| Mixture of Experts / MoE | خليط الخبراء (MoE) | وزارة التعليم, مزيج الخبراء | Google Translate renders MoE as "Ministry of Education" |
| token | توكن | رمز, وحدة نصية | 21 live uses of توكن, zero of رمز |
| parameters | المعاملات | معلمات, البارامترات | 26 live uses; معلمات appears zero times |
| active (parameters) | نشطة | فعالة | 32 live uses |
| idle / asleep | خامل | نائم | Mohamed corrected نائم -> خامل explicitly |
| fine-grained | دقيق التقسيم | ذات الحبيبات الدقيقة, الدقيق | granularity of splitting, not food texture |
| shared expert | الخبير المشترك | الخبير المتشارك | |
| context (window) | السياق | المحتوى | |
| attention | الانتباه | الاهتمام | |
| model | النموذج | الموديل | |
| weights | الأوزان | الثقل | |
| agent | الوكيل | العميل | العميل means "customer" |
| repository | المستودع | الريبو, المخزن | |
| session | الجلسة | | |
| code / source code | الشيفرة | الكود | |
| branch | الفرع | | |
| pull request | طلب دمج | طلب سحب | |
| commit (noun/verb) | الإيداع / يودع | الالتزام | "الالتزام" is the literal-translation trap |
| his name | محمد قدري | محمد قادري | corrected by hand 2026-07-27 |

## Terms with no precedent yet — first use sets the standard

Pick the engineering sense, not the dictionary sense, and note it here:
embeddings -> التضمينات · hallucination -> الهلوسة · drift -> الانحراف ·
landmine (figurative) -> لغم · stale -> متقادم · scope creep -> تمدد النطاق ·
runbook -> دليل التشغيل · rollback -> التراجع · blast radius -> نطاق الأثر ·
error budget -> ميزانية الأخطاء · burn rate -> معدل الاستهلاك ·
observability -> قابلية الرصد · latency -> زمن الاستجابة ·
throughput -> الإنتاجية · backhaul -> الشبكة الناقلة · link (microwave) -> الوصلة

## Register: plain modern technical Arabic, never literary

Mohamed rejected حبيسة on 2026-07-28 with "this is not correct engineering or
arabic". The failure mode is reaching for classical or literary vocabulary
where an engineer would use a plain word. It is not a terminology error, it is
a register error, and it is easy to make when translating a vivid English
metaphor literally.

BANNED (and the plain replacement):
حبيسة -> عالقة داخل · تبخر -> لم يعد موثقا / ضاع · تحت وطأة -> في لحظة /
تحت ضغط · تتعفن -> تتقادم · جديرة بالثقة -> موثوقة · يتحاشى -> يتجنب ·
مضمار -> مجال · حري بـ -> يجب أن

The test: would this word appear in an Arabic engineering runbook or a vendor
manual? If it only appears in journalism or literature, replace it. When an
English sentence uses a metaphor (evaporated, rot, trapped), do NOT translate
the metaphor - state the technical fact plainly instead.

## Style rules (non-negotiable)

1. **Engineering equivalent, not word-for-word.** Mohamed's exact instruction:
   "adjust the arabic to match engineering equivalent in arabic not a word
   translation." Restructure the sentence if Arabic wants it restructured.
2. Product names, file names, code, CLI commands and units stay in Latin
   script: AGENTS.md, Claude Code, Cursor, MXFP4, KV cache, grep.
3. Every `<pre><code>` block keeps its English content verbatim and gets
   `dir="ltr"` on the `<pre>`.
4. Plain ASCII hyphens, never em-dash or en-dash. Arabic comma ، and Arabic
   question mark ؟ are correct and expected.
5. No employer or customer names. No project-tied identifying numbers.
6. Numbers stay in Western digits (104, 2.8, 1,048,576).
7. Keep every `id="..."` anchor identical to the English page so the table of
   contents and inbound deep links keep working.


## Locked by the 2026-07-28 advisory pass

These came out of three independent audits of the six Arabic pages. Each one
was an actual defect found in published text, not a preference.

| English | USE | NEVER | why |
|---|---|---|---|
| prompt (noun) | التوجيه النصي (Prompt) | الموجه, التوجيه | الموجه is Router; on an ops page "تغيير في الموجه" reads as "a router change" |
| re-prompt | إعادة صياغة التوجيه النصي | إعادة التوجيه | إعادة التوجيه is reroute |
| router (MoE) | الموجه (Router) | | |
| reroute / routing | إعادة التوجيه / التوجيه | | network sense only |
| gated (MLA, actions) | ذات بوابات / مقيد ببوابة | مبوب | بوّب = to arrange into chapters |
| circuit breaker | قاطع الدارة | قاطع الحماية, الدائرة | قاطع حماية is the electrical-panel MCB |
| kill switch | مفتاح الإيقاف | مفتاح الإطفاء | |
| agentic (adj) | الوكيلي / الوكيلة | الذكاء الاصطناعي الوكيل | الوكيل is a noun; the phrase reads "the AI, the agent" |
| microwave (adj) | ميكروويف / الميكروويفية | ميكروي | ميكروي appears in no vendor manual |
| console / dashboard | لوحة التحكم | الكونسول | |
| eval(s) | الاختبارات التقييمية (Evals) | تقييمات | تقييمات reads as generic assessments |
| detect (loop stage) | الاكتشاف | | keep الرصد for monitoring, قابلية الرصد for observability |
| compiler | المترجم (compiler) | المصرف | المصرف is a bank - this shipped once |
| sympathetic (alerts) | مترابطة / تابعة لها | متعاطفة | متعاطف is emotional sympathy |
| Git, Docker, npm, MCP | stay Latin | جيت | rule 2 covers tool names, not only file names |

Additional banned-register words found in the same pass:
نسيج ندبة, صراخا, يقتفي, اصطف خلف, مواربة, تنمذج, تتسمم, احتضر, الخطايا,
استحضار, يسافر (for data), بقسوة (for pruning), قطيع هادر, سباكة, رسوب.

**The dominant failure mode is metaphor.** English technical writing is dense
with it (scar tissue, loudest, thundering herd, plumbing, hang off, slow boil,
poisoned, dying, coming back green, bad minute). Translating the metaphor
instead of the fact produced roughly 30 of the 58 findings in one audit. State
the technical fact plainly and drop the figure of speech.
