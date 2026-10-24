# End-of-run scoreboard

Victory and defeat results show party DPS and effective healing. Choose **Run stats** to open the per-character table: Damage, DPS, Healing, Damage taken and Deaths, ordered by damage. The character currently controlled by this player is marked **YOU**. Close, Play again and Back to start remain visible outside the scrolling statistics area; online runs retain Back to arena and Leave party. Dismissing the dialog leaves Results available to reopen it.

The glass styling remains. The default results card stays compact; the expanded board is at most 640 pixels wide. Small screens can scroll the table horizontally and long/short viewports scroll the content while exit controls remain fixed within the card. The disclosure is a regular button usable by keyboard, touch and controller navigation. Focus the table region and use left/right to scroll columns when they overflow; up/down continues between controls.

Totals come from the authoritative simulation, not the short combat log. Damage counts actual enemy HP removed, including extra hits, skillchains, magic bursts and multi-hit techniques. Healing counts HP actually restored. Damage taken counts HP lost after mitigation; a blocked or evaded hit contributes zero. DPS divides damage by recorded encounter time; local pause time is excluded. Party DPS uses the same duration as every character. Deaths include Coherence Collapse.

New encounters record the full run. Older saves that predate tracking cannot recover missing history: resumed runs are marked **Recorded since resume**, and an older already-finished run says statistics are unavailable instead of presenting fabricated zero totals. The board is for the current run; it is not a historical archive or public leaderboard.

Engine, persistence and rate-calculation checks are recorded separately in the build receipt. Physical phone/controller testing and full 3D visual checks require suitable hardware; the QA browser may lack WebGL.
