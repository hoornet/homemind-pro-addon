# Changelog

## 2.4.23

- **There is now exactly one place to set the assistant's personality.** Until now there were two Custom Prompt fields — one in the add-on's Configuration tab and one tucked behind the Nives integration's Configure button — and whichever was set in the second silently won. Fill in one while something sat in the other and your prompt did nothing, with no hint as to why. The integration field is gone; the add-on's Configuration tab — where your keys, logs and updates already live — is now the single home for the personality, and what you write there is always what runs. If your prompt lived in the integration field, move it over once (Settings → Apps → Nives → Configuration, then restart the add-on when asked) — and asking Nives to change its name will point you to the right place too.
- **Restarting after an update is now one click.** When an update needs a Home Assistant restart to finish, Nives now files a "Restart required" repair under **Settings → Repairs** — the same way HACS asks — and its Submit button restarts Home Assistant for you, right there. Until now the reminder was a notification that left you to find Settings → System → Restart yourself. Nothing restarts on its own: the repair waits, Nives keeps working on the previous version in the meantime, and the restart happens only when you click Submit. A fresh install still uses the notification (the repair machinery only becomes available once the integration is running), and so will the first update you install after this one — from the next update on, the repair takes over and the notification is dismissed automatically.

## 2.4.22

- **Nives no longer keeps notes about what it has forgotten.** Ask it to forget something and the memory goes — but the asking was itself memorable, so Nives could store a *new* memory about the forgetting: "you no longer want your canary word remembered", "you confirmed deletion of the bedroom cooling automation". Each one is harmless on its own, they quietly accumulate, and they come back when you ask Nives what it remembers about you — where a note saying something isn't remembered is a peculiar thing to be told. Nives now stores nothing at all about a forget. Notes of this kind already in your memory are cleared by the routine tidy-up that runs shortly after the add-on starts, so they should be gone on their own once you've updated — nothing for you to do.

## 2.4.21

- **Nives now says which personality setting it's actually using.** There are two places to put a custom prompt — the add-on's own Configuration tab, and the Nives integration's Configure screen in Home Assistant — and if both are filled in, the integration's one wins. Nothing ever said so, so a perfectly good prompt could sit in one field doing nothing while the other quietly took precedence, with no way to tell from the outside. The add-on log now names the prompt in effect and where it came from, and says plainly when the other one is being overridden. If a personality ever seems to be ignored, that line is the first place to look.

## 2.4.20

- **Routine dependency housekeeping.** Updates to the OpenAI SDK the server uses for OpenAI-compatible endpoints, the HTTP library behind its network calls, and two build-time tools. Nothing changes in how Nives works. (A proposed update to the database library was set aside for now — that release shipped without the ready-built files Nives needs, so it stays on the current version until they return.)

## 2.4.19

- **Ask Nives to change its name, and it now tells you where to do it.** Its name and personality come from its instructions rather than from anything it remembers, so asking it in conversation to forget its name or become someone else was never going to work — and until now it didn't know that either, so it would try, find nothing, and leave you none the wiser. It now says so plainly and points you at the "Custom system prompt" field under Settings → Devices & services → Nives → Configure, which takes effect right away. Write just the personality you want there ("You are HAL 9000, the calm and precise computer from 2001: A Space Odyssey") — whatever you put in replaces its identity completely.

## 2.4.18

- **Memories are only ever deleted from a real conversation with you.** Forgetting has always asked you to confirm first, but a request arriving outside a conversation — such as one made by an AI Task, including tasks that look at camera images — had no one to ask, and went ahead. Those requests are now declined outright, so a memory can only be removed after you've been shown it and agreed.
- **Changing a remembered number now sticks.** "Forget that I like the bedroom at 21 at night — make it 23" removes the old setting and remembers the new one. Values like temperatures, times and thresholds were short enough that the new version looked like the old memory returning, so it wasn't kept.
- **Swapping a memory for a new version now keeps the new one.** You can say "forget that my canary word is bumblebee — it's now honeybee" in a single breath, and Nives forgets the old memory and remembers the new one. When the two versions differed by only a single word, the new one could look so much like the memory just forgotten that Nives set it aside to avoid re-learning what you'd asked it to drop — so the old fact went and the new one wasn't kept. It now looks at which words actually changed rather than how alike the two sentences are, so a swapped value is saved while a genuine repeat of the forgotten memory is still ignored.

## 2.4.17

