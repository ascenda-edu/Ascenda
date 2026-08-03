# Ascenda · Counsellor demo · Sunday 18 May 2026

This is the playbook for the Sunday call with Sarah. It maps every beat in Raf's [Rough Demo Plan](https://github.com/ascenda-edu/Ascenda/blob/main/docs/rough-demo-plan.docx) to the specific UI affordances we've built, and notes what to *click* live on the preview URL.

**Preview URL (branch `feat/applications-work`):** https://ascenda-git-feat-applications-work-cxz5mw6fk2-6983s-projects.vercel.app

**Demo login:**
- Email: `greg@workiflow.com`
- Password: `«DEMO_USER_PASSWORD»`

The single Supabase auth user behind the demo is also the counsellor on the other side — the **Faculty view** switcher in the navbar flips between the two sides. Everything that writes to the database (help requests, replies, notes, meetings, nudges, notifications) persists for real.

---

## Pre-demo checklist (Saturday)

- [ ] Log in as `greg@workiflow.com` on the preview URL in a clean Chrome profile, leave the tab open
- [ ] **Reset demo state:** delete any existing help_requests and notifications for the demo user so we start the demo with an empty bell + empty inbox. Run from a shell:
  ```bash
  npx ts-node scripts/reset-demo-state.ts
  ```
  *(written if needed — for now do this manually in the Supabase SQL editor: `delete from notifications where profile_id = '54d0803b-1c6d-4203-9e02-135f5746e6fa'; delete from help_requests where student_profile_id = '54d0803b-1c6d-4203-9e02-135f5746e6fa';`)*
- [ ] Confirm /dashboard, /applications, /counsellor, /profile all render without errors
- [ ] Run through the entire flow twice end-to-end with the timer on
- [ ] Verify the Vercel preview URL is openable in an Incognito window (no SSO blocking)

---

## Beat-by-beat flow with click anchors

### Beat 1 — Open · 2 min

**You say:**
> "Thanks for making time again. When we spoke previously, you talked about how challenging parts of the application cycle can be — chasing documents, sorting shortlists late in the day, keeping visibility on which students need your attention most. We've taken what you shared, alongside what other counsellors and students have told us, and built a platform around exactly those moments."

> "Two sides: a student platform and a counsellor platform. Most of our time will be on your side. I'll run through about fifteen minutes, then we'll open it up for your feedback. If something prompts a question along the way, please jump in."

**You click:** Nothing. You're on `/dashboard` already.

---

### Beat 2 — Student platform · 5 min

This is the "everything counsellor-side is downstream of this" framing.

#### 2a — Profile · 45s

**Click:** Top nav → **Profile** (or just navigate to `/profile`).

**Show:**
- The 5 profile sections (Personal info, Academics, Subjects, Lifestyle, Tests) with the completion ring at the top.
- The **Pathway status pill** anchored below the Score row (should say "Pathways open" for Greg).

**You say:**
> "When a student signs up, they build a profile. Predicted grades, subjects, preferences. We capture this upfront because UCAS data suggests one in five students unintentionally block themselves from degree options through subject choices earlier in school. This pill is the system telling Greg his pathways are still open — if he were to drop further maths, this would flip to a warning, *before* the exam window closes."

**Don't:** Click into edit screens. We're not demoing the wizard.

#### 2b — Matches + course detail · 1.5 min

**Click:** Top nav → **Explore** (or `/matches`).

**Show:**
- The match cards with fit scores + Reach/Match/Safe badges.

**You say:**
> "This is what they see once their profile is set. The headline here is the compatibility score for each course. We score profile vs entry requirements vs university characteristics. The score is decomposable — they can see why a course scored what it did. As they explore, the system auto-categorises shortlisted courses as Reach, Match, or Safe."

**Click:** Any course card — ideally **Lancaster Mathematics with Economics** if it's near the top. URL pattern: `/course/25d8297e-6423-5d81-af25-c4db1039bc72`. If it's not in the visible matches, just type into the search bar instead.

**Show:** the consolidated course page — modules, entry requirements, graduate employment, starting salary, cost of living, teaching style.

**You say:**
> "This replaces thirty browser tabs. A lot of students miss a lot of context because information is fragmented across thin university websites. Hard to be confident in research without putting in extensive effort."

#### 2c — Application tracker · 2 min

**Click:** Top nav → **Applications** (`/applications`).

**Show:**
- The PageHero summary (X applications · Y submitted · Z nudges).
- The **Application priorities** board — 6 cards: Lancaster (in_progress), LSE (in_progress), Imperial (planning), Warwick (in_progress), Edinburgh (submitted), Bristol (submitted).
- The "Today's focus" section with requirement tracker.

**You say:**
> "Per university, students see what's needed, what's done, what's outstanding. Tests, transcripts, references, personal statement, deadlines. The priority board ranks by fit score, scholarship weight, and deadline intensity."

#### 2d — Recommendation letter chase · 30s (optional, only if time)

**Click:** Sub-nav under Applications → **Documents** → scroll to **Recommendation letters**.

