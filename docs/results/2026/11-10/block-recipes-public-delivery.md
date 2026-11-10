# Block recipe public delivery

The [focused acceptance](block-recipe-checks.md) is now delivered from accepted
source `c265eeb3df41608f567443df4b7821d468a05f7e`. Its application code is the
checked `a0d3f97f`; the accepted tree adds only verified generated output,
original evidence and acceptance metadata. All ten attempted sources and the
temporary workflow source remain parents of the accepted commit.

The [public release](https://github.com/alvarovillalbaa/mcpcn-ui/releases/tag/v0.1.0-block-recipes.1)
is release440433040, published at14:00:03UTC on10November2026. Its tag resolves
to the exact accepted commit. All nine actual checked archives were uploaded to
a draft, then verified for exact names, sizes and server SHA256 digests before
publication and verified again afterward:663917bytes total. No archive was
regenerated. The portable source archive remains140717bytes with SHA256
`13eb3fddc4e4ae6b36202db154cf35a30659af5534bdba2d117e7ef4f0c2f254`.
The release shortcut failed before creation; an inspected absent release was
then created, uploaded and published through REST without a duplicate release.

Production deployment `dpl_3EgJCehEbT9BQrWFk7tMkjDscU9b` reached READY with the
accepted Git SHA in the existing MCPCN project. The canonical
[recipe guide](https://mcpcn-ui.vercel.app/docs/block-recipes) and
[block gallery](https://mcpcn-ui.vercel.app/blocks) resolve to that deployment.
The [safe provider receipt](block-recipes-public-delivery.json) records the
project/deployment/alias binding and exact release assets without credentials.

All26actual anonymous HTTPS requests returned200 with verified TLS and no
redirect:two HTML pages,eleven canonical block JSON payloads,eleven original
previews,the preview manifest and one preserved compact component response.
All24data payloads match the accepted owner bytes; the existing component keeps
its compact serialization. The [response originals](block-recipes-public-originals/curl-results.json)
retain26headers,twoHTML bodies and transfer metrics. The
[body verification](block-recipes-public-originals/body-verification.json)
binds each payload hash to its canonical file; duplicate payload bodies were
verified before removal. This is HTTP delivery evidence,not a hosted browser
or external-host SDK acceptance claim. An initial local data-verifier assertion
used the wrong guide title; its correction inspected the existing response and
owner title. No new request or application change was required.

Workflow413253158 was disabled with HTTP204 and read back disabled_manually
before its definition was removed. Its subsequent registration reads deleted.
Only the ten owned QA refs were retired, atomically with exact per-ref leases,
after ancestry verification; the matching-ref readback is zero. Permanent CI
remains unchanged. The [duplicate cleanup](block-recipes-cleanup.json) verified
canonical Git blobs and removed1143transfer/index copies/51398446bytes and11
owned directories. All nine failed packets and the passing originals remain.

Full copied-source NodeNext, external host/live authorization, public npm,
native devices and complete accessibility/quality/adoption remain open. No
production Auth/provider/model/payment, real user data, new account, paid plan
or local heavy application runtime was used. Previous accepted cohorts remain
closed; do not rerun them as part of documentation closure.