- **Nives now knows its own name — and hands it over properly when you rename it.** Ask "what's your name?" and you'd always get "Nives", but that answer was really an educated guess: the name didn't actually appear anywhere in Nives's own instructions, so it was inferring it from the label it puts on automations it creates. That worked perfectly until you used the Custom Prompt to give it a different personality — one line of yours was up against a label the model saw several times over, and smaller models kept drifting back. Nives is now told its name outright, and that label is described as what it is, so a Custom Prompt like "You are HAL 9000, the calm and precise computer from 2001" replaces it cleanly and stays replaced. Checked on a small local model as well as the Cloud one. (Thanks @pitzoid for sticking with this in #54.)

## 2.4.16

- **You can now simply ask Nives to forget something.** Say "forget that my name is Alex", "delete the memory that I prefer 21 degrees", or "that's not true anymore", and Nives quotes the exact memory back to you and waits for your yes before anything is removed — the same confirm-first flow it already uses for automations. Nothing is ever deleted on the first ask, and if several memories could match, Nives lists them and asks which one you mean rather than guessing. Until now memories could only be removed outside the conversation, so "forget that…" had nowhere to go (thanks @pitzoid for raising it in #54).
- **Replacing something works in one breath.** "Forget that my name is Alex — my name is now HAL 9000" removes the old memory and remembers the new one, without the old one quietly finding its way back from the same conversation.
- **It only ever forgets what you name.** Nives won't sweep through your memories, and "don't forget to water the plants" is still a reminder, not a deletion. If it can't find what you're describing, it says so instead of removing something that merely looks similar.

- **Nives can no longer learn its author's name as yours.** The internal instructions Nives uses when deciding what's worth remembering contain a couple of example facts, and those examples used a real name — the developer's, as it happens. Most models read them purely as formatting samples, but a small local model can occasionally copy an example straight into your real memory, leaving you with an assistant quietly convinced your name is Jure (thanks @pitzoid for the wonderfully strange find in #54). The examples now use neutral placeholder names. If a stray "Jure"/"Hoornet" fact already made it into your memory, #54 has the steps to remove it.

## 2.4.14

- **OpenAI SDK updated to the new major version (v7).** This is the library the server uses whenever Nives talks to an OpenAI-compatible endpoint — Nives Cloud, BYOK OpenAI, Ollama, and the optional Whisper/TTS voice services. Verified end-to-end before shipping: full test suite plus a live boot test covering streamed tool calls and fact extraction. No configuration changes needed and nothing changes in how Nives behaves.

## 2.4.13

- **Dependency housekeeping.** Routine update to the Anthropic SDK the server uses for Claude models (BYOK), plus a security fix in one of the add-on's build-time tools. Nothing changes in how Nives works.

## 2.4.12

- **Security update.** The HTTP library the add-on's server uses for its network requests (undici) is updated to a version that addresses five recently published security advisories, one of them rated high. Preventive housekeeping — nothing changes in how Nives works.

## 2.4.11

- **Nives no longer restarts Home Assistant on its own.** Until now, the add-on restarted Home Assistant right after installing or updating its companion integration, so the new version would load straight away. That restart could arrive without warning — and because Home Assistant goes down before it can answer the request, the add-on's own log sometimes reported it as refused and asked again, restarting twice in a row. From the outside that looked like Home Assistant crashing (thanks to @pitzoid for the report in #50 — that's exactly what it looked like). From this version, Nives simply leaves a notification in Home Assistant asking you to restart at a moment that suits you. Everything keeps working in the meantime, and the reminder clears itself once the restart happens.

## 2.4.10

- **Docs refresh: Nives Cloud is now one plan.** The README and add-on docs used to describe multiple Cloud plans differing by speed and model capability. Nives Cloud has since moved to a single plan with one carefully chosen model for everyone — kept current for you, swapped behind the scenes whenever a better one comes along. The docs now say exactly that. Nothing changes in the add-on itself, and BYOK is untouched.

## 2.4.9

- **Voice answers are now actually built for voice.** Nives has always had a voice mode — a tighter persona that answers the way you'd want something read aloud, briefly — but the add-on never told the server when a request came from a voice satellite, so spoken questions got the full written-chat treatment. Requests from voice devices (Voice PE and friends) are now flagged, and answers through the speaker get properly conversational. Typed chat is unchanged.
- The project README now answers the most-asked question — how Nives relates to its open-source sister project home-mind — with a proper side-by-side comparison.

## 2.4.8