**Show:** A card with status `requested` or `writing`. Hover over the **Ask Sarah to chase {teacher}** pill.

**Hold:** Don't click it yet — this is the segue into Beat 3.

---

### Beat 3 — The segue · 1 min — *the natural pivot*

This is the moment that earns the rest of the demo.

**You say:**
> "Now here's something I want to show you live. Imagine a student is stuck — they need help on their application. Rather than emailing you or trying to book a meeting blindly, they click this."

**Click:** Back to `/applications`. Find the Lancaster card on the priority board. Click the small violet **Need help** pill at the bottom-right of the card.

**Show:** The Help-request modal opens. Pre-filled subject ("Help with my Lancaster University application"), pre-filled body referencing fit score + open tasks + deadline. "AI draft — edit before sending" label visible.

**You say:**
> "The platform knows what they're working on, what stage they're at, and pre-fills a structured request."

**Click:** **Send to counsellor**.

**Show:** Toast: "Sent — Sarah will respond shortly." Modal closes.

**You say:**
> "Let me flip over to your side and show you what just happened."

**Click:** Navbar → **Faculty view** pill (top right, violet).

---

### Beat 4 — Visibility unlock · 2.5 min

**You're on:** `/counsellor`.

**Show first:**
- Navbar bell now has a **red `1`** (the new help_request notification).
- At-risk students panel.
- **Help requests widget** (live · from your students), showing Greg Franck's request at the top with a violet sparkle icon.

**You say:**
> "There's the notification. You instantly see which student, what they need help with, and where they are in the process, without having to ask."

**Click:** the **bell** in the navbar. Dropdown opens, showing Greg's request as the top unread item.

**Click:** the row.

**Show:** The **Help thread drawer** slides in from the right. Three tabs:
- **Thread** — the original AI-drafted message, with a reply composer at the bottom.
- **Notes** — counsellor-only private notes panel.
- **Meeting** — propose a date/time/title.

**You say:**
> "This is your inbox view of the same request. Three things you can do here: reply, leave a private note for yourself, or propose a meeting."

**Click:** the **Notes** tab. Type a quick note like: *"Strong on quant side, weak on the 'why this university' question. Send the Cambridge sample for reference."* Click **Save note**.

**Click:** the **Meeting** tab. The form is pre-filled with "15-min check-in", a sensible Tuesday 3pm slot, and "Google Meet · auto link". Click **Propose**.

**Click:** Back to **Thread**. Type *"Hi Greg — happy to help. I've scheduled a 15-min slot Tue 3pm and dropped some notes. Let's start with your opening paragraph."* Click **Send**.

**Show:** The reply appears in the thread.

**Click:** **Mark resolved** at the bottom (or leave open — depends on time).

**Close the drawer.**

**Show:** Pause for a second on the at-risk alerts panel.

**You say:**
> "And this is the bit I want to spend a moment on — students needing attention. You mentioned this when we spoke. The pattern is consistent: meetings stack up, the loudest students absorb the most time, and the students who genuinely need help often aren't asking. This view surfaces them automatically — approaching deadlines with incomplete work, profiles half-finished, applications stalled. It's not about replacing your judgement. It's about making sure your judgement gets applied to the right students at the right time, instead of being absorbed by whoever happens to book the most time with you."

---

### Beat 5 — Time saved unlock · 2 min — *documents*

**Click:** Sub-nav → **Documents** (or `/counsellor/documents`).

**Show:**
- Status filter pills (Overdue / Pending / Received).
- A grouped list of documents per student.
- Each non-received row exposes a **Chase** strip with three pills: **Nudge student**, **Nudge teacher**, **Nudge registrar**.

**You say:**
> "The bit I think will resonate most based on what you shared — document chasing. Twenty separate email threads, a spreadsheet to track what's outstanding. Per student, per application, we track what's needed. You can nudge the right person — student, teacher, registrar — to submit what's missing. The chase happens through the platform, not through twenty separate emails."

