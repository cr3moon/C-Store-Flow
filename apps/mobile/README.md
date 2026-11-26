# C-Store-Flow mobile (iOS and Android)

Expo (React Native) skeleton. **Not installed or built in CI yet** (see `docs/gaps.md`). It sits outside the root npm workspaces so the Expo toolchain doesn't slow down every install.

```sh
cd apps/mobile
npm install
npx expo install --fix            # aligns versions to the installed Expo SDK
npx expo start                    # scan the QR with Expo Go on your phone
```

Set `extra.apiUrl` in `app.json` to your computer's LAN address (not `localhost`) when testing on a real phone.

Store builds: EAS Build (`npx eas build -p ios` / `-p android`) once the Apple and Google developer accounts exist.
