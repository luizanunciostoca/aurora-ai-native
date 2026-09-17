# Preview smoke gate

The interactive preview is considered installable only after its own exact-head CI is green and a preview APK is packaged from that exact head. This preview smoke gate is not W15-J/DP5 acceptance.

Minimum physical smoke checks:

1. install/read back the exact preview APK;
2. launch Home without crash;
3. manual `Falar com Aurora` opens bounded STT;
4. transcript appears in the conversational surface;
5. unavailable requests return safe user-facing fallback;
6. with the governed LOCAL runtime composed, `aumentar volume` follows W07 and the existing W15-J executor path;
7. TTS response completes without self-wake;
8. return to Home preserves the last transcript/response and re-arms wake when configured.
