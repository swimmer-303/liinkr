# liinkr

my own little url shortener. runs on firebase, all on the free plan. lives at
link.spencerhedges.com

## how it works

- the root page is the admin thing where i make short links. its locked behind
  google sign in and only my account gets in.
- visiting link.spencerhedges.com/somecode serves a tiny page that looks the code
  up in firestore and bounces you to wherever it points.
- if the code doesnt exist you get sent to spencerhedges.com/fwd/

no cloud functions so it stays free, the redirect just happens in the browser.

## bits

- `public/index.html` + `app.js` - the admin page (plain html/js, no framework)
- `public/r.html` - the redirect page everything-thats-not-the-root falls through to
- `public/config.js` - firebase web config
- `firestore.rules` - anyone can read a single code, only i can make/change them

## running it locally

```
firebase emulators:start
```

## deploy

```
firebase deploy
```
