# Ascenda · Sunday demo guide
**For Greg, demoing to Sarah on 18 May 2026**

---

## Before the call (Saturday, 10 min)

| | |
|---|---|
| **URL** | https://ascenda-ashy.vercel.app |
| **Login** | `greg@workiflow.com` / `AscendaDemo!2026` |
| **Browser** | Chrome, clean profile (no extensions), full screen, 100% zoom |
| **Backup** | A second tab pre-logged-in. If the first session drops, switch tabs and keep talking. |

**Pre-flight (run once Saturday morning):**

1. Open the URL → sign in → land on `/dashboard`
2. Check the **navbar has a violet "Faculty view" pill** (top-right, next to the bell). If missing, hard refresh once.
3. Navigate to **Explore** and let the matches load fully. **Open only this one tab** — opening additional tabs can trigger cache recalculation and slow the page.
4. Navigate to **Toolbox** → **Essay Workshop**. Clear the textarea. Type a short demo sentence like "I love science" and click **Get Feedback** to confirm it returns results. This is your live demo moment.
5. **Reset demo state** so the bell starts empty. Paste this in the [Supabase SQL editor](https://supabase.com/dashboard/project/alpkbobbasxvubogkark/sql/new):
   ```sql
   delete from help_messages where request_id in (select id from help_requests where student_profile_id = '54d0803b-1c6d-4203-9e02-135f5746e6fa');
   delete from help_notes where request_id in (select id from help_requests where student_profile_id = '54d0803b-1c6d-4203-9e02-135f5746e6fa');
   delete from help_meetings where request_id in (select id from help_requests where student_profile_id = '54d0803b-1c6d-4203-9e02-135f5746e6fa');
   delete from help_requests where student_profile_id = '54d0803b-1c6d-4203-9e02-135f5746e6fa';
   delete from notifications where profile_id = '54d0803b-1c6d-4203-9e02-135f5746e6fa';
   ```
6. Run the full demo flow yourself end-to-end with a timer (target: 18 min).
7. **Reset state again** after your dry run so Sunday starts fresh.

---

## On the call

**Total time: 30 min · Demo: ~18 min · Q&A: ~12 min**

You'll mostly stay on the desktop, sharing your full browser window. Don't switch tabs mid-demo. Speak in complete sentences and let each beat land before moving on — silence is part of the pitch.

---

### Beat 1 · Open · 2 min
**Where:** `/dashboard` (or wherever you land after login).

**Say:**
> "Thanks for making time again, Sarah. When we spoke previously, you talked about how challenging parts of the application cycle can be — chasing documents, sorting shortlists late in the day, keeping visibility on which students need your attention most. We've taken what you shared, alongside what other counsellors and students have told us, and built a platform around exactly those moments."
>
> "Two sides — a student platform, and a counsellor platform. I'll show the student side briefly because everything on your side is downstream of what students do. Most of our time will be on your side. About fifteen minutes of run-through, then we open it up to your feedback. Jump in any time, but I'll keep moving so we leave plenty of room for the conversation."

**Click:** Nothing yet.

---

### Beat 2 · Student platform · 6 min

#### 2a · Profile (45 sec)

**Click:** Top nav → **Profile**.

**Show:** Profile sections + the **Pathway status pill** under "Pathway status" (says "Pathways open").

**Say:**
> "The platform is built to do all the heavy lifting for students. Right now, they're Googling, tab-switching, ChatGPTing. What we've done is put everything in one place. It starts with a profile — predicted grades, subjects, what they want to study later, what matters to them. All of this is already filled out for this demo profile, and it's geared towards someone who wants to do Computer Science. Once they fill it out, our algorithm assigns them a compatibility score for every relevant programme."

#### 2b · Matches + course detail (2 min)

**Click:** Top nav → **Explore**.

**Show:** Match cards with fit scores and Reach / Match / Safe badges. Reach programmes appear at the top.

**Say:**
> "And this is what they see. Programmes automatically categorised as Reach, Match, or Safe — I know it's a framework you're already using with them. The score is decomposable, they can see exactly why a course ranked where it did."

**Click:** **University of Cambridge · Computer Science** card (in the Reach section at the top). If you can't find it, type "Cambridge Computer Science" into the search bar. Imperial Computing and UCL Computer Science are equally good fallbacks.

**Show:** The consolidated course page. **Scroll down** to the campus and city life section — show:
- Percentage of international students
- Climate / city info
- Employment stats and graduate salary

**Say:**
> "When they click into a course, one consolidated page replaces thirty browser tabs across thin, inconsistent university websites. The thing we're particularly proud of — and this is something other tools don't do — is this section here. A lot of our students are based in India, Southeast Asia, Nigeria, and they have no idea what life is actually like in the UK. They can see the percentage of international students, what the city is like, cost of living, career prospects — everything they need to make a confident decision in one place."

#### 2c · Toolbox — essay workshop live (2.5 min)

**Click:** Top nav → **Toolbox**.

**Show:** The four tools — Requirements Checker, Chances Calculator, Essay Workshop, Deadline Timeline.

**Say:**
> "Before they get to applications, they need the tools to actually do the work. Requirement checker, chances calculator, deadline timeline — all here. But the one I want to show you live is this."

**Click:** **Essay Workshop**.

**Show:** The tool is open. Clear the textarea if anything is pre-filled.

**Say:**
> "We think of a personal statement as building blocks of a student's life — different pieces assembled together. What's hard is that different application portals have completely different requirements. UCAS is 4,000 characters; other portals have their own limits. Students don't know what 'good' looks like. So we built two things: one, an outline suggester that helps them build the essay piece by piece based on their profile; and two, a reviewer that benchmarks their draft against the strongest essays from Oxford, Cambridge, and Harvard."

**Type a short sentence into the essay textarea** — e.g. `Science has always been my way of making sense of the world.`

**Click:** **Get Feedback**.

**Show:** The feedback appears — structured critique, what to keep, what to improve.

**Say:**
> "Immediate, structured feedback. Not writing it for them — guiding them to write something great. And they can pick their portal here — UCAS, Common App, or custom — so the guidance is always calibrated to the right limit."

#### 2d · Application tracker (1 min) — *the pivot is coming*

**Click:** Top nav → **Applications**.

**Show:**
- The PageHero summary at the top — "X days until your next deadline"
- **What's next** — the top 3 most urgent tasks across all applications, each tied to a specific university
- **All applications** — clean list of all 6 applications, in-progress first, submitted at the bottom

**Say:**
> "And this is the central hub. One place to manage all applications. The page leads with the three most urgent things across every application — they always know what to do today. Below that, the full list, with status, tier, and progress per application. For each one, they've got a task list so nothing falls through the cracks."

---

### Beat 3 · The segue · 1 min — *the pivot moment*

**This is the demo's hinge. Practice this click until it feels automatic.**

**Say:**
> "Now — the platform also has an AI assistant they can chat with. If they're confused about requirements, unsure what to do next, they can ask right here. But sometimes the AI isn't enough and they want a human. That's where this comes in."

**Click:** The violet **Need help** button next to the **Cambridge** entry in the "What's next" list (it'll be the top item — earliest deadline).

**Show:** The modal opens. Subject is pre-filled ("Help with my University of Cambridge application"). Body references the open tasks and deadline. "AI draft · edit before sending" label visible top-right of the textarea.

**Say:**
> "The platform knows what they're working on, what stage they're at, and pre-fills a structured request. AI-drafted — the student edits before sending. Rather than a blank email, Sarah gets context."

**Click:** **Send to counsellor**.

**Show:** Toast: "Sent — Sarah will respond shortly". Modal closes.

**Say:**
> "Let me flip over to your side and show you what just happened."

**Click:** Navbar → **Faculty view** pill (top-right, violet).

---

### Beat 4 · Visibility unlock · 2.5 min

**Where:** You're now on `/counsellor`. Pause for half a second so Sarah can take it in.

**Show first (without clicking):**
- The bell icon in the navbar has a **red `1`** badge
- The **Help requests** widget on the page, with Greg's request at the top

**Say:**
> "This is your homepage. You see all your students in this cycle. The notification you just saw lives up here — anything urgent surfaces without you needing to dig for it."

**Click:** the **bell icon** in the navbar.

**Show:** Dropdown — Greg's help request as the top unread item.

**Click:** the row.

**Show:** The **side drawer slides in from the right**. Three tabs at top — Thread / Notes / Meeting. Greg's original AI-drafted message is the first item in the thread. There's a reply composer at the bottom.

**Say:**
> "This is your inbox view of the same request. Three things you can do here without leaving the page — reply, leave a private note for yourself, or propose a meeting."

**Click:** **Notes** tab.

**Type (in the note textarea):**
> *Strong on the quant side, weak on the 'why this university' question. Send the Cambridge sample for reference.*

**Click:** **Save note**.

**Say (while typing the note):**
> "These notes are private — only counsellors see them. Whatever you discuss, decisions you make, things to come back to — it all lives here. Survives counsellor turnover. No more scattered spreadsheets."

**Click:** **Meeting** tab.

**Show:** Form pre-filled with "15-min check-in", a Tuesday 3pm slot next week, Google Meet placeholder.

**Click:** **Propose**.

**Show:** Meeting appears in the list below with "proposed" status.

**Click:** **Thread** tab.

**Type (in the reply composer):**
> *Hi Greg — happy to help. Just scheduled a 15-min slot for Tuesday 3pm and dropped some notes. Let's start with your opening paragraph.*

**Click:** **Send**.

**Show:** Reply appears in the thread above the composer.

**Click:** the **X** at the top-right to close the drawer.

**Say (slow it down, then pause on the at-risk panel):**
> "And this is the bit I want to spend a moment on — students needing attention. You mentioned this specifically when we spoke. The pattern is consistent: meetings stack up, the loudest students absorb the most time, and the students who genuinely need help often aren't the ones asking. They go invisible until it's too late. This view surfaces them automatically — approaching deadlines with incomplete work, profiles half-finished, applications stalled."
>
> "How we frame this internally: it's not about replacing your judgement. It's about making sure your judgement gets applied to the right students at the right time, instead of being absorbed by whoever happens to book the most time with you."

---

### Beat 5 · Time saved unlock · 2 min — *documents*

**Click:** Counsellor sub-nav → **Documents**.

**Show:** Grouped list of documents per student. Status filter pills (All / Overdue / Pending / Received).

**Say:**
> "The bit I think will resonate most based on what you shared — document chasing. Transcripts, references, personal statements. You described this as one of the most repetitive and taxing parts of the cycle. Twenty separate email threads, a spreadsheet to track what's outstanding, chasing students who haven't replied to chase teachers who haven't replied. All of it concentrated in the weeks before deadlines."

**Click:** **Overdue** filter pill at the top.

**Show:** Overdue documents float to the top. Each has a "Chase" strip with three pills: Nudge student / Nudge teacher / Nudge registrar.

**Click:** On Mohammed Al-Rashid's overdue **A-Level Transcript** → click **Nudge teacher** pill.

**Show:** Toast appears. The row's status pill flips to "Nudge sent · Xs ago".

**Say:**
> "Per student, per application, we track what's needed. You nudge the right person — student, teacher, registrar — through the platform, not through twenty separate emails. Everything's logged, so you can see at a glance what's blocked, instead of holding it all in your head."

---

### Beat 6 · 1:1 leverage unlock · 3 min — *the headline*

**Slow down here. This is the moment that should land hardest.**

**Click:** Counsellor sub-nav → **Students** → click **Aarav Sharma** (top of the list).

**Show — header card (without scrolling):**
- Aarav's name, school, programme line, predicted grades
- The 2×2 stats grid: Profile completion %, Matches count, Applications count, Next deadline
- The completion progress bar

**Say:**
> "One thing came up across nearly every counsellor we've spoken to — 1:1 time is the most valuable thing you give a student, and the hardest thing to protect. Meetings stack up, prep time disappears, and you walk in cold. Worse — when a student moves between counsellors, or you're covering for a colleague, the context of what's been discussed and why their shortlist looks the way it does is mostly lost. The institutional memory lives in your head, or in scattered notes, or it's gone."
>
> "This is what walking into a 1:1 looks like with Ascenda. One student's profile, everything on one screen. Top: who they are, where they're applying, current stage, next deadline. In thirty seconds you're fully briefed for a meeting you didn't have time to prep for."

**Click:** **Notes** tab on the student detail page.

**Show:** Notes panel with seed entries — session notes, flags, updates, all timestamped, sorted newest first.

**Say:**
> "This is your notes section. Free-text, attached to the student. Whatever you discuss, decisions you make, things to come back to — it lives here. It survives counsellor turnover. If a student transitions to a different counsellor, or you're covering for a colleague, the institutional memory comes with them."

**Click:** **Timeline** tab.

**Show:** The profile evolution timeline — icon-coded entries spanning ~300 days. Predicted grade shifts, subject interest changes, counsellor sessions, application milestones, all on a vertical spine.

**Say (this is the line that matters most — slow):**
> "And this — this is the part I'd ask you to look at carefully. This is the longitudinal view of the student. Predicted grade shifts, when they added or dropped subjects of interest, how their shortlist evolved over time. Students told us their list goes through several rounds of redoing — open days, peer conversations, life events shift things — and counsellors told us they often see only the snapshot. So when you sit down with them and ask why their shortlist looks the way it does, you don't have to start from scratch. You can see the journey."
>
> "I genuinely think this is the thing other tools don't have. UCAS, school management systems, even Cialfo — they're snapshot tools. This is the only place you see *why* a student's choices look the way they do, not just what's currently on the list."

---

### Beat 7 · Reporting up · 1.5 min

**Click:** Counsellor sub-nav → **Analytics**.

**Show:** Analytics widget grid — applications by stage, field of study distribution, at-risk count.

**Say:**
> "Last bit on the counsellor side. Schools do yearly reports. Leadership asks how this year compares to last, parents at open evening want to know where students ended up. Right now the answer lives in memory or a spreadsheet someone built manually. This changes that."
>
> "Everything's in one place. Completely customisable — you take away the widgets you don't need, keep the ones you do. And because it's tracking applications live, year-on-year comparisons are automatic. You can also see here — if a lot of your students are applying to the same field or same country, you can run a targeted workshop. The data isn't just pretty, it tells you where to intervene."

**Click:** the **Download Report** button in the page header.

**Show:** Browser print preview opens.

**Click:** **Cancel** in the print dialog. Don't actually print.

---

### Beat 8 · Integrations teaser · 30 sec

**No clicking. Voiceover only.**

**Say:**
> "Last thing on the platform — we're building this to sit alongside the tools you already use. Gmail, calendar, document storage. When a student books a meeting with you here, it flows into your calendar. When you message a parent, it goes from your inbox. You don't have to leave the platform, but the platform doesn't try to replace everything either."

---

### Beat 9 · Close · 1.5 min

**Say:**
> "That's the demo. We're at a stage where we're really trying to understand whether what we've built actually fits how you work, so the most valuable thing now is your honest reaction. So — over to you. What's resonating, what's not, and what's missing?"

**Stop talking. Let her go first.**

---

## If something breaks

| If… | Then… |
|---|---|
| **Faculty view pill** isn't in the navbar | Refresh the page once. Cache primes on first auth call. |
| **Matches page loads slowly** | Let it fully load before scrolling. Do NOT open additional tabs — each tab recalculates the cache. Reach programmes appear at the top of the list. |
| **Send to counsellor** does nothing | Open browser console (Cmd-Opt-I). If "row level security" errors, fall back to talking through the screenshots in the deck. |
| **Bell stays at zero** after Send | Wait 5 seconds. Realtime fires within 1s but if it misses, the 4-second poll catches it. |
| **Cambridge CS course page** loads blank or 404s | Fall back to **Imperial Computing** (`/course/cd952b76-9127-5d28-903c-8e1f4c89fd4f`) or **UCL Computer Science** (`/course/fcb852c2-f36e-5deb-973b-71110547d515`). |
| **Essay workshop** returns nothing | Type a slightly longer sentence and retry. If still broken, say "this generates in real time — let me move on and we can come back to it." |
| **Drawer feels laggy** when typing in reply box | Close and re-open the drawer — debounces the subscription. |
| **Production URL totally down** | Switch to the second pre-logged-in browser tab. If that's also down, share screenshots from the deck and continue talking. |
| **Sarah asks about Gmail/Calendar integration depth** | "Real OAuth integration is on the roadmap. What you saw on screen today is the connection point — when those go live, this drawer schedules into your real calendar." Don't promise dates. |
| **Sarah asks "is this really AI?"** for the request draft | "It's a templated draft today that fills in from the student's context. The full LLM version is in flight — same input, richer language." |
| **Sarah asks how application status gets updated** | "Students update it themselves — we're also exploring an email-sync approach where connecting the student's application email would let us auto-detect updates from universities. But for the MVP, the student logs it." |

---

## What's intentionally absent or different from Raf's plan

We made these calls during build. You'll know to deliver them in voiceover:

| Raf's plan said | What we shipped | Talk-track if asked |
|---|---|---|
| Gmail/Calendar/Outlook integration tiles | Removed entirely | Beat 8 covers this in voiceover. Tiles would have shown fake email addresses — misleading. |
| Per-application detail page | Help button on every priority-board card on `/applications` instead | Cleaner — keeps the user on the priorities view. |
| "Nudge teacher" really emails the teacher | Writes a real notification to the student instead | "The nudge is logged through the platform — when we wire SMTP, the same click sends the email." |
| The student practice board | Removed entirely (route and component deleted) | Not part of the demo narrative. |

---

## One thing to know about timing

Beats 4, 5, and 6 are the meat. **If you're running over, cut Beat 7 first** (analytics) — Sarah will ask about reporting in Q&A anyway, and you can answer it then. **Don't cut Beat 6** (notes + timeline) — that's the differentiator the whole demo builds toward.

Essay workshop (Beat 2c) is worth the extra 90 seconds — it's the most visceral live moment on the student side and Ruben is right that it lands hard. Don't skip it.
