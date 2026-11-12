# 5분 단타왕 공식 게임 운영 준비

- Web source: `games/scalping-king`. Android packages the same engine at build time.
- Official mode remains disabled while `official-config.js` has an empty project URL or publishable key.
- Apply the migration only to the dedicated game project. Existing substation and paused projects require no changes.
- Configure verified email login and a production SMTP sender before public signup. Set the public site redirect and confirm sign-in on Android after email verification.
- Deploy the `scalping-king` Edge Function with its Supabase config. Configure the allowed web origin and Android WebView origin.
- Keep the service role key in Supabase. Use an independent random maintenance bearer token in Supabase and GitHub, with the function base URL in the GitHub variable. Set the optional ntfy URL to a game-specific HTTPS destination.
- Configure four AdMob SSV placements. The app waits for a server-verified transaction. The browser has no production rewarded provider configured.
- Official sessions use a hidden per-round entropy key. They receive current and past market data only, and all scored orders are replayed against the server's clock and ledger. The public market code identifies the initial scene. Official accounts use email sign-in, so multiple distinct verified accounts remain possible.
- Each active official session polls about once per second. Track Edge invocations and egress along with database storage, auth MAU and API request counts before opening the game broadly.
- GitHub Actions cron runs on the default branch. Test the maintenance RPC with an explicit manual run, then observe the first scheduled success and recovery alerts before marking operations verified.