- **Nives now answers in the language you ask in — reliably.** Until now it had no idea what language your Home Assistant is set to, and guessed from context; in a home full of, say, Slovenian device names, that could mean a Slovenian answer to an English question. The add-on now passes your Assist pipeline's language along as the default, while the language you actually write in always takes priority.
- **Edits to automations now say what they leave alone.** When Nives proposes a change to an existing automation, it now spells out which parts stay untouched — so a request it only half-addressed can't be presented as fully done.
- **A subtle automation trap is now caught before you confirm.** An automation with both a fixed-time trigger and a threshold trigger (say, "at 20:00" and "above 22°C") runs at the fixed time regardless of the threshold, unless the threshold is also a condition. Nives now warns about exactly this when proposing such an automation — and knows to add the condition in the first place.

## 2.4.7

- **Polish on 2.4.6's multi-automation support.** The assistant is now told explicitly that a request needing several automations means previewing them all together and creating them all after a single yes — so all models follow the flow 2.4.6 made possible, not just the ones that inferred it.
- **A safety net for edits.** If a requested change to an existing automation would strip away all of its conditions — for example leaving a cooling rule running no matter who's home — Nives now points that out before you confirm, instead of quietly applying it.

## 2.4.6

- **Fixes automations that were never created no matter how many times you said yes.** When a request needed two automations — "cool it when it's over 22, switch off when it's back to 20" — Nives would keep asking you to confirm and never actually create either one. It can now hold more than one pending change at a time, so a single yes creates both.
- **Nives asks once, not twice.** Confirming a new, changed or deleted automation took two rounds of "yes" where one was meant to be enough.
- **Nives stays in the language you're speaking.** It could drift into another language mid-conversation — most easily when your devices are named in a different language from the one you're chatting in, or after a short reply like "yes". Device and room names are left spelled as they are, in a reply written in your language.

## 2.4.5

- **Automations now account for everything you asked for.** If you describe several things at once — "when I'm home", "between 20:00 and 22:00", "and switch it off again when it cools down" — Nives now either builds every part in, or tells you plainly which part it hasn't, before you confirm. It will no longer describe a condition that isn't actually in the automation.
- **"Turn it on when it gets hot, off when it cools down" now gets both halves.** That needs two automations, and Nives now says so up front and creates both, rather than offering to do the second one later.
- **A daily time check is now described for what it is.** An automation triggered at a set time looks at the temperature once, at that moment — it won't notice the room heating up half an hour later. Nives now points this out and offers to make it react to the temperature itself.
- Under the hood: the confirmation preview now spells out what an automation will *not* do — no conditions means it runs every time, regardless of who's home or what time it is.

## 2.4.4

- **Updates now finish without you having to restart Home Assistant.** When Nives updates, Home Assistant needs a quick restart to load the new companion integration. Nives was asking for that restart in a way it isn't permitted to use, so the request was always turned down and the update sat half-applied until you restarted Home Assistant yourself. It now asks the way it is allowed to, and 2.4.3's retries stay in place for the occasional moment when Home Assistant is briefly unavailable.
- Nives asks for nothing more than it already had — this is the same permission it uses to read your sensors and switch your lights, not a new one.
- If a restart still can't be arranged, the add-on log says exactly why and what to do, and Nives keeps working in the meantime.

## 2.4.3

- **Updates now finish on their own.** When Nives updates, Home Assistant needs a quick restart to load the new companion integration. The add-on asks for that restart itself — but if Home Assistant is still busy finishing the update at that moment, the request doesn't land, and the update stays half-applied until you restart Home Assistant yourself. Nives now waits until it has finished starting and asks again, a few times, so this sorts itself out.
- If it still can't get through, the add-on log says so plainly and tells you what to do. Nives keeps working either way.
- The add-on log now records exactly why a restart request was turned down, instead of only that it was.

## 2.4.2