**Click:** Pick an Overdue document (Mohammed's A-Level Transcript is overdue in the dummy data). Click **Nudge teacher**.

**Show:** Toast: "Nudge logged · the recommender". The status pill flips to "Nudge sent · Xs ago".

**You say:**
> "Logged in one place. You can see at a glance which students are blocking on what."

---

### Beat 6 — 1:1 leverage unlock · 3 min — *the headline differentiator*

**Click:** Sub-nav → **Students**. Pick any student (Aarav Sharma is a good demo subject).

**Show — top header:**
- Name + avatar + flags + school + programme/grades line.
- 2×2 grid: Profile completion %, Matches count, Applications count, Next deadline.
- Profile completion progress bar.

**You say (slow this down):**
> "One thing came up across nearly every counsellor we've spoken to: 1:1 time is the most valuable thing you give a student, and the hardest thing to protect. Meetings stack up, prep time disappears, you walk in cold. Worse — when a student moves between counsellors or you're covering for a colleague, the context of what's been discussed and why their shortlist looks the way it does is mostly lost. The institutional memory lives in your head, or in scattered notes, or it's gone."

> "This is what walking into a 1:1 looks like with Ascenda. One student's profile, everything on one screen. Top: who they are, where they're applying, current stage, next deadline. In thirty seconds you're fully briefed for a meeting you didn't have time to prep for."

**Click:** **Notes** tab.

**Show:** Notes panel with seed entries — session notes, flags, updates, all timestamped.

**You say:**
> "This is your notes section. Free-text, attached to the student. Whatever you discuss, decisions you make, things to come back to — it lives here. It survives counsellor turnover. No more messy excel files."

**Click:** **Timeline** tab.

**Show:** The profile evolution timeline — icon-coded entries spanning ~300 days. Predicted grade shifts, subject interest changes, counsellor sessions, application milestones.

**You say (this is THE moment):**
> "And this — this is the part I'd ask you to look at carefully. This is the longitudinal view of the student. Predicted grade shifts, when they added or dropped subjects of interest, how their shortlist evolved over time. Students told us their list goes through several rounds of redoing — open days, peer conversations, life events shift things — and counsellors told us they often see only the snapshot. So when you sit down with them and ask why their shortlist looks the way it does, you can see the journey."

> "I genuinely think this is the thing other tools don't have. UCAS, school management systems, even Cialfo — they're snapshot tools. This is the only place you see *why* a student's choices look the way they do, not just what's currently on the list."

---

### Beat 7 — Reporting up · 2 min

**Click:** Sub-nav → **Outcomes** (or `/counsellor/outcomes`).

**Show:** Outcome dashboard with acceptances / rejections / waitlist / pending.

**You say:**
> "As students hear back, you log outcomes here. That builds into our analytics page."

**Click:** Sub-nav → **Analytics** (or `/counsellor/analytics`).

**Show:** The analytics grid. Locate **Applications by stage** widget. Click **Compare to last year** pill at the top of it.

**Show:** Each bar now shows ▲/▼ delta vs last year.

**Click:** **Download Report** in the PageHero actions.

**Show:** Print preview pops up.

**You say:**
> "Year-on-year comparisons, downloadable as a report. So when leadership asks how this year's cohort did, or you're at open evening with parents, you have something other than memory and a spreadsheet."

**Important:** Don't actually print. Cancel out.

---

### Beat 8 — Integrations teaser · 30 sec

The connectors row was removed (it was fake). Deliver this beat as **voiceover only**.

**You say:**
> "Last thing — we're building this to sit alongside the tools you already use. Gmail, calendar, document storage. When a student books a meeting with you in this drawer, it flows into your calendar. When you message a parent, it goes from your inbox. You don't have to leave the platform, but the platform doesn't try to replace everything either."

**Don't click anything.** Don't promise dates.

---

### Beat 9 — Close · 1.5 min

**You say:**
> "That's the demo. We're at a stage where we're really trying to understand whether what we've built actually fits how you work, so the most valuable thing now is your honest reaction. So, over to you. What's resonating, what's not, and what's missing?"

**Stop talking.** Let Sarah lead.

---

## Recovery plan if something breaks

| If… | Then… |
|---|---|
| Side switcher doesn't appear in navbar | Refresh `/dashboard`. The `isDemoUser` hook caches in sessionStorage; first load post-login can flicker. |
| Help-request modal "Send" button does nothing | Check the browser console. Likely auth state lost — re-login and retry. |
| Bell doesn't show notification after Send | Realtime hiccup. The 4-second poll fallback will pick it up within 5s — wait. |
| Drawer "Send reply" fails | Check the `help_messages` table got migrated (the second SQL block from May 13). |
| Lancaster course page renders blank | Fall back to **Imperial Economics, Finance and Data Science** (`07119710-c3d8-5af5-9ba0-f36eadee9f74`) or **LSE Economics** (`d904d5b5-813f-5b20-8baf-8f306d48afe9`). |
| Whole preview URL down | Switch to localhost via tunneled session — don't try to fix Vercel live. |

---

## What's intentionally absent or different from Raf's plan

| Raf's plan said | What we shipped | Why |
|---|---|---|
| Gmail/Calendar/Outlook tiles on counsellor home | Removed entirely | Static tiles with fake "connected as sarah.meacha@stmartins.edu" were misleading. Beat 8 delivered in voiceover instead. |
| Practice board in planner sub-nav | Hidden from nav | Not part of the demo narrative; route exists for backward compat. |
| Per-application detail page with help-request button on every app | "Need help" pill on every priority-board card on the main `/applications` page | Main's applications page doesn't deep-link to per-app detail; the priority board is the demo's natural anchor. |
| "Nudge student/teacher/registrar" sends real emails | Writes real notification rows to the demo user | We don't have an email provider wired. Honest delivery: counsellor's nudge becomes a notification in the student's bell post-flip. |
| Notification dropdown click navigates to /counsellor | Notification dropdown opens the **help thread drawer** for help-related notifications, navigates for others | Drawer keeps the user in flow — they can reply/note/meet without leaving the page. |
