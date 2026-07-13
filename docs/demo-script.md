# Ascenda · Demo Script
### Sunday 18 May 2026 · Sarah · 30 min

---

## Before you start

| | |
|---|---|
| **URL** | https://ascenda-ashy.vercel.app |
| **Login** | `greg@workiflow.com` / `AscendaDemo!2026` |
| **Browser** | Chrome, clean profile, full screen, 100% zoom |
| **Tab 2** | Pre-logged in as backup |

**Saturday reset — run this in [Supabase SQL editor](https://supabase.com/dashboard/project/alpkbobbasxvubogkark/sql/new):**
```sql
delete from help_messages where request_id in (select id from help_requests where student_profile_id = '54d0803b-1c6d-4203-9e02-135f5746e6fa');
delete from help_notes where request_id in (select id from help_requests where student_profile_id = '54d0803b-1c6d-4203-9e02-135f5746e6fa');
delete from help_meetings where request_id in (select id from help_requests where student_profile_id = '54d0803b-1c6d-4203-9e02-135f5746e6fa');
delete from help_requests where student_profile_id = '54d0803b-1c6d-4203-9e02-135f5746e6fa';
delete from notifications where profile_id = '54d0803b-1c6d-4203-9e02-135f5746e6fa';
```
Run the full demo end-to-end once, then reset again so Sunday starts clean.

---

## Flow overview

```
Open → Profile → Explore (course detail: campus life) → Toolbox (essay workshop LIVE)
  → Applications → [Ascendi AI] → Need Help → Send
  → Faculty view → Bell → Drawer (reply / notes / meeting)
  → At-risk panel → Documents (nudge) → Student detail (notes + timeline)
  → Analytics (brief) → Integrations teaser → Close
```

**Target: 18 min demo · 12 min Q&A**

---

## Beat 1 · Open
*2 min — on `/dashboard`, nothing clicked yet*

> "Thanks for making time again, Sarah. When we spoke previously, you talked about chasing documents, sorting shortlists late in the day, keeping visibility on which students need your attention most. We've taken what you shared — alongside what other counsellors and students told us — and built a platform around exactly those moments.
>
> Two sides: a student platform and a counsellor platform. I'll show the student side briefly because everything on your side flows from what students do. Most of our time will be on your side. About fifteen minutes, then we open it up. Jump in any time."

---

## Beat 2 · Student platform
*6 min*

### 2a · Profile
*45 sec — click Profile in top nav*

> "It starts with a profile. Predicted grades, subjects, what they want to study, what matters to them. For this demo it's already filled in — a student aiming for Computer Science. Once they submit, the algorithm assigns them a compatibility score for every relevant programme.
>
> This pill here is telling Greg his pathways are still open. If he were to drop Further Maths now, this would flip to a warning before the exam window closes. Roughly one in five students quietly block themselves from degree options through subject choices made years earlier — this catches it early."

---

### 2b · Explore + course detail
*2 min — click Explore*

> "And this is what they see. Programmes categorised as Reach, Match, or Safe — a framework you're already using with them. The score is decomposable; they can see exactly why a course ranked where it did."

**Click into Cambridge Computer Science (Reach section, top of page).**
Scroll to the campus and city life section.

> "One consolidated page replaces thirty browser tabs. The thing we're particularly proud of — and this is something other tools don't do — is this section. A lot of our students are based in India, Southeast Asia, Nigeria. They have no idea what life is actually like in the UK. They can see the percentage of international students, what the city is like, cost of living, career prospects — everything they need to make a confident decision, in one place."

---

### 2c · Toolbox — essay workshop live
*2.5 min — click Toolbox, then Essay Workshop*

> "Before they get to applications, they need the tools to do the work. Requirements checker, chances calculator, deadline timeline — all here. But the one I want to show you live is this."

**Click Essay Workshop. Clear the textarea. Type:** `Science has always been my way of making sense of the world.` **Then click Get Feedback.**

> "We think of a personal statement as building blocks of a student's life — different pieces assembled together. What's hard is that every portal has different requirements. UCAS is 4,000 characters; other portals are different again. Students don't know what good looks like.
>
> So we built two things: an outline suggester that helps them build the essay piece by piece from their profile, and a reviewer that benchmarks their draft against the strongest essays from Oxford, Cambridge, and Harvard. Immediate, structured feedback — not writing it for them, guiding them to write something great."

---

### 2d · Applications
*1 min — click Applications*

> "And this is the central hub. One place to manage everything. The page leads with the three most urgent things across all applications — they always know what to do today. Below that, the full list with status, tier, and progress. Each application has a task list so nothing falls through the cracks."

---

## Beat 3 · The segue
*1 min — the pivot moment, practise this click*

> "The platform also has an AI assistant they can chat with. If they're confused about requirements or unsure what to do next, they ask here. But sometimes the AI isn't enough and they want a human. That's where this comes in."

**Click the violet Need help button next to Cambridge in the What's next list.**

> "The platform knows what they're working on, what stage they're at, pre-fills a structured request. AI-drafted — the student edits before sending. Rather than a blank email, you get context."

**Click Send to counsellor.**
Toast: *"Sent — Sarah will respond shortly."*

> "Let me flip over to your side."

**Click the Faculty view pill in the navbar (top-right, violet).**

---

## Beat 4 · Visibility unlock
*2.5 min — on `/counsellor`, pause a beat*

**Don't click yet. Point out:**
- Bell with red **1** badge
- Help requests widget with Greg's request at the top

> "This is your homepage. You see all your students in this cycle. The notification you just saw lives up here — anything urgent surfaces without you needing to dig for it."

**Click the bell → click Greg's request row.**
Drawer slides in from the right.

> "Your inbox view of the same request. Three things you can do here without leaving the page — reply, leave a private note, or propose a meeting."

**Click Notes tab. Type:**
> *Strong on the quant side, weak on the 'why this university' question. Send the Cambridge sample for reference.*

**Click Save note.**

> "These notes are private — only counsellors see them. Whatever you discuss, decisions you make, things to come back to. It lives here and it survives counsellor turnover."

**Click Meeting tab. Click Propose.**
Meeting appears with "proposed" status.

**Click Thread tab. Type:**
> *Hi Greg — happy to help. Just scheduled a 15-min slot for Tuesday 3pm and dropped some notes. Let's start with your opening paragraph.*

**Click Send. Then click X to close the drawer.**

**Pause on the at-risk panel below.**

> "And this is the bit I want to spend a moment on. You mentioned this specifically when we spoke. The pattern is consistent: meetings stack up, the loudest students absorb the most time, and the students who genuinely need help often aren't the ones asking. They go invisible until it's too late. This surfaces them automatically — approaching deadlines, incomplete work, applications stalled.
>
> It's not about replacing your judgement. It's about making sure your judgement gets applied to the right students at the right time."

---

## Beat 5 · Documents
*2 min — click Documents in counsellor sub-nav*

> "The bit I think will resonate most based on what you shared — document chasing. Transcripts, references, personal statements. You described it as one of the most repetitive parts of the cycle. Twenty separate email threads, a spreadsheet to track what's outstanding, chasing students who haven't replied to chase teachers who haven't replied."

**Click the Overdue filter pill.**

> "Overdue documents float to the top. Per student, per application, you nudge the right person — student, teacher, registrar — through the platform, not through twenty separate emails."

**Click Nudge teacher on Mohammed Al-Rashid's A-Level Transcript.**
Toast appears. Status flips to "Nudge sent."

> "Everything's logged, so you can see at a glance what's blocked instead of holding it all in your head."

---

## Beat 6 · Student detail — the headline
*3 min — click Students, click Aarav Sharma. Slow down here.*

**Show the header card without scrolling:**
name, school, predicted grades, 2×2 stats grid, completion bar.

> "One thing came up across nearly every counsellor we've spoken to — 1:1 time is the most valuable thing you give a student, and the hardest to protect. Meetings stack up, prep time disappears, you walk in cold. And when a student moves between counsellors, the context of what's been discussed and why their shortlist looks the way it does is mostly gone. The institutional memory lives in your head, or scattered notes, or it's just lost.
>
> This is what walking into a 1:1 looks like with Ascenda. Thirty seconds and you're fully briefed for a meeting you didn't have time to prepare for."

**Click Notes tab.**

> "Your notes, attached to the student. Free-text. Whatever you discuss, it lives here. Survives counsellor turnover."

**Click Timeline tab.**

> "And this — this is the part I'd ask you to look at carefully. The longitudinal view of the student. Predicted grade shifts, when they added or dropped subjects of interest, how their shortlist evolved over time.
>
> Students told us their list goes through several rounds of redoing — open days, peer conversations, life events. Counsellors told us they usually only see the snapshot. So when you sit down with them and ask why their shortlist looks the way it does, you don't have to start from scratch. You can see the journey.
>
> I genuinely think this is the thing other tools don't have. UCAS, school management systems, Cialfo — they're snapshot tools. This is the only place you see *why* a student's choices look the way they do, not just what's currently on the list."

---

## Beat 7 · Analytics
*1.5 min — click Analytics in counsellor sub-nav*

> "Schools do yearly reports. Leadership asks how this year compares to last; parents at open evening want to know where students ended up. Right now the answer lives in memory or a spreadsheet. This changes that.
>
> Everything in one place, completely customisable. And because it tracks applications live, year-on-year comparisons are automatic. You can also see — if a lot of your students are applying to the same field or country, that tells you where to run a targeted workshop. The data tells you where to intervene."

**Click Download Report → Cancel print dialog.**

---

## Beat 8 · Integrations teaser
*30 sec — no clicking, voiceover only*

> "Last thing — we're building this to sit alongside the tools you already use. Gmail, calendar, document storage. When a student books a meeting here, it flows into your calendar. You don't have to leave the platform, but the platform doesn't try to replace everything either."

---

## Beat 9 · Close
*1.5 min*

> "That's the demo. We're at a stage where we're really trying to understand whether what we've built actually fits how you work. The most valuable thing now is your honest reaction — what's resonating, what's not, and what's missing."

**Stop talking. Let her go first.**

---

## Likely questions — prepared answers

| Question | Answer |
|---|---|
| **How does application status get updated?** | Students update it themselves for the MVP. We're also exploring email-sync — connecting the student's application inbox so status updates from universities come through automatically. |
| **Is the AI assistant real?** | The request draft is a structured template that fills in from the student's context today. The full LLM version is in flight — same input, richer language. |
| **Gmail / Calendar integration depth?** | Real OAuth is on the roadmap. The connection point you saw is where it plugs in — when it goes live, the meeting proposal schedules into your real calendar. |
| **How do you know the Reach / Match / Safe categorisation is right?** | We run the student's profile against entry requirements, historical admissions data, and university characteristics. It's decomposable — they can see the breakdown behind each score. |
| **What about UCAS integration?** | UCAS doesn't expose an API for direct integration, so the student manages their UCAS application in parallel and logs outcomes here. Longer term we're looking at email-sync to auto-detect updates. |
| **Do parents have access?** | Not in this demo build — it's on the roadmap. The school controls who sees what. |

---

## If something breaks

| Problem | Fix |
|---|---|
| Faculty view pill missing | Hard refresh once |
| Matches page slow | Let it fully load — don't open extra tabs (each recalculates the cache) |
| Bell stays at zero after Send | Wait 5 sec — realtime fires within 1s, 4s poll catches it |
| Cambridge course page 404s | Fall back to Imperial Computing or UCL Computer Science |
| Essay workshop returns nothing | Type a longer sentence and retry. If still broken: *"generates in real time — let me move on"* |
| Send to counsellor does nothing | Console → if "row level security" errors, fall back to screenshots and keep talking |
| Production URL down | Switch to backup tab |

---

## Timing guide

| Beat | Time | Cut? |
|---|---|---|
| 1 · Open | 2 min | No |
| 2 · Student platform | 6 min | Can trim essay workshop to 1.5 min if tight |
| 3 · Segue | 1 min | No |
| 4 · Visibility (drawer) | 2.5 min | No |
| 5 · Documents | 2 min | Can cut short — Sarah will get it fast |
| **6 · Student detail** | **3 min** | **Never cut — this is the differentiator** |
| 7 · Analytics | 1.5 min | Cut first if running over |
| 8 · Integrations | 0.5 min | Can fold into Beat 9 |
| 9 · Close | 1.5 min | No |
| **Total** | **~20 min** | Target 18, leave 12 for Q&A |
