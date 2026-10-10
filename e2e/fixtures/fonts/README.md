# Test fonts

Copies of the Latin and Latin Extended subsets of the three fonts Florence
loads from Google Fonts: Fraunces, Instrument Sans and IBM Plex Mono. The
end-to-end tests serve these in place of the Google Fonts requests
(`e2e/support/fixtures.ts`), so screenshots don't depend on the network.

All three are licensed under the SIL Open Font License 1.1
(<https://openfontlicense.org>); the copyright and licence notices are in
each file's metadata. `fonts.css` is the stylesheet Google Fonts returns for
the URL in `src/routes/__root.tsx`, limited to those two subsets. If that URL
changes, download the new stylesheet and files and update the screenshots.
