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

each redirect also logs a little click event (timestamp, referrer, browser, language,
timezone) straight to firestore from the visitors browser via sendBeacon, so it goes
out even while the page is bouncing away. the admin page has a "stats" button on every
link that pulls those up - clicks over the last 30 days, top referrers, browser/os
split, that kind of thing. still no server, just the browser writing to firestore.

## bits

- `public/index.html` + `app.js` - the admin page (plain html/js, no framework)
- `public/r.html` - the redirect page everything-thats-not-the-root falls through to
- `public/config.js` - firebase web config
- `firestore.rules` - anyone can read a single code + log a click, only i can make/change links or read the click log

## running it locally

```
firebase emulators:start
```

## deploy

```
firebase deploy
```