- **The Nives API can be protected by an access token again — this time on existing installs too.** The add-on's API on port 3100 has until now accepted any request that could reach it, which meant anything else on your Home Assistant machine could talk to your assistant, control your devices through it, or erase what it remembers. It now uses an access token, generated on first start and kept on your own machine.
- **Nothing to set up, and nothing to redo if you were on 2.4.0.** The add-on leaves the token where its companion integration picks it up every time it starts, so new and existing installs are both covered. Home Assistant restarts once during the update.
- **Protection switches on at the following add-on start, not this one.** The add-on waits until the integration has confirmed it actually has the token before it starts requiring one. That extra step is deliberate: it makes it impossible for the add-on to lock out its own integration, which is what went wrong in 2.4.0. Until then it behaves exactly as before, and the add-on log tells you which state it's in.
- If the token can't be handed over at all, the add-on says so in its log and keeps accepting requests as before, rather than leaving you without an assistant.
- If you call the API yourself (a script, or the add-on's port exposed to your network), you'll need to send the token — see "API access (advanced)" in the documentation for where to find it. `/api/health` stays open so monitoring keeps working.

## 2.4.1

- **Fixes Assist not responding after updating to 2.4.0.** If you updated to 2.4.0 and Nives stopped answering ("Sorry, I couldn't reach the Nives server right now"), this release restores it. Update and it will work again — nothing else to do.
- What happened: 2.4.0 started requiring an access token on the add-on's API, and handed that token to the companion integration automatically. That works on a new install, but on an install that already existed the token never arrived, so the add-on refused its own integration's requests. The token requirement is switched back off while we deliver it a different way. Sorry about the disruption.

## 2.4.0

- **The Nives API is now protected by an access token.** Until now the add-on's API on port 3100 accepted any request that could reach it — which meant anything else on your Home Assistant machine could talk to your assistant, control your devices through it, or erase what it remembers. It now requires an access token, generated on first start and kept on your own machine.
- **Nothing to set up.** The add-on hands the token to its companion integration automatically, including on existing installs — Assist keeps working, and there's nothing to copy or configure. Home Assistant restarts once during the update so it picks up the change.
- If you call the API yourself (a script, or the add-on's port exposed to your network), you'll now need to send the token — see "API access (advanced)" in the documentation for where to find it. `/api/health` stays open so monitoring keeps working.

## 2.3.4

- **Clearer answer to "what actually gets sent to the AI?"** The Data & Privacy section now spells out exactly what stays on your machine (your memories and conversations, always) and what travels with each message so Nives can answer usefully (the relevant memories, your home layout, and anything it looks up). The previous wording said only your conversation text was sent, which undersold it — the same is true in Cloud and BYOK mode, and running a local model via Ollama keeps everything in the house.
- **Setup docs match how the add-on behaves.** Model is optional for Anthropic, OpenAI and OpenRouter but required for Ollama, and the Ollama base URL has a default — the configuration table now says so.

## 2.3.3

- **Confirmations are now tied to the specific automation.** If you ask for one automation, then change your mind and ask for a different one instead, Nives asks about the new one before creating it rather than treating your earlier request as already answered.
- **Long-running requests now always come back with an answer.** If a request keeps needing more information, Nives now wraps up and replies in words instead of continuing to work in the background — so you get a response, and it doesn't quietly use up your allowance.
- **More forgiving when a model replies imperfectly.** A garbled device command from the AI is now handled and retried instead of ending the whole request.
- **Long-term memory tidying now runs as intended.** The routine that clears out stale or low-value memories was only running for people who had chatted in the last day; it now covers everyone.
- **Clearer setup with your own API key.** If you choose OpenAI or Ollama and leave Model blank, Nives now picks a sensible default (OpenAI) or tells you exactly what to fill in (Ollama), instead of failing with a confusing "model not found".
- Memory-usage monitoring for the Shodh memory service now reports in the add-on log.
- Routine dependency and CI refresh for the bundled server (Anthropic and OpenAI clients, networking and request-parsing libraries). No change in behaviour — quiet housekeeping.

## 2.3.2

- Routine dependency refresh for the bundled server (Anthropic and OpenAI clients, networking library, and build tooling). No change in behaviour — quiet housekeeping.

## 2.3.1

- Routine dependency refresh for the bundled server (Anthropic and OpenAI clients, networking libraries, and build tooling). No change in behaviour — quiet housekeeping.

## 2.3.0

- **Nives can now look at images.** AI Task (`ai_task.generate_data`) accepts image attachments — e.g. hand it a camera snapshot and ask "is this expected?" and Nives reasons about what it sees, with your home's context. Great for smart, low-false-alarm camera/doorbell notifications. (Requires a vision-capable model — all Premium models and most Standard ones qualify.)

## 2.2.3

- **Fixed: editing an automation now keeps the parts you didn't change.** When you asked Nives to change one thing about an existing automation (e.g. its timing), the other parts (like its actions) could be dropped. Editing now preserves everything you didn't explicitly change.

## 2.2.2

- **Cleaner replies in Assist.** Nives now answers in plain text (no stray `*` / `**` markdown characters, which the Assist app showed literally) and refers to your devices by their friendly names instead of technical entity IDs — so responses read naturally on voice and on your phone.

## 2.2.1

- Security and dependency refresh for the bundled server (updated file-upload handling, the network client, and the Anthropic client, among others). No change in behaviour — quiet housekeeping.

## 2.2.0

- **Nives can now power AI Task automations.** Use the `ai_task.generate_data` action to get an answer — or structured data — reasoned with what Nives knows about you. For example, triage a motion or doorbell event into a priority level right inside an automation. (Text for now; image analysis is coming later.)

## 2.1.15

- **Nives now has its icon in the Integrations dashboard.** The integration ships its own brand icon and logo, so the "icon not available" placeholder is replaced with the Nives mark (on Home Assistant 2026.3 and newer).

## 2.1.14

- **Automations now use what Nives knows about you.** Ask for something like "turn on the lights every evening" and Nives uses *your* sense of evening (or your preferred brightness) instead of a generic guess — and if it doesn't know yet, it'll ask once and remember for next time.

## 2.1.13

- **Voice follow-ups now keep listening.** On Home Assistant Voice (and other Assist satellites), when Nives ends a reply with a question it now tells Home Assistant to reopen the microphone — so you can answer straight away without repeating the wake word. Thanks to the detailed community report that pinpointed this.

## 2.1.12

- **More reliable automation actions.** Nives now builds notification and device actions correctly even if the underlying details are phrased loosely — so creating an automation that messages your phone just works.

## 2.1.11

- **Creating an automation now reliably completes on your first "yes."** A follow-up fix to the confirmation flow so it no longer keeps re-asking after you've already confirmed.

## 2.1.10

- **Fixed: creating an automation could get stuck re-asking "shall I create it?" without ever creating it.** Confirming now reliably goes through — describe what you want, say yes, and the automation is created.

## 2.1.9

- **Nives always checks with you before touching your automations.** Creating, editing, or deleting an automation now reliably shows you exactly what it will do and waits for your "yes" first — so nothing in your setup changes without your say-so.

## 2.1.8

- **Edit automations just by asking.** Say *"change that to 22:00"* or *"have it also turn off the hallway light"* and Nives will update an automation it created — always with your confirmation first.
- **More reliable notifications.** When you ask Nives to set up an automation that messages your phone, it now confirms your real notification target before creating it — so those alerts reliably land where they should.

## 2.1.7

- **Nives can now manage the automations it makes.** Ask *"what automations have you set up?"* to see them, or *"delete the living room one"* to remove it — Nives always names the automation and checks with you before deleting anything.

## 2.1.6

- **New: Nives can create automations for you.** Ask for something like *"turn the porch light on at sunset every day"* or *"switch the office lights off at 23:00"* and Nives will set up the Home Assistant automation. It always checks with you before creating anything, and every automation it makes is named with a **"Nives: "** prefix so you can easily find — or tweak — it under Settings → Automations.

## 2.1.5

- Fresh new look: Nives now has its own icon and logo — a green snow-crystal mark you'll see in the add-on store and across nives.house. Same Nives under the hood.

## 2.1.4

- Routine dependency refresh for the bundled server (Anthropic client, esbuild, and supporting libraries). No change in behaviour — quiet housekeeping.

## 2.1.3

- Refreshed the documentation — a clearer guide to powering Nives (Nives Cloud vs bring-your-own-key) and updated setup instructions. No change to the add-on itself.

## 2.1.2

- Routine dependency refresh for the bundled server (Anthropic client + Node type definitions). No change in behaviour — quiet housekeeping.

## 2.1.1

- Routine dependency refresh for the bundled server (including the OpenAI client and test tooling) and the build's CI actions. No change in behaviour — quiet housekeeping.

## 2.1.0

- **Nives Cloud now manages your AI models for you.** Each plan maps to a curated set of models that we keep current behind the scenes — when we add or refresh a model, your add-on picks it up automatically, with nothing for you to install or configure. If a model is ever briefly unavailable, Nives moves on to the next one in your plan so your assistant keeps working. (BYOK mode is unchanged — you stay in full control of your own model choice.)

## 2.0.7

- Updated the bundled server's core libraries — including a major refresh of the underlying web framework and the AI client libraries — to keep Nives current and well-supported. Behaviour is unchanged; this is a quiet housekeeping release.
- Added an automated test suite that now runs on every change, so future updates ship with more confidence.

## 2.0.6

- Refreshed the bundled server's dependencies to pick up upstream security patches (uuid, express, and the transitive `qs` package). Nives behaves exactly the same — this is a quiet housekeeping release that keeps the image current.

## 2.0.5

- **More accurate "when did X start today?" answers.** Previously, asking when solar production or any rate/power/flow sensor started today could return a pre-dawn time (e.g. "4 AM") that was really just the inverter's idle current or sensor noise. Nives now ignores those near-zero readings and either cites when the value first crossed a meaningful fraction of today's peak or describes the ramp ("ramped up through the morning") — whichever fits the data better. Works the same way regardless of season, latitude, or sensor type.
- **Correct "today" range on history queries.** When the AI asked Home Assistant for "today's" data, it was using midnight UTC instead of your local midnight — so the first hours of your actual local day were missing from the query window. Nives now hands the AI your local midnight (in UTC form) directly, so "how much did the solar make today?" or "any motion since midnight?" line up with the day you're actually living in, regardless of your timezone.

## 2.0.4

- **Better answers for "how's solar production?", "when did X start?", and "any motion at the gate?" style questions.** Nives's system prompt now pushes the AI to search Home Assistant for entities before saying "I can't help" — so questions about systems that weren't in the initial cheat sheet (solar, energy meters, security devices, anything in HA) get answered after a quick search instead of being declined.
- **Smarter handling of "today's X" questions.** Nives now knows that the current state of a `*_current_power` sensor is the live reading, not the day's total — so asking "how much did the solar make today?" pulls daily history, not whatever the panels are doing right now.
- **No more "solar started at 4 AM" mistakes** on noisy sensors. Pre-dawn sensor noise on solar inverters or other cumulative sensors is now treated as noise — Nives picks a meaningful threshold or describes the ramp rather than naming the first non-zero reading.

## 2.0.3

- **Helpful error messages instead of "I received your request but got no response."** When the AI fails to produce an answer, Nives now tells you *why* — whether the response was cut off at the token limit, blocked by the provider's content filter, or the model just returned nothing usable. Previously every failure showed the same generic message regardless of cause, which made diagnosing problems frustrating. The new messages also point you at the specific setting to try next when one applies.
- **Two new advanced settings for BYOK users running picky local models** (Ollama / LM Studio etc.). If your fact extractor was silently returning nothing, you can now nudge it with `OPENAI_RESPONSE_FORMAT=json_object` (asks the provider for strict JSON output) and `OPENAI_MAX_TOKENS=2048` (raises the output budget). These are passed via the addon's "Server-level environment" config and only affect fact extraction — chat is unaffected. Defaults are unchanged, so existing setups behave the same.

## 2.0.2

- Fixed a history-lookup bug that prevented Nives from answering "today's solar production" style questions. When the AI included its local timezone (e.g. `+02:00`) in a history query, the request was silently rejected with a 400 from Home Assistant. Conversations that depended on history would then loop, give up, or fall back to less-accurate live readings. Queries about energy production, past events, and "when did X happen?" now resolve cleanly on the first try.

## 2.0.1

- Refreshed the bundled server's dependencies to pick up upstream security patches (multer, undici, and a few transitive packages). Nives behaves exactly the same — this is a quiet housekeeping release that keeps the image current.

## 2.0.0 — renamed to Nives

The add-on previously known as **HomeMind PRO** is now called **Nives**. Same product, same memory layer, same modes — new identity that's easier to address by voice and gives the add-on its own name (separate from the open-source `home-mind` project it grew out of).

**What changes for you:**

- **Clean install required.** Because the underlying add-on slug changed, v2.0.0 installs as a brand-new add-on alongside the older HomeMind PRO rather than replacing it. To switch over: install Nives from the same repository, copy your configuration across, then uninstall the old HomeMind PRO. Memories and conversation history don't carry across — you start fresh on Nives.
- **New home on the web: [nives.house](https://nives.house).** Cloud sign-up, your account dashboard, and these docs all live there now. The old `homemindpro.com` redirects to the new site, so any links you've saved keep working.
- **Same behaviour, new labels everywhere.** Cloud and BYOK modes work identically to v1. The integration domain, conversation agent name, s6 service names, and every UI string now read "Nives" instead of "HomeMind PRO".

About the name: *Nives* is a Slovenian female name, from Latin *nives* — "snows". Pronounced **NEE-ves**.

## 1.0.28

- More forgiving memory-layer parsing. The fact extractor now tolerates trailing text after JSON, single-fact responses (some AI models return either of those instead of strict JSON arrays), and a few related variants. If you've ever noticed the assistant not remembering something you clearly told it, this should reduce those misses.

## 1.0.27

- **Memory layer actually upgraded to Shodh-Memory v0.2.0.** v1.0.20's CHANGELOG announced this upgrade, but a build-configuration mismatch caused every CI build since then to keep shipping v0.1.91 in the actual image. This release corrects that — production now gets the v0.2.0 binary the codebase has been pinning all along. v0.2.0 brings entity salience, NER-based filtering, curvature-weighted retrieval, glacial exponential decay, and the MCP orphan-process fix. Existing memory data migrates automatically thanks to dual-decode (postcard + legacy bincode) on read paths — no user action needed.

## 1.0.26

- Behind-the-scenes maintenance update. No change to how the add-on works — Cloud and BYOK behave exactly as before.

## 1.0.25

- **Honest BYOK framing in docs and UI** — the README, DOCS, and HA config UI no longer suggest BYOK is easy or supported the same way Cloud is. "Easiest setup" framing is gone; Cloud is now explicitly the curated/supported path, BYOK is labelled best-effort. The DOCS BYOK section now leads with two upfront requirements: the selected model **must** support function/tool calling (or chat fails with the provider's "No endpoints found that support tool use" 404), and memory extraction quality varies by model. Users wanting deep local/Ollama setups are pointed at the open-source [home-mind](https://github.com/hoornet/home-mind) project, which is purpose-built for that. No code change — documentation and HA UI strings only. Driven by a real user mistaking BYOK as "just working" out of the box.

## 1.0.24

- **Stop executing time-anchored requests immediately** — when a user said "turn on the kitchen lights at 20h", the assistant was reaching for `call_service` right away and ignoring the time anchor, then offering to set up an automation through the HA UI as an afterthought. The system prompt now has a `SCHEDULED / RECURRING ACTIONS` section that tells the LLM not to `call_service` when the request includes a time anchor (`at 20h`, `every evening`, `tomorrow`, `daily`, `when X happens`), and instead acknowledge the scheduled intent and save it as a remembered preference until automation creation is supported. Honest about the limitation rather than papering over it. Added to both text and voice prompt variants.

## 1.0.23

- **Read Shodh's Hebbian `strength` field as confidence** — the recall path now uses `mem.strength ?? mem.importance` instead of just `importance`. `importance` is the value the client stored at write time; `strength` is the field Shodh updates on each recall hit per its LTP/Hebbian model. We were reading the static input back as confidence, which is why facts looked frozen at extraction confidence forever despite repeated use. Falls back to `importance` if Shodh's response shape doesn't include `strength`, so behavior is unchanged where the new field isn't present.
- **One-shot Shodh memory shape log** — the first recall after each process start prints `[shodh-shape] first recall memory keys` + full JSON, so the addon log shows exactly which fields Shodh returns (strength, access_count, last_accessed, …). Fires at most once per process; useful for any future debug session.

## 1.0.22

- **Protect frequently-used facts from cleanup** — the cleanup job now rescues facts with `useCount >= 3` from the low-confidence rule. A fact that has been recalled and used three or more times is load-bearing for the user even if its original extraction confidence was low (Haiku tends to land 0.25–0.35), so deleting it on the next sweep is exactly wrong. Pattern-based rules (transient state, device spec, command echo, too-short content) are not rescued — useCount cannot immortalize actual garbage. Closes the gap that v1.0.21's threshold drop only narrowed.

## 1.0.21

- **Fix silent fact-forgetting** — the cleanup job was deleting every extracted fact within 6 hours because the garbage filter treated any fact with `confidence < 0.5` as low-confidence and purged it. Real-world extracted facts (Haiku) consistently land around 0.25–0.35, so the facts layer would silently wipe itself every cleanup cycle even while the user kept telling the assistant things worth remembering. Threshold lowered from 0.5 to 0.2 in `fact-patterns.ts`. Pattern-based filters (transient state, device specs, command echo, too-short content) still run and catch the actual garbage.

## 1.0.20

- **Shodh upgrade v0.1.91 → v0.2.0** — entity salience, NER-based filtering, curvature-weighted retrieval, causal lineage inference, glacial exponential decay, and MCP orphan process fix. Read paths dual-decode (postcard + legacy bincode), so existing memory data stays readable and gradually converts to the new format on natural writes — no user migration step required.
- **Run Shodh in production mode** — the Shodh server now launches with `--production` + `SHODH_API_KEYS`, removing the "DEVELOPMENT mode" security banner that was printed on every boot.
- **Pre-seed ONNX Runtime in image** — Shodh v0.2.0's first-boot ONNX download writes a broken `libonnxruntime.so` that causes `expected OrtGetApiBase` panics on NER init. The Docker image now pre-installs ONNX Runtime v1.23.2 at Shodh's cache path with the correct symlink, so first boot is clean and NER works without a restart cycle.

## 1.0.19

- **Reasoning-model fact extractor fix** — strips `<think>...</think>` blocks (Qwen3, DeepSeek-R1, etc.) before JSON parsing, and raises the extractor's `max_tokens` budget 500 → 1000 so reasoning models don't run out of budget inside their thinking phase. Empty responses now warn cleanly instead of throwing. Fact extraction no longer silently fails when using reasoning models.
- **Hard fork declaration** — `server/` is no longer treated as a synced copy of `home-mind`. Documentation updated to reflect that HomeMind PRO and the OSS `home-mind` are independent products; a fix that belongs in both must be applied twice, with intention.

## 1.0.18

- **Fix recall** — facts that were saved to memory but not being returned on recall (e.g. "what's my passkey?" answered with "I don't know" even though the fact existed under `/api/memory/{userId}`). Retrieval now always pulls the user's tagged fact set; proactive-context results are merged on top as a query-relevance boost and deduped. Bundles home-mind-server v0.15.0.
- Raise `MEMORY_TOKEN_LIMIT` default 1500 → 3000 so more facts fit in the system prompt by default (prompt caching makes the extra tokens essentially free).
- Add `[recall]` debug log under `LOG_LEVEL=debug` for diagnosing recall issues.

## 1.0.17

- Restructure configuration into clear Cloud and BYOK sections — no more overlapping fields
- Fix all "Home Mind" references to "HomeMind PRO" throughout docs and UI
- Restructure DOCS.md with separate Cloud and BYOK setup guides

## 1.0.16

- Pre-download MiniLM-L6-v2 ONNX model into Docker image — Shodh now uses full semantic search instead of falling back to hash-based embeddings

## 1.0.15

- When monthly usage limit is reached, show a persistent HA notification and return a clear spoken message instead of a generic error

## 1.0.14

- Auto-restart HA Core after integration install/update so discovery works without manual restart

## 1.0.13

- Fix auto-update: keep integration manifest version in sync with add-on version

## 1.0.12

- Modernise integration for HA 2026: use runtime_data, ConfigFlowResult, typed HassioServiceInfo
- Fix device name showing as "Home Mind" instead of "HomeMind PRO"
- Fix error responses leaking internal details to voice/text output
- Remove broken is_voice heuristic

## 1.0.11

- Fix integration auto-discovery: add `hassio` field to manifest.json so HA Core routes Supervisor discovery to our config flow

## 1.0.10

- Fix Supervisor discovery: wrap host/port in `config` key per HA API spec
- Fix config_flow: skip connectivity check during hassio discovery (HA Core → add-on routing not available at config time)

## 1.0.9

- Bump bundled server to v0.14.0 (auto-detect language, OpenRouter attribution, Shodh v0.1.91, security hardening)
- Fix conversation agent entity name to "HomeMind PRO" in Assist

## 1.0.8

- Rename integration display name to "HomeMind PRO" throughout the HA UI

## 1.0.7

- Add GitHub Actions CI/CD — builds and pushes multi-arch images on every push to master
- Pre-built images published to `ghcr.io/hoornet/homemind-pro-{arch}` (amd64 + aarch64)
- config.yaml now references pre-built GHCR images — faster installs, no local Docker build on HA
- GHA build cache per arch reduces incremental build times

## 1.0.6

- Fix config validation error when `llm_base_url` is empty (HA rejects empty string as invalid URL)

## 1.0.5

- Add OpenRouter as a first-class LLM provider option (no more "openai" workaround)
- Cloud mode now talks to the model endpoint directly (replaces old metering proxy)
- Default model for OpenRouter: `anthropic/claude-haiku-4.5`
- Updated config descriptions with OpenRouter model ID examples

## 1.0.4

- Auto-install Home Mind HA integration on startup — no HACS required
- Bundled integration files are copied to `/config/custom_components/home_mind/`
- Auto-updates when a newer version is bundled
- Truly one-click install: add-on handles everything

## 1.0.3

- Fix HA API 401 errors — use Supervisor internal proxy (`http://supervisor/core`) instead of direct HA access
- Add-ons must route HA API calls through the Supervisor, not directly to `homeassistant:8123`

## 1.0.2

- Add diagnostics for Supervisor token injection
- Confirmed SUPERVISOR_TOKEN is present (112 chars) — issue was routing, not auth

## 1.0.1

- Fix Shodh startup failure — call `shodh server` binary directly instead of wrapper script
- Fix Dockerfile for HA Supervisor build context (clone server from GitHub at build time)
- Remove pre-built image reference (local builds only until CI/CD is set up)

## 1.0.0

- Initial release
- Bundles home-mind-server + Shodh Memory in a single HA add-on
- Two LLM modes: Cloud (managed proxy) and BYOK (bring your own key)
- Supports Anthropic, OpenAI, and Ollama providers
- Persistent conversation history (SQLite)
- Cognitive memory with semantic search (Shodh)
- Automatic HA integration via Supervisor API (no manual URL/token config)
- Memory leak watchdog for Shodh (auto-restart at 512MB RSS)
- Architectures: amd64, aarch64 (RPi4/5)
